import type {
  TrendsCoverageQuality,
  TrendsDurationQuality,
  TrendsGlucoseSample,
  TrendsInterpretationQuality,
  TrendsPeriod,
} from './overview';

export const MINIMUM_ADEQUATE_COVERAGE_PERCENT = 70;
export const MINIMUM_REPRESENTATIVE_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export class TrendsOverviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrendsOverviewInputError';
  }
}

export interface PreparedTrendsSampleSet {
  readonly validSamples: readonly TrendsGlucoseSample[];
  readonly valuesMgDl: readonly number[];
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
}

export interface PrepareTrendsSampleSetInput {
  readonly period: TrendsPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly samples: readonly TrendsGlucoseSample[];
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

export const assertTrendsPeriod = (period: TrendsPeriod): void => {
  if (!Number.isFinite(period.startMs) || !Number.isFinite(period.endMs)) {
    throw new TrendsOverviewInputError('Period bounds must be finite.');
  }
  if (period.endMs <= period.startMs) {
    throw new TrendsOverviewInputError(
      'The Trends period must end after it starts.',
    );
  }
};

/**
 * One integrity boundary shared by every Trends calculation.
 *
 * It filters, deduplicates, orders, and rates the source readings once so a
 * new metric cannot accidentally use different coverage or weighting rules.
 */
export const prepareTrendsSampleSet = (
  input: PrepareTrendsSampleSetInput,
): PreparedTrendsSampleSet => {
  assertTrendsPeriod(input.period);
  if (
    !Number.isFinite(input.expectedSampleIntervalMs) ||
    input.expectedSampleIntervalMs <= 0
  ) {
    throw new TrendsOverviewInputError(
      'Expected sample interval must be positive.',
    );
  }

  const samplesByTimestamp = new Map<number, TrendsGlucoseSample>();
  let excludedSampleCount = 0;
  let duplicateSampleCount = 0;
  input.samples.forEach(sample => {
    const valid =
      Number.isFinite(sample.timestampMs) &&
      sample.timestampMs >= input.period.startMs &&
      sample.timestampMs < input.period.endMs &&
      Number.isFinite(sample.valueMgDl) &&
      sample.valueMgDl > 0;
    if (!valid) {
      excludedSampleCount += 1;
      return;
    }
    if (samplesByTimestamp.has(sample.timestampMs)) {
      duplicateSampleCount += 1;
      return;
    }
    samplesByTimestamp.set(sample.timestampMs, sample);
  });

  const validSamples = Array.from(samplesByTimestamp.values()).sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const valuesMgDl = validSamples.map(sample => sample.valueMgDl);
  const periodDurationMs = input.period.endMs - input.period.startMs;
  const expectedSampleCount = Math.max(
    1,
    Math.ceil(periodDurationMs / input.expectedSampleIntervalMs),
  );
  const rawCoveragePercent = Math.min(
    100,
    (validSamples.length / expectedSampleCount) * 100,
  );
  const coveragePercent = roundTo(rawCoveragePercent);
  const coverageQuality: TrendsCoverageQuality =
    validSamples.length === 0
      ? 'no-data'
      : rawCoveragePercent >= MINIMUM_ADEQUATE_COVERAGE_PERCENT
      ? 'adequate'
      : 'low';
  const durationQuality: TrendsDurationQuality =
    periodDurationMs >= MINIMUM_REPRESENTATIVE_DURATION_MS
      ? 'representative'
      : 'short';
  const interpretationQuality: TrendsInterpretationQuality =
    validSamples.length === 0
      ? 'no-data'
      : coverageQuality === 'adequate' && durationQuality === 'representative'
      ? 'representative'
      : 'partial';

  let largestGapMs: number | undefined;
  if (validSamples.length > 0) {
    largestGapMs = validSamples[0]!.timestampMs - input.period.startMs;
    for (let index = 1; index < validSamples.length; index += 1) {
      largestGapMs = Math.max(
        largestGapMs,
        validSamples[index]!.timestampMs - validSamples[index - 1]!.timestampMs,
      );
    }
    largestGapMs = Math.max(
      largestGapMs,
      input.period.endMs - validSamples[validSamples.length - 1]!.timestampMs,
    );
  }

  return {
    validSamples,
    valuesMgDl,
    validSampleCount: validSamples.length,
    excludedSampleCount,
    duplicateSampleCount,
    expectedSampleCount,
    coveragePercent,
    coverageQuality,
    durationQuality,
    interpretationQuality,
    largestGapMs,
    lastReadingTimestampMs:
      validSamples.length > 0
        ? validSamples[validSamples.length - 1]!.timestampMs
        : undefined,
  };
};

