import type {
  TrendsCoverageQuality,
  TrendsRangeDistribution,
  TrendsRangeThresholds,
} from '../../trends';
import {buildTrendsOverview, prepareTrendsSampleSet} from '../../trends';
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
    }
  | {readonly quality: 'unavailable'};

export interface DailyOverview {
  readonly period: DailyOverviewPeriod;
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

export const getLocalDayPeriod = (
  timestampMs: number,
): DailyOverviewPeriod => {
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
  const prepared = prepareTrendsSampleSet({
    period: input.period,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    samples: input.source.glucoseSamples,
  });
  const sharedOverview = buildTrendsOverview({
    period: input.period,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: input.source.glucoseSamples,
  });
  const values = prepared.valuesMgDl;

  return {
    period: input.period,
    thresholds: input.thresholds,
    validSampleCount: prepared.validSampleCount,
    excludedSampleCount: prepared.excludedSampleCount,
    duplicateSampleCount: prepared.duplicateSampleCount,
    expectedSampleCount: prepared.expectedSampleCount,
    coveragePercent: prepared.coveragePercent,
    coverageQuality: prepared.coverageQuality,
    largestGapMs: prepared.largestGapMs,
    lastReadingTimestampMs: prepared.lastReadingTimestampMs,
    ranges: sharedOverview.ranges,
    meanGlucoseMgDl: sharedOverview.meanGlucoseMgDl,
    minimumGlucoseMgDl:
      values.length > 0 ? Math.min(...values) : undefined,
    maximumGlucoseMgDl:
      values.length > 0 ? Math.max(...values) : undefined,
    coefficientOfVariationPercent:
      sharedOverview.coefficientOfVariationPercent,
    insulinSummary: buildInsulinSummary(input.source.insulinSummary),
  };
};
