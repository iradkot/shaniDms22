import type {
  TrendsCoverageQuality,
  TrendsRangeDistribution,
  TrendsRangeThresholds,
} from '../../trends';
import {
  assertTrendsSampleInterval,
  buildTrendsDescriptiveSummary,
} from '../../trends';
import type {
  DailyInsulinSourceSummary,
  DailyOverviewPeriod,
  DailyOverviewSourceSnapshot,
} from '../contracts';

export type DailyInsulinSummary =
  | {
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
      readonly totalUnits: number;
      readonly basalEstimated?: boolean;
    }
  | {readonly quality: 'unavailable'};

export interface DailyOverview {
  readonly period: DailyOverviewPeriod;
  readonly observedPeriod?: DailyOverviewPeriod;
  readonly isPartialDay?: boolean;
  readonly thresholds: TrendsRangeThresholds;
  readonly validSampleCount: number;
  readonly excludedSampleCount: number;
  readonly duplicateSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly largestGapMs: number | undefined;
  readonly lastReadingTimestampMs: number | undefined;
  readonly ranges: TrendsRangeDistribution | undefined;
  readonly meanGlucoseMgDl: number | undefined;
  readonly minimumGlucoseMgDl: number | undefined;
  readonly maximumGlucoseMgDl: number | undefined;
  readonly coefficientOfVariationPercent: number | undefined;
  readonly insulinSummary: DailyInsulinSummary;
}

export interface BuildDailyOverviewInput {
  readonly period: DailyOverviewPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly source: DailyOverviewSourceSnapshot;
  /** Exclusive observation cutoff; omitted for a complete historical day. */
  readonly asOfMs?: number;
}

export class DailyOverviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailyOverviewInputError';
  }
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const assertFiniteTimestamp = (timestampMs: number): void => {
  if (!Number.isFinite(timestampMs)) {
    throw new DailyOverviewInputError('Day timestamp must be finite.');
  }
};

export const localDayStart = (timestampMs: number): number => {
  assertFiniteTimestamp(timestampMs);
  const localDate = new Date(timestampMs);
  localDate.setHours(0, 0, 0, 0);
  return localDate.getTime();
};

export const moveLocalDay = (dayStartMs: number, dayDelta: number): number => {
  assertFiniteTimestamp(dayStartMs);
  if (!Number.isInteger(dayDelta)) {
    throw new DailyOverviewInputError('Day movement must be a whole number.');
  }
  const localDate = new Date(localDayStart(dayStartMs));
  localDate.setDate(localDate.getDate() + dayDelta);
  return localDate.getTime();
};

export const getLocalDayPeriod = (timestampMs: number): DailyOverviewPeriod => {
  const startMs = localDayStart(timestampMs);
  return {startMs, endMs: moveLocalDay(startMs, 1)};
};

const assertOneLocalDay = (period: DailyOverviewPeriod): void => {
  if (
    period.startMs !== localDayStart(period.startMs) ||
    period.endMs !== moveLocalDay(period.startMs, 1)
  ) {
    throw new DailyOverviewInputError(
      'Daily Overview period must be exactly one local calendar day.',
    );
  }
};

const buildInsulinSummary = (
  source: DailyInsulinSourceSummary,
): DailyInsulinSummary => {
  if (source.quality === 'unavailable') {
    return {quality: 'unavailable'};
  }
  if (
    !Number.isFinite(source.basalUnits) ||
    !Number.isFinite(source.bolusUnits) ||
    source.basalUnits < 0 ||
    source.bolusUnits < 0
  ) {
    throw new DailyOverviewInputError(
      'Available insulin totals must be finite and non-negative.',
    );
  }
  return {
    quality: 'available',
    basalUnits: source.basalUnits,
    bolusUnits: source.bolusUnits,
    totalUnits: roundTo(source.basalUnits + source.bolusUnits),
    ...(source.basalEstimated === undefined
      ? {}
      : {basalEstimated: source.basalEstimated}),
  };
};

/**
 * Builds descriptive metrics for one local day.
 *
 * Trends owns sample integrity and glucose range boundaries. This module
 * deliberately exposes neither representative GMI/GRI nor a daily score.
 */
export const buildDailyOverview = (
  input: BuildDailyOverviewInput,
): DailyOverview => {
  assertOneLocalDay(input.period);
  // Keep the daily module's established cadence-before-threshold validation.
  assertTrendsSampleInterval(input.expectedSampleIntervalMs);
  if (input.asOfMs !== undefined) {
    assertFiniteTimestamp(input.asOfMs);
  }
  const observedPeriod = {
    startMs: input.period.startMs,
    endMs: Math.min(
      input.period.endMs,
      Math.max(input.period.startMs, input.asOfMs ?? input.period.endMs),
    ),
  };
  const hasElapsedTime = observedPeriod.endMs > observedPeriod.startMs;
  const sharedOverview = buildTrendsDescriptiveSummary({
    // A zero-duration day has no expected readings. Validate the usual domain
    // invariants through the empty full-day model, then expose zero expectation.
    period: hasElapsedTime ? observedPeriod : input.period,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: hasElapsedTime ? input.source.glucoseSamples : [],
  });
  const prepared = sharedOverview.sampleSet;

  return {
    period: input.period,
    ...(input.asOfMs === undefined
      ? {}
      : {
          observedPeriod,
          isPartialDay: observedPeriod.endMs < input.period.endMs,
        }),
    thresholds: input.thresholds,
    validSampleCount: prepared.validSampleCount,
    excludedSampleCount: hasElapsedTime
      ? prepared.excludedSampleCount
      : input.source.glucoseSamples.length,
    duplicateSampleCount: prepared.duplicateSampleCount,
    expectedSampleCount: hasElapsedTime ? prepared.expectedSampleCount : 0,
    coveragePercent: prepared.coveragePercent,
    coverageQuality: prepared.coverageQuality,
    largestGapMs: prepared.largestGapMs,
    lastReadingTimestampMs: prepared.lastReadingTimestampMs,
    ranges: sharedOverview.ranges,
    meanGlucoseMgDl: sharedOverview.meanGlucoseMgDl,
    minimumGlucoseMgDl: sharedOverview.minimumGlucoseMgDl,
    maximumGlucoseMgDl: sharedOverview.maximumGlucoseMgDl,
    coefficientOfVariationPercent: sharedOverview.coefficientOfVariationPercent,
    insulinSummary: buildInsulinSummary(input.source.insulinSummary),
  };
};
