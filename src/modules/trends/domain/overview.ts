import {
  TrendsOverviewInputError,
  assertTrendsPeriod,
  prepareTrendsSampleSet,
} from './sampleSet';

export interface TrendsPeriod {
  readonly startMs: number;
  readonly endMs: number;
}

export interface TrendsGlucoseSample {
  readonly timestampMs: number;
  readonly valueMgDl: number;
}

export interface TrendsRangeThresholds {
  readonly veryLowMaxMgDl: number;
  readonly targetMinMgDl: number;
  readonly targetMaxMgDl: number;
  readonly highMaxMgDl: number;
}

export interface TrendsRangeDistribution {
  readonly veryLowPercent: number;
  readonly lowPercent: number;
  readonly targetPercent: number;
  readonly highPercent: number;
  readonly veryHighPercent: number;
}

export type TrendsCoverageQuality = 'no-data' | 'low' | 'adequate';
export type TrendsDurationQuality = 'short' | 'representative';
export type TrendsInterpretationQuality =
  | 'no-data'
  | 'partial'
  | 'representative';

export interface GlycemiaRiskIndex {
  readonly formulaVersion: 'gri-2022';
  readonly hypoglycemiaComponent: number;
  readonly hyperglycemiaComponent: number;
  readonly rawScore: number;
  readonly score: number;
}

export interface TrendsOverview {
  readonly period: TrendsPeriod;
  readonly thresholds: TrendsRangeThresholds;
  readonly timeZoneOffsetMinutes: number;
  readonly daysWithData: number;
  readonly validSampleCount: number;
  readonly excludedSampleCount: number;
  readonly duplicateSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly durationQuality: TrendsDurationQuality;
  readonly interpretationQuality: TrendsInterpretationQuality;
  readonly largestGapMs: number | undefined;
  readonly lastReadingTimestampMs: number | undefined;
  readonly ranges: TrendsRangeDistribution | undefined;
  readonly meanGlucoseMgDl: number | undefined;
  readonly gmiPercent: number | undefined;
  readonly gmiFormulaVersion: 'gmi-2018' | undefined;
  readonly gri: GlycemiaRiskIndex | undefined;
  readonly coefficientOfVariationPercent: number | undefined;
}

export interface BuildTrendsOverviewInput {
  readonly period: TrendsPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly samples: readonly TrendsGlucoseSample[];
  /** Fixed offset used to disclose and count local calendar days. */
  readonly timeZoneOffsetMinutes?: number;
}

export interface MatchedPeriodComparison {
  readonly current: TrendsOverview;
  readonly previous: TrendsOverview;
  readonly comparable: boolean;
  readonly deltas:
    | {
        readonly meanGlucoseMgDl: number;
        readonly gmiPercentagePoints: number;
        readonly veryLowRangePercentagePoints: number;
        readonly lowRangePercentagePoints: number;
        readonly targetRangePercentagePoints: number;
        readonly highRangePercentagePoints: number;
        readonly veryHighRangePercentagePoints: number;
        readonly coefficientOfVariationPercentagePoints: number;
      }
    | undefined;
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const normalizedTimeZoneOffset = (
  input: BuildTrendsOverviewInput,
): number => input.timeZoneOffsetMinutes ?? 0;

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new TrendsOverviewInputError(`${label} must be finite.`);
  }
};

const assertPeriod = (period: TrendsPeriod): void => {
  assertTrendsPeriod(period);
};

const assertThresholds = (thresholds: TrendsRangeThresholds): void => {
  const ordered = [
    thresholds.veryLowMaxMgDl,
    thresholds.targetMinMgDl,
    thresholds.targetMaxMgDl,
    thresholds.highMaxMgDl,
  ];
  ordered.forEach((value, index) =>
    assertFinite(value, `Range threshold ${index + 1}`),
  );
  if (
    ordered.some(value => value <= 0) ||
    !(
      ordered[0]! < ordered[1]! &&
      ordered[1]! < ordered[2]! &&
      ordered[2]! < ordered[3]!
    )
  ) {
    throw new TrendsOverviewInputError(
      'Glucose range thresholds must be positive and strictly increasing.',
    );
  }
};

const sameThresholds = (
  left: TrendsRangeThresholds,
  right: TrendsRangeThresholds,
): boolean =>
  left.veryLowMaxMgDl === right.veryLowMaxMgDl &&
  left.targetMinMgDl === right.targetMinMgDl &&
  left.targetMaxMgDl === right.targetMaxMgDl &&
  left.highMaxMgDl === right.highMaxMgDl;

const duration = (period: TrendsPeriod): number => period.endMs - period.startMs;

const classify = (
  valueMgDl: number,
  thresholds: TrendsRangeThresholds,
): keyof TrendsRangeDistribution => {
  if (valueMgDl < thresholds.veryLowMaxMgDl) {
    return 'veryLowPercent';
  }
  if (valueMgDl < thresholds.targetMinMgDl) {
    return 'lowPercent';
  }
  if (valueMgDl <= thresholds.targetMaxMgDl) {
    return 'targetPercent';
  }
  if (valueMgDl <= thresholds.highMaxMgDl) {
    return 'highPercent';
  }
  return 'veryHighPercent';
};

const CANONICAL_GRI_THRESHOLDS: TrendsRangeThresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};

const emptyRangeCounts = (): Record<keyof TrendsRangeDistribution, number> => ({
  veryLowPercent: 0,
  lowPercent: 0,
  targetPercent: 0,
  highPercent: 0,
  veryHighPercent: 0,
});

export const buildTrendsOverview = (
  input: BuildTrendsOverviewInput,
): TrendsOverview => {
  assertPeriod(input.period);
  assertThresholds(input.thresholds);
  const timeZoneOffsetMinutes = normalizedTimeZoneOffset(input);
  if (
    !Number.isFinite(timeZoneOffsetMinutes) ||
    !Number.isInteger(timeZoneOffsetMinutes) ||
    Math.abs(timeZoneOffsetMinutes) > 14 * 60
  ) {
    throw new TrendsOverviewInputError(
      'The Trends time-zone offset must be a whole number of minutes between -840 and 840.',
    );
  }
  const prepared = prepareTrendsSampleSet(input);
  const values = prepared.valuesMgDl;
  const localDays = new Set(
    prepared.validSamples.map(sample =>
      Math.floor(
        (sample.timestampMs + timeZoneOffsetMinutes * MINUTE_MS) / DAY_MS,
      ),
    ),
  );

  if (values.length === 0) {
    return {
      period: input.period,
      thresholds: input.thresholds,
      timeZoneOffsetMinutes,
      daysWithData: localDays.size,
      validSampleCount: 0,
      excludedSampleCount: prepared.excludedSampleCount,
      duplicateSampleCount: prepared.duplicateSampleCount,
      expectedSampleCount: prepared.expectedSampleCount,
      coveragePercent: prepared.coveragePercent,
      coverageQuality: prepared.coverageQuality,
      durationQuality: prepared.durationQuality,
      interpretationQuality: prepared.interpretationQuality,
      largestGapMs: undefined,
      lastReadingTimestampMs: undefined,
      ranges: undefined,
      meanGlucoseMgDl: undefined,
      gmiPercent: undefined,
      gmiFormulaVersion: undefined,
      gri: undefined,
      coefficientOfVariationPercent: undefined,
    };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  const standardDeviation = Math.sqrt(variance);
  const counts = emptyRangeCounts();
  const canonicalCounts = emptyRangeCounts();
  values.forEach(value => {
    counts[classify(value, input.thresholds)] += 1;
    canonicalCounts[classify(value, CANONICAL_GRI_THRESHOLDS)] += 1;
  });
  const percent = (count: number): number =>
    roundTo((count / values.length) * 100);
  const rawPercent = (count: number): number =>
    (count / values.length) * 100;
  const veryLow = rawPercent(canonicalCounts.veryLowPercent);
  const low = rawPercent(canonicalCounts.lowPercent);
  const high = rawPercent(canonicalCounts.highPercent);
  const veryHigh = rawPercent(canonicalCounts.veryHighPercent);
  const hypoglycemiaComponent = veryLow + 0.8 * low;
  const hyperglycemiaComponent = veryHigh + 0.5 * high;
  const griRaw =
    3 * veryLow + 2.4 * low + 1.6 * veryHigh + 0.8 * high;
  const representative =
    prepared.interpretationQuality === 'representative';

  return {
    period: input.period,
    thresholds: input.thresholds,
    timeZoneOffsetMinutes,
    daysWithData: localDays.size,
    validSampleCount: values.length,
    excludedSampleCount: prepared.excludedSampleCount,
    duplicateSampleCount: prepared.duplicateSampleCount,
    expectedSampleCount: prepared.expectedSampleCount,
    coveragePercent: prepared.coveragePercent,
    coverageQuality: prepared.coverageQuality,
    durationQuality: prepared.durationQuality,
    interpretationQuality: prepared.interpretationQuality,
    largestGapMs: prepared.largestGapMs,
    lastReadingTimestampMs: prepared.lastReadingTimestampMs,
    ranges: {
      veryLowPercent: percent(counts.veryLowPercent),
      lowPercent: percent(counts.lowPercent),
      targetPercent: percent(counts.targetPercent),
      highPercent: percent(counts.highPercent),
      veryHighPercent: percent(counts.veryHighPercent),
    },
    meanGlucoseMgDl: roundTo(mean),
    // Published GMI equation for mean glucose expressed in mg/dL. It is only
    // presented as representative after the separate duration/coverage gate.
    gmiPercent: representative ? roundTo(3.31 + 0.02392 * mean, 1) : undefined,
    gmiFormulaVersion: representative ? 'gmi-2018' : undefined,
    gri: representative
      ? {
          formulaVersion: 'gri-2022',
          hypoglycemiaComponent: roundTo(hypoglycemiaComponent),
          hyperglycemiaComponent: roundTo(hyperglycemiaComponent),
          rawScore: roundTo(griRaw),
          score: roundTo(Math.min(100, griRaw)),
        }
      : undefined,
    coefficientOfVariationPercent: roundTo(
      mean === 0 ? 0 : (standardDeviation / mean) * 100,
    ),
  };
};

export const previousMatchedPeriod = (period: TrendsPeriod): TrendsPeriod => {
  assertPeriod(period);
  const periodDuration = duration(period);
  return {
    startMs: period.startMs - periodDuration,
    endMs: period.startMs,
  };
};

export const buildMatchedPeriodComparison = (input: {
  readonly current: BuildTrendsOverviewInput;
  readonly previous: BuildTrendsOverviewInput;
}): MatchedPeriodComparison => {
  if (duration(input.current.period) !== duration(input.previous.period)) {
    throw new TrendsOverviewInputError(
      'A Trends comparison requires equal-duration periods.',
    );
  }
  if (!sameThresholds(input.current.thresholds, input.previous.thresholds)) {
    throw new TrendsOverviewInputError(
      'A Trends comparison requires identical glucose thresholds.',
    );
  }
  if (
    normalizedTimeZoneOffset(input.current) !==
    normalizedTimeZoneOffset(input.previous)
  ) {
    throw new TrendsOverviewInputError(
      'A Trends comparison requires an identical time-zone offset.',
    );
  }
  const current = buildTrendsOverview(input.current);
  const previous = buildTrendsOverview(input.previous);
  const comparable =
    current.interpretationQuality === 'representative' &&
    previous.interpretationQuality === 'representative';
  const metricsAvailable =
    current.meanGlucoseMgDl !== undefined &&
    previous.meanGlucoseMgDl !== undefined &&
    current.gmiPercent !== undefined &&
    previous.gmiPercent !== undefined &&
    current.ranges !== undefined &&
    previous.ranges !== undefined &&
    current.coefficientOfVariationPercent !== undefined &&
    previous.coefficientOfVariationPercent !== undefined;

  return {
    current,
    previous,
    comparable,
    deltas:
      comparable && metricsAvailable
        ? {
            meanGlucoseMgDl: roundTo(
              current.meanGlucoseMgDl! - previous.meanGlucoseMgDl!,
            ),
            gmiPercentagePoints: roundTo(
              current.gmiPercent! - previous.gmiPercent!,
              1,
            ),
            veryLowRangePercentagePoints: roundTo(
              current.ranges!.veryLowPercent -
                previous.ranges!.veryLowPercent,
            ),
            lowRangePercentagePoints: roundTo(
              current.ranges!.lowPercent - previous.ranges!.lowPercent,
            ),
            targetRangePercentagePoints: roundTo(
              current.ranges!.targetPercent - previous.ranges!.targetPercent,
            ),
            highRangePercentagePoints: roundTo(
              current.ranges!.highPercent - previous.ranges!.highPercent,
            ),
            veryHighRangePercentagePoints: roundTo(
              current.ranges!.veryHighPercent -
                previous.ranges!.veryHighPercent,
            ),
            coefficientOfVariationPercentagePoints: roundTo(
              current.coefficientOfVariationPercent! -
                previous.coefficientOfVariationPercent!,
            ),
          }
        : undefined,
  };
};
