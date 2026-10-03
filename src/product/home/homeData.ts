import {
  buildDailyOverview,
  getLocalDayPeriod,
  localDayStart,
  moveLocalDay,
  type DailyInsulinSummary,
  type DailyOverview,
  type DailyOverviewDataSource,
  type DailyOverviewSourceSnapshot,
} from '../../modules/dailyOverview';
import {
  buildDayGraph,
  DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS,
  type DayGraphModel,
} from '../../modules/dayGraph';
import {
  buildTrendsOverview,
  prepareTrendsSampleSet,
  type TrendsCoverageQuality,
  type TrendsDataSource,
  type TrendsGlucoseSample,
  type TrendsPeriod,
  type TrendsRangeThresholds,
} from '../../modules/trends';

export type HomeDataWidgetId =
  | 'glucose-graph'
  | 'time-in-range'
  | 'daily-insulin'
  | 'weekly-glucose'
  | 'weekly-insulin'
  | 'chat';

export type HomeLaneState<T> =
  | {readonly kind: 'loading' | 'error'}
  | {readonly kind: 'unavailable'; readonly reason: 'hidden' | 'source'}
  | {
      readonly kind: 'ready';
      readonly data: T;
      readonly refreshing: boolean;
      readonly refreshFailed: boolean;
    };

export interface HomeTodayData {
  /** Full local calendar day, suitable for the chart's horizontal domain. */
  readonly period: TrendsPeriod;
  /** Actual loaded interval. Insulin never includes future scheduled basal. */
  readonly observedPeriod: TrendsPeriod;
  readonly overview: DailyOverview;
  /** Unlike overview.coveragePercent, the denominator ends at the load time. */
  readonly elapsedCoverage: {
    readonly coveragePercent: number;
    readonly coverageQuality: TrendsCoverageQuality;
    readonly validSampleCount: number;
    readonly expectedSampleCount: number;
  };
  readonly glucose: DayGraphModel;
}

export interface HomeWeeklyGlucoseData {
  readonly period: TrendsPeriod;
  /** Seven completed local days, oldest first. Empty days remain explicit. */
  readonly days: readonly {
    readonly period: TrendsPeriod;
    readonly overview: DailyOverview;
  }[];
}

export type HomeWeeklyInsulinDay =
  | {
      readonly period: TrendsPeriod;
      readonly kind: 'ready';
      readonly insulinSummary: Extract<
        DailyInsulinSummary,
        {quality: 'available'}
      >;
    }
  | {readonly period: TrendsPeriod; readonly kind: 'unavailable' | 'error'};

export interface HomeWeeklyInsulinData {
  readonly period: TrendsPeriod;
  /** Missing days must be rendered as gaps, never as zero insulin. */
  readonly days: readonly HomeWeeklyInsulinDay[];
}

export interface HomeDataSources {
  readonly dailyOverview?: DailyOverviewDataSource;
  readonly trends?: TrendsDataSource;
}

export const HOME_SAMPLE_INTERVAL_MS = 5 * 60_000;
export const HOME_TODAY_REFRESH_MS = 5 * 60_000;

export const getHomeCompletedWeekPeriod = (nowMs: number): TrendsPeriod => {
  const endMs = localDayStart(nowMs);
  return {startMs: moveLocalDay(endMs, -7), endMs};
};

const completedDays = (period: TrendsPeriod): readonly TrendsPeriod[] =>
  Array.from({length: 7}, (_, index) =>
    getLocalDayPeriod(moveLocalDay(period.startMs, index)),
  );

/** Keep one authoritative interpretation of duplicate readings and data gaps. */
export const buildHomeTodayData = (input: {
  readonly period: TrendsPeriod;
  readonly observedEndMs: number;
  readonly source: DailyOverviewSourceSnapshot;
  readonly thresholds: TrendsRangeThresholds;
}): HomeTodayData => {
  const observedPeriod = {
    startMs: input.period.startMs,
    endMs: Math.max(
      input.period.startMs,
      Math.min(input.observedEndMs, input.period.endMs),
    ),
  };
  const hasElapsedTime = observedPeriod.endMs > observedPeriod.startMs;
  // Some native range transports include their end boundary. Product reads do not.
  const glucoseSamples = input.source.glucoseSamples.filter(
    sample => sample.timestampMs < observedPeriod.endMs,
  );
  const source: DailyOverviewSourceSnapshot = {
    glucoseSamples,
    insulinSummary: hasElapsedTime
      ? input.source.insulinSummary
      : {quality: 'unavailable'},
  };
  const overview = buildDailyOverview({
    period: input.period,
    source,
    thresholds: input.thresholds,
    expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
  });
  const prepared = prepareTrendsSampleSet({
    period: input.period,
    samples: glucoseSamples,
    expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
  });
  const elapsed = hasElapsedTime
    ? buildTrendsOverview({
        period: observedPeriod,
        samples: glucoseSamples,
        thresholds: input.thresholds,
        expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
      })
    : undefined;
  return {
    period: input.period,
    observedPeriod,
    overview,
    elapsedCoverage: {
      coveragePercent: elapsed?.coveragePercent ?? 0,
      coverageQuality: elapsed?.coverageQuality ?? 'no-data',
      validSampleCount: elapsed?.validSampleCount ?? 0,
      expectedSampleCount: elapsed?.expectedSampleCount ?? 0,
    },
    glucose: buildDayGraph({
      period: {
        dayStartMs: input.period.startMs,
        dayEndMs: input.period.endMs,
      },
      expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
      glucoseSamples: prepared.validSamples.map(sample => ({
        ...sample,
        identity: {
          sourceId: 'home-glucose',
          recordId: String(sample.timestampMs),
        },
      })),
      timelineItems: [],
      dataAvailability: {
        treatments: 'unavailable',
        deviceStatus: 'unavailable',
        profile: 'unavailable',
      },
    }),
  };
};

export const buildHomeWeeklyGlucoseData = (
  period: TrendsPeriod,
  samples: readonly TrendsGlucoseSample[],
  thresholds: TrendsRangeThresholds,
): HomeWeeklyGlucoseData => ({
  period,
  days: completedDays(period).map(day => ({
    period: day,
    overview: buildDailyOverview({
      period: day,
      expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
      thresholds,
      source: {
        glucoseSamples: samples.filter(
          sample =>
            sample.timestampMs >= day.startMs && sample.timestampMs < day.endMs,
        ),
        insulinSummary: {quality: 'unavailable'},
      },
    }),
  })),
});

/** Daily profiles and basal carry-in remain owned by the existing source. */
export const loadHomeWeeklyInsulinData = async (
  source: DailyOverviewDataSource,
  period: TrendsPeriod,
  isCurrent: () => boolean = () => true,
): Promise<HomeWeeklyInsulinData> => {
  const periods = completedDays(period);
  const days: HomeWeeklyInsulinDay[] = [];
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (isCurrent() && nextIndex < periods.length) {
      const index = nextIndex++;
      const day = periods[index]!;
      try {
        const snapshot = await source.loadDailyOverview(day);
        if (!isCurrent()) {
          return;
        }
        const {insulinSummary} = buildDailyOverview({
          period: day,
          source: {glucoseSamples: [], insulinSummary: snapshot.insulinSummary},
          expectedSampleIntervalMs: HOME_SAMPLE_INTERVAL_MS,
          thresholds: DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS,
        });
        days[index] =
          insulinSummary.quality === 'available'
            ? {period: day, kind: 'ready', insulinSummary}
            : {period: day, kind: 'unavailable'};
      } catch {
        if (!isCurrent()) {
          return;
        }
        days[index] = {period: day, kind: 'error'};
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (!isCurrent()) {
    throw new Error('The home data request is no longer current.');
  }
  return {period, days};
};
