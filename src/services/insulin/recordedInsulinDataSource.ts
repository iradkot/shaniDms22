import {
  fetchTreatmentsForDateRangeWithMetadata,
  type NightscoutRangeResult,
} from '../../api/apiRequests';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';
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

export interface RecordedDailyInsulinBundle {
  readonly current: DailyInsulinSourceSummary;
  readonly comparison: DailyInsulinComparisonPresentation;
}
export interface RecordedInsulinDataSource {
  loadWindow(period: DailyOverviewPeriod): Promise<DailyInsulinSourceSummary>;
  loadDailyBundle(
    request: DailyInsulinComparisonRequest,
  ): Promise<RecordedDailyInsulinBundle>;
}
export interface RecordedInsulinDataSourceDependencies {
  readonly fetchTreatments: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<Record<string, unknown>>>;
  readonly getScopeKey: () => string;
  readonly now?: () => number;
}

/** All native callers share one account-scoped raw treatment snapshot. */
export const createRecordedInsulinDataSource = (
  dependencies: RecordedInsulinDataSourceDependencies,
): RecordedInsulinDataSource => {
  const now = dependencies.now ?? Date.now;
  const snapshots = new Map<
    string,
    {
      expiresAt: number;
      promise: Promise<readonly Record<string, unknown>[] | undefined>;
    }
  >();
  let activeScope: string | undefined;
  const snapshot = async (
    day: DailyOverviewPeriod,
  ): Promise<readonly Record<string, unknown>[] | undefined> => {
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
          return result.freshness.kind === 'fresh' ? result.records : undefined;
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
      const records = await snapshot(getLocalDayPeriod(period.startMs));
      return records === undefined
        ? {quality: 'unavailable'}
        : buildRecordedInsulinSummary(records, period, now());
    },
    async loadDailyBundle(request) {
      const windows = getDailyInsulinComparisonWindows(request);
      const records = await snapshot(request.period);
      const observedAtMs = now();
      const summarize = (
        period: DailyOverviewPeriod,
      ): DailyInsulinSourceSummary =>
        records === undefined
          ? {quality: 'unavailable'}
          : buildRecordedInsulinSummary(records, period, observedAtMs);
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

export const recordedInsulinDataSource = createRecordedInsulinDataSource({
  fetchTreatments: fetchTreatmentsForDateRangeWithMetadata,
  getScopeKey: () =>
    `${
      getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
    }:${getNightscoutConfigurationRevision()}`,
});
