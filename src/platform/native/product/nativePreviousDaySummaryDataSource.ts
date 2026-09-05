import type {
  PreviousDaySummaryDataSource,
  PreviousDaySummaryEvent,
  PreviousDaySummaryInsulinSource,
} from '../../../modules/previousDaySummary';
import type {TrendsDataSource} from '../../../modules/trends';
import type {DayGraphTimelineItem} from '../../../modules/dayGraph';
import {
  createNativeDailyInsulinSummaryLoader,
  type NativeDailyInsulinSummaryLoader,
} from './nativeDailyOverviewDataSource';
import {
  createNativeDayGraphTimelineLoader,
  type NativeDayGraphDataSourceDependencies,
  type NativeDayGraphTimelineLoader,
} from './nativeDayGraphDataSource';
import {createNativeTrendsDataSource} from './nativeTrendsDataSource';

export interface NativePreviousDaySummaryDataSourceDependencies {
  readonly glucoseDataSource?: TrendsDataSource;
  readonly loadInsulinSummary?: NativeDailyInsulinSummaryLoader;
  readonly loadTimelineItems?: NativeDayGraphTimelineLoader;
  readonly timelineDependencies?: NativeDayGraphDataSourceDependencies;
}

const toPreviousDayEvent = (
  item: DayGraphTimelineItem,
): PreviousDaySummaryEvent => {
  const id = `${item.identity.sourceId}:${item.identity.recordId}`;
  switch (item.kind) {
    case 'journal-meal':
      return {
        id,
        kind: 'meal',
        timestampMs: item.timestampMs,
        title: item.title,
        ...(item.detail === undefined
          ? item.carbohydratesGrams === undefined
            ? {}
            : {detail: `${item.carbohydratesGrams} g`}
          : {detail: item.detail}),
      };
    case 'external-carb':
      return {
        id,
        kind: 'treatment',
        timestampMs: item.timestampMs,
        title: item.title,
        ...(item.detail === undefined
          ? item.carbohydratesGrams === undefined
            ? {}
            : {detail: `${item.carbohydratesGrams} g`}
          : {detail: item.detail}),
      };
    case 'journal-activity':
      return {
        id,
        kind: 'activity',
        timestampMs: item.timestampMs,
        title: item.title,
        ...(item.detail === undefined ? {} : {detail: item.detail}),
      };
    case 'treatment':
      return {
        id,
        kind: 'treatment',
        timestampMs: item.timestampMs,
        title: item.title,
        ...(item.detail === undefined ? {} : {detail: item.detail}),
      };
  }
};

/**
 * Composes the summary from shared read seams without issuing a second glucose
 * request. Optional insulin or timeline failures never erase valid CGM data.
 */
export const createNativePreviousDaySummaryDataSource = (
  dependencies: NativePreviousDaySummaryDataSourceDependencies = {},
): PreviousDaySummaryDataSource => {
  const glucoseDataSource =
    dependencies.glucoseDataSource ?? createNativeTrendsDataSource();
  const loadInsulinSummary =
    dependencies.loadInsulinSummary ??
    createNativeDailyInsulinSummaryLoader();
  const loadTimelineItems =
    dependencies.loadTimelineItems ??
    createNativeDayGraphTimelineLoader(
      dependencies.timelineDependencies ?? {},
    );

  const safeInsulin = async (
    start: Date,
    end: Date,
  ): Promise<PreviousDaySummaryInsulinSource> => {
    try {
      return await loadInsulinSummary(start, end);
    } catch {
      return {quality: 'unavailable'};
    }
  };

  const safeEvents = async (period: {
    readonly startMs: number;
    readonly endMs: number;
  }): Promise<readonly PreviousDaySummaryEvent[]> => {
    try {
      const items = await loadTimelineItems({
        dayStartMs: period.startMs,
        dayEndMs: period.endMs,
      });
      return items.map(toPreviousDayEvent);
    } catch {
      return [];
    }
  };

  return {
    async loadPreviousDaySummary(period) {
      const start = new Date(period.startMs);
      const end = new Date(period.endMs);
      const [glucoseSamples, insulinSummary, events] = await Promise.all([
        glucoseDataSource.loadGlucoseSamples(period),
        safeInsulin(start, end),
        safeEvents(period),
      ]);
      return {glucoseSamples, insulinSummary, events};
    },
  };
};
