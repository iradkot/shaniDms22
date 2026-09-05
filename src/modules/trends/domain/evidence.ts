import type {TrendsCoverageQuality, TrendsPeriod} from './overview';
import {TrendsOverviewInputError, assertTrendsPeriod} from './sampleSet';

export type TrendsEvidenceFreshness =
  | 'current'
  | 'delayed'
  | 'stale'
  | 'no-data';

/** Shared, inspectable evidence header used by every Trends destination. */
export interface TrendsEvidenceMetadata {
  readonly period: TrendsPeriod;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly daysWithData: number;
  readonly timeZoneOffsetMinutes: number;
  readonly targetRange: {
    readonly minMgDl: number;
    readonly maxMgDl: number;
  };
  readonly lastReadingTimestampMs: number | undefined;
  readonly freshness: TrendsEvidenceFreshness;
  /** Age relative to the selected evidence window, not the wall clock. */
  readonly ageAtPeriodEndMs: number | undefined;
}

export interface BuildTrendsEvidenceMetadataInput {
  readonly period: TrendsPeriod;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly daysWithData: number;
  readonly expectedSampleIntervalMs: number;
  readonly lastReadingTimestampMs: number | undefined;
  readonly timeZoneOffsetMinutes: number;
  readonly targetRange: {
    readonly minMgDl: number;
    readonly maxMgDl: number;
  };
}

export const buildTrendsEvidenceMetadata = (
  input: BuildTrendsEvidenceMetadataInput,
): TrendsEvidenceMetadata => {
  assertTrendsPeriod(input.period);
  if (
    !Number.isFinite(input.coveragePercent) ||
    input.coveragePercent < 0 ||
    input.coveragePercent > 100
  ) {
    throw new TrendsOverviewInputError(
      'Trends evidence coverage must be between 0 and 100 percent.',
    );
  }
  if (!Number.isInteger(input.daysWithData) || input.daysWithData < 0) {
    throw new TrendsOverviewInputError(
      'Trends evidence days with data must be a non-negative integer.',
    );
  }
  if (
    !Number.isInteger(input.timeZoneOffsetMinutes) ||
    Math.abs(input.timeZoneOffsetMinutes) > 14 * 60
  ) {
    throw new TrendsOverviewInputError(
      'The Trends evidence time-zone offset must be a whole number of minutes between -840 and 840.',
    );
  }
  if (
    !Number.isFinite(input.targetRange.minMgDl) ||
    !Number.isFinite(input.targetRange.maxMgDl) ||
    input.targetRange.minMgDl <= 0 ||
    input.targetRange.maxMgDl <= input.targetRange.minMgDl
  ) {
    throw new TrendsOverviewInputError(
      'The Trends evidence target range must be finite, positive, and ordered.',
    );
  }
  if (
    !Number.isFinite(input.expectedSampleIntervalMs) ||
    input.expectedSampleIntervalMs <= 0
  ) {
    throw new TrendsOverviewInputError(
      'The expected sample interval must be a positive finite duration.',
    );
  }
  if (
    input.lastReadingTimestampMs !== undefined &&
    !Number.isFinite(input.lastReadingTimestampMs)
  ) {
    throw new TrendsOverviewInputError(
      'The latest Trends reading timestamp must be finite.',
    );
  }

  const ageAtPeriodEndMs =
    input.lastReadingTimestampMs === undefined
      ? undefined
      : Math.max(0, input.period.endMs - input.lastReadingTimestampMs);
  const freshness: TrendsEvidenceFreshness =
    ageAtPeriodEndMs === undefined
      ? 'no-data'
      : ageAtPeriodEndMs <= input.expectedSampleIntervalMs * 2
      ? 'current'
      : ageAtPeriodEndMs <= input.expectedSampleIntervalMs * 6
      ? 'delayed'
      : 'stale';

  return {
    period: input.period,
    coveragePercent: input.coveragePercent,
    coverageQuality: input.coverageQuality,
    daysWithData: input.daysWithData,
    timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
    targetRange: input.targetRange,
    lastReadingTimestampMs: input.lastReadingTimestampMs,
    freshness,
    ageAtPeriodEndMs,
  };
};
