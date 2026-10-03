import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
  getLocalDayPeriod,
  moveLocalDay,
} from '../../modules/dailyOverview';
import type {
  DailyInsulinComparisonPresentation,
  DailyInsulinComparisonRequest,
  DailyInsulinSourceSummary,
  DailyOverviewPeriod,
} from '../../modules/dailyOverview';
import {buildRecordedInsulinSummary} from './recordedInsulin';

/** Complete treatment transport result with its original observation time. */
export interface RecordedTreatmentRange {
  readonly records: readonly Record<string, unknown>[];
  readonly complete?: boolean;
  readonly freshness: {
    readonly kind: 'fresh' | 'stale';
    readonly fetchedAtMs: number;
  };
}

export interface RecordedDailyInsulinBundle {
  readonly current: DailyInsulinSourceSummary;
  readonly comparison: DailyInsulinComparisonPresentation;
}
export interface RecordedInsulinDataSource {
  /** Summarize a finite, nonempty [startMs, endMs) window, including multiple days. */
  loadWindow(period: DailyOverviewPeriod): Promise<DailyInsulinSourceSummary>;
  /** Current day and seven prior days at matching local-time cutoffs. */
  loadDailyBundle(
    request: DailyInsulinComparisonRequest,
  ): Promise<RecordedDailyInsulinBundle>;
}
export interface RecordedInsulinDataSourceDependencies {
  /** Inclusive bounds; transport must return the entire range or mark it incomplete. */
  readonly fetchTreatments: (
    start: Date,
    end: Date,
  ) => Promise<RecordedTreatmentRange>;
  /** Account identity and configuration revision, checked again after reads. */
  readonly getScopeKey: () => string;
  readonly now?: () => number;
}

interface TreatmentSnapshot {
  readonly records: readonly Record<string, unknown>[];
  readonly observedAtMs: number;
}

const calendarEnvelope = (period: DailyOverviewPeriod): DailyOverviewPeriod => {
  if (
    !Number.isFinite(new Date(period.startMs).getTime()) ||
    !Number.isFinite(new Date(period.endMs).getTime()) ||
    period.endMs <= period.startMs
  ) {
    throw new Error('Recorded insulin requires a finite, nonempty time range.');
  }
  return {
    startMs: getLocalDayPeriod(period.startMs).startMs,
    endMs: getLocalDayPeriod(period.endMs - 1).endMs,
  };
};

/**
 * Platform-neutral recorded-insulin loader. Inject treatment transport and
 * account identity. This never requests a profile or fills gaps from a schedule.
 * Current-day and comparison callers share a nine-day snapshot and in-flight
 * request for 60 seconds. Wider windows include every requested calendar day.
 * Cached records retain their observation time: waiting cannot prove completion
 * of a dose that was unfinished when the records were fetched.
 */
export const createRecordedInsulinDataSource = (
  dependencies: RecordedInsulinDataSourceDependencies,
): RecordedInsulinDataSource => {
  const now = dependencies.now ?? Date.now;
  const snapshots = new Map<
    string,
    {
      expiresAt: number;
      promise: Promise<TreatmentSnapshot | undefined>;
    }
  >();
  let activeScope: string | undefined;
  const snapshot = async (
    period: DailyOverviewPeriod,
  ): Promise<TreatmentSnapshot | undefined> => {
    const day = calendarEnvelope(period);
    const scope = dependencies.getScopeKey();
    if (activeScope !== scope) {
      snapshots.clear();
      activeScope = scope;
    }
    const assertCurrent = (): void => {
      if (dependencies.getScopeKey() !== scope) {
        throw new Error(
          'Insulin source changed while loading recorded treatments.',
        );
      }
    };
    const key = `${scope}:${day.startMs}:${day.endMs}`;
    let cached = snapshots.get(key);
    if (!cached || cached.expiresAt <= now()) {
      const promise = (async () => {
        try {
          // Eight daily windows plus a carry-in day. No profile or device-status request.
          const result = await dependencies.fetchTreatments(
            new Date(moveLocalDay(day.startMs, -8)),
            new Date(day.endMs - 1),
          );
          assertCurrent();
          const observedAtMs = Math.min(result.freshness.fetchedAtMs, now());
          return result.freshness.kind === 'fresh' &&
            result.complete !== false &&
            Number.isFinite(observedAtMs)
            ? {
                records: result.records.map(record => ({...record})),
                observedAtMs,
              }
            : undefined;
        } catch {
          assertCurrent();
          return undefined;
        }
      })();
      cached = {expiresAt: Number.POSITIVE_INFINITY, promise};
      snapshots.set(key, cached);
      const entry = cached;
      promise
        .finally(() => {
          if (snapshots.get(key) === entry) {
            entry.expiresAt = now() + 60_000;
          }
        })
        .catch(() => {});
      while (snapshots.size > 4) {
        snapshots.delete(snapshots.keys().next().value!);
      }
    }
    const records = await cached.promise;
    assertCurrent();
    return records;
  };
  return {
    async loadWindow(period) {
      const result = await snapshot(period);
      return result === undefined
        ? {quality: 'unavailable'}
        : buildRecordedInsulinSummary(
            result.records,
            period,
            result.observedAtMs,
          );
    },
    async loadDailyBundle(request) {
      const windows = getDailyInsulinComparisonWindows(request);
      const result = await snapshot(request.period);
      const summarize = (
        period: DailyOverviewPeriod,
      ): DailyInsulinSourceSummary =>
        result === undefined
          ? {quality: 'unavailable'}
          : buildRecordedInsulinSummary(
              result.records,
              period,
              result.observedAtMs,
            );
      return {
        current: summarize(windows.current),
        comparison: buildDailyInsulinComparison(
          windows,
          windows.previousDays.map(summarize),
        ),
      };
    },
  };
};
