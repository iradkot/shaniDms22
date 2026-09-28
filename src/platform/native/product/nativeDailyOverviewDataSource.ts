import type {
  DailyInsulinComparisonRequest,
  DailyInsulinSourceSummary,
  DailyOverviewDataSource,
} from '../../../modules/dailyOverview';
import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
} from '../../../modules/dailyOverview';
import type {TrendsDataSource} from '../../../modules/trends';
import {
  recordedInsulinDataSource,
  type RecordedDailyInsulinBundle,
  type RecordedInsulinDataSource,
} from '../../../services/insulin/recordedInsulinDataSource';
import {isE2E} from '../../../utils/e2e';
import {createNativeTrendsDataSource} from './nativeTrendsDataSource';

export interface NativeDailyInsulinSummaryDependencies {
  readonly sourceRevision?: string;
  readonly recordedDataSource?: RecordedInsulinDataSource;
  readonly useE2EFixtures?: boolean;
}
export interface NativeDailyInsulinSummaryLoader {
  (start: Date, end: Date): Promise<DailyInsulinSourceSummary>;
  readonly loadDailyBundle?: (
    request: DailyInsulinComparisonRequest,
  ) => Promise<RecordedDailyInsulinBundle>;
}
export interface NativeDailyOverviewDataSourceDependencies
  extends NativeDailyInsulinSummaryDependencies {
  readonly glucoseDataSource?: TrendsDataSource;
  readonly loadInsulinSummary?: NativeDailyInsulinSummaryLoader;
  readonly now?: () => number;
}

/** The shared raw-treatment loader never fetches or fills from a basal profile. */
export const createNativeDailyInsulinSummaryLoader = (
  dependencies: NativeDailyInsulinSummaryDependencies = {},
): NativeDailyInsulinSummaryLoader => {
  const source = dependencies.recordedDataSource ?? recordedInsulinDataSource;
  const useFixtures = dependencies.useE2EFixtures ?? isE2E;
  const load: NativeDailyInsulinSummaryLoader = async (start, end) => {
    if (useFixtures || end.getTime() <= start.getTime()) {
      return {quality: 'unavailable'};
    }
    try {
      return await source.loadWindow({
        startMs: start.getTime(),
        endMs: end.getTime(),
      });
    } catch {
      return {quality: 'unavailable'};
    }
  };
  return Object.assign(load, {
    loadDailyBundle: async (
      request: DailyInsulinComparisonRequest,
    ): Promise<RecordedDailyInsulinBundle> => {
      if (!useFixtures) {
        try {
          return await source.loadDailyBundle(request);
        } catch {
          /* Preserve independent CGM data. */
        }
      }
      return {
        current: {quality: 'unavailable'},
        comparison: buildDailyInsulinComparison(
          getDailyInsulinComparisonWindows(request),
          [],
        ),
      };
    },
  });
};

export const createNativeDailyOverviewDataSource = (
  dependencies: NativeDailyOverviewDataSourceDependencies = {},
): DailyOverviewDataSource => {
  const glucoseDataSource =
    dependencies.glucoseDataSource ?? createNativeTrendsDataSource();
  const loadInsulinSummary =
    dependencies.loadInsulinSummary ??
    createNativeDailyInsulinSummaryLoader(dependencies);
  const now = dependencies.now ?? Date.now;
  const loadSummary = async (
    startMs: number,
    endMs: number,
  ): Promise<DailyInsulinSourceSummary> => {
    if (endMs <= startMs) {
      return {quality: 'unavailable'};
    }
    try {
      return await loadInsulinSummary(new Date(startMs), new Date(endMs));
    } catch {
      return {quality: 'unavailable'};
    }
  };
  return {
    async loadDailyOverview(period, options) {
      const cutoff = Math.min(period.endMs, options?.asOfMs ?? now());
      const [glucoseSamples, insulinSummary] = await Promise.all([
        cutoff > period.startMs
          ? glucoseDataSource.loadGlucoseSamples({...period, endMs: cutoff})
          : Promise.resolve([]),
        loadSummary(period.startMs, cutoff),
      ]);
      return {glucoseSamples, insulinSummary};
    },
    async loadDailyInsulinComparison(request) {
      if (loadInsulinSummary.loadDailyBundle) {
        return (await loadInsulinSummary.loadDailyBundle(request)).comparison;
      }
      // Keep explicitly injected callers compatible without changing the production transport.
      const windows = getDailyInsulinComparisonWindows(request);
      const previous: DailyInsulinSourceSummary[] = [];
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < windows.previousDays.length) {
          const index = next++;
          const period = windows.previousDays[index];
          if (period) {
            previous[index] = await loadSummary(period.startMs, period.endMs);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      return buildDailyInsulinComparison(windows, previous);
    },
  };
};
