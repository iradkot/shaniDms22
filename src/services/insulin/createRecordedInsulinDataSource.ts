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
import {
  buildEstimatedBasalUnits,
  type EstimatedBasalProfile,
} from './estimatedBasal';

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
export interface DailyInsulinLoadOptions {
  readonly includeEstimates?: boolean;
}
export interface RecordedBasalProfileRange {
  readonly profile?: EstimatedBasalProfile;
  readonly freshness: RecordedTreatmentRange['freshness'];
}
export interface RecordedInsulinDataSource {
  /** Summarize a finite, nonempty [startMs, endMs) window, including multiple days. */
  loadWindow(
    period: DailyOverviewPeriod,
    options?: DailyInsulinLoadOptions,
  ): Promise<DailyInsulinSourceSummary>;
  /** Current day and seven prior days at matching local-time cutoffs. */
  loadDailyBundle(
    request: DailyInsulinComparisonRequest,
    options?: DailyInsulinLoadOptions,
  ): Promise<RecordedDailyInsulinBundle>;
}
export interface RecordedInsulinDataSourceDependencies {
  /** Inclusive bounds; transport must return the entire range or mark it incomplete. */
  readonly fetchTreatments: (
    start: Date,
    end: Date,
  ) => Promise<RecordedTreatmentRange>;
  /** Schedule effective at start, verified unchanged through the second instant. */
  readonly fetchBasalProfile?: (
    asOf: Date,
    through: Date,
  ) => Promise<RecordedBasalProfileRange>;
  /** Account identity and configuration revision, checked again after reads. */
  readonly getScopeKey: () => string;
  readonly now?: () => number;
}

interface TreatmentSnapshot {
  readonly records: readonly Record<string, unknown>[];
  readonly observedAtMs: number;
  readonly scope: string;
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
 * account identity. Recorded facts always retain their original quality. Daily
 * callers may opt into a separate profile-based estimate of uncovered basal.
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
  const profiles = new Map<
    string,
    {expiresAt: number; promise: Promise<EstimatedBasalProfile | undefined>}
  >();
  const assertScope = (scope: string): void => {
    if (dependencies.getScopeKey() !== scope) {
      throw new Error(
        'Insulin source changed while loading recorded treatments.',
      );
    }
  };
  const profileAt = async (
    asOfMs: number,
    endMs: number,
    scope: string,
  ): Promise<EstimatedBasalProfile | undefined> => {
    assertScope(scope);
    if (!dependencies.fetchBasalProfile) {
      return undefined;
    }
    // Historical days are closed. Check their complete profile history once,
    // so later cutoffs can safely reuse a day with an unchanged schedule.
    const throughMs =
      asOfMs < getLocalDayPeriod(now()).startMs
        ? getLocalDayPeriod(asOfMs).endMs - 1
        : endMs - 1;
    const key = `${scope}:${asOfMs}:${throughMs}`;
    let cached = profiles.get(key);
    if (!cached || cached.expiresAt <= now()) {
      const promise = (async () => {
        try {
          const response = await dependencies.fetchBasalProfile!(
            new Date(asOfMs),
            new Date(throughMs),
          );
          assertScope(scope);
          return response.freshness.kind === 'fresh' &&
            Number.isFinite(response.freshness.fetchedAtMs)
            ? response.profile
            : undefined;
        } catch {
          assertScope(scope);
          return undefined;
        }
      })();
      const entry = {expiresAt: Number.POSITIVE_INFINITY, promise};
      profiles.set(key, entry);
      promise
        .then(profile => {
          if (profiles.get(key) === entry) {
            entry.expiresAt =
              now() +
              (profile && asOfMs < getLocalDayPeriod(now()).startMs
                ? 6 * 3_600_000
                : 60_000);
          }
        })
        .catch(() => {});
      cached = entry;
      while (profiles.size > 32) {
        profiles.delete(profiles.keys().next().value!);
      }
    }
    const profile = await cached.promise;
    assertScope(scope);
    return profile;
  };
  const snapshot = async (
    period: DailyOverviewPeriod,
    minimumObservedAtMs?: number,
  ): Promise<TreatmentSnapshot | undefined> => {
    const day = calendarEnvelope(period);
    const scope = dependencies.getScopeKey();
    if (activeScope !== scope) {
      snapshots.clear();
      profiles.clear();
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
                scope,
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
    if (
      records &&
      minimumObservedAtMs !== undefined &&
      records.observedAtMs < minimumObservedAtMs
    ) {
      // A newer cutoff needs a new observation; cached programmed doses cannot
      // prove what happened after they were fetched. Share the replacement read.
      if (snapshots.get(key) === cached) {
        snapshots.delete(key);
      }
      return snapshot(period);
    }
    return records;
  };
  const summarize = async (
    result: TreatmentSnapshot | undefined,
    period: DailyOverviewPeriod,
    options?: DailyInsulinLoadOptions,
  ): Promise<DailyInsulinSourceSummary> => {
    if (!result) {
      return {quality: 'unavailable'};
    }
    const recorded = buildRecordedInsulinSummary(
      result.records,
      period,
      result.observedAtMs,
    );
    if (
      !options?.includeEstimates ||
      recorded.quality !== 'partial' ||
      recorded.bolusUnits === undefined ||
      !dependencies.fetchBasalProfile
    ) {
      return recorded;
    }
    let cursor = period.startMs;
    let estimatedBasalUnits = 0;
    let days = 0;
    while (cursor < period.endMs) {
      // The estimator is intended for daily summaries, not unbounded history.
      if (++days > 31) {
        return recorded;
      }
      const endMs = Math.min(period.endMs, getLocalDayPeriod(cursor).endMs);
      const profile = await profileAt(cursor, endMs, result.scope);
      const units =
        profile &&
        buildEstimatedBasalUnits(
          result.records,
          {startMs: cursor, endMs},
          result.observedAtMs,
          profile,
        );
      if (units === undefined || !Number.isFinite(units) || units < 0) {
        return recorded;
      }
      estimatedBasalUnits += units;
      if (!Number.isFinite(estimatedBasalUnits)) {
        return recorded;
      }
      cursor = endMs;
    }
    assertScope(result.scope);
    const estimatedTotalUnits = estimatedBasalUnits + recorded.bolusUnits;
    if (!Number.isFinite(estimatedTotalUnits)) {
      return recorded;
    }
    return {
      ...recorded,
      estimatedBasalUnits,
      estimatedTotalUnits,
    };
  };
  return {
    async loadWindow(period, options) {
      const result = await snapshot(
        period,
        options?.includeEstimates ? Math.min(period.endMs, now()) : undefined,
      );
      return summarize(result, period, options);
    },
    async loadDailyBundle(request, options) {
      const windows = getDailyInsulinComparisonWindows(request);
      const result = await snapshot(
        request.period,
        options?.includeEstimates
          ? Math.min(windows.current.endMs, now())
          : undefined,
      );
      const current = await summarize(result, windows.current, options);
      const previous: DailyInsulinSourceSummary[] = [];
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < windows.previousDays.length) {
          const index = next++;
          const period = windows.previousDays[index];
          if (period) {
            previous[index] = await summarize(result, period, options);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      return {
        current,
        comparison: buildDailyInsulinComparison(windows, previous),
      };
    },
  };
};
