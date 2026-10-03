import {
  assertTrendsRangeThresholds,
  classifyTrendsRange,
  type BuildTrendsRangeSummaryInput,
  type TrendsCoverageQuality,
  type TrendsRangeDistribution,
} from './overview';
import {
  assertTrendsPeriod,
  assertTrendsSampleInterval,
  MINIMUM_ADEQUATE_COVERAGE_PERCENT,
  prepareTrendsSampleSet,
} from './sampleSet';

export const DEFAULT_DAILY_CGM_INTERVAL_MS = 5 * 60_000;

/** The daily app and background widget accept the same glucose evidence. */
export const isDailyGlucoseValue = (valueMgDl: number): boolean =>
  Number.isFinite(valueMgDl) && valueMgDl >= 20 && valueMgDl <= 600;

export interface ElapsedGlucoseSummary {
  readonly observedMs: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly ranges: TrendsRangeDistribution | undefined;
}

const percent = (value: number, total: number): number =>
  Math.round((value / total) * 10_000) / 100;

/**
 * Daily time-in-range is weighted by observed time, not by sample count.
 * Each reading lasts until the next valid reading, cadence limit or exclusive
 * cutoff, whichever is first. A carry-in reading can cover midnight; gaps do
 * not establish glucose. General Trends statistics remain sample based.
 */
export const buildElapsedGlucoseSummary = (
  input: BuildTrendsRangeSummaryInput,
): ElapsedGlucoseSummary => {
  assertTrendsPeriod(input.period);
  assertTrendsSampleInterval(input.expectedSampleIntervalMs);
  assertTrendsRangeThresholds(input.thresholds);
  const {startMs, endMs} = input.period;
  const prepared = prepareTrendsSampleSet({
    period: {startMs: startMs - input.expectedSampleIntervalMs, endMs},
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    samples: input.samples.filter(sample =>
      isDailyGlucoseValue(sample.valueMgDl),
    ),
  });
  const durations: Record<keyof TrendsRangeDistribution, number> = {
    veryLowPercent: 0,
    lowPercent: 0,
    targetPercent: 0,
    highPercent: 0,
    veryHighPercent: 0,
  };
  prepared.validSamples.forEach((sample, index, samples) => {
    const until = Math.min(
      endMs,
      sample.timestampMs + input.expectedSampleIntervalMs,
      samples[index + 1]?.timestampMs ?? endMs,
    );
    const duration = Math.max(0, until - Math.max(startMs, sample.timestampMs));
    durations[classifyTrendsRange(sample.valueMgDl, input.thresholds)] +=
      duration;
  });
  const observedMs = Object.values(durations).reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const coveragePercent =
    observedMs === 0 ? 0 : percent(observedMs, endMs - startMs);
  return {
    observedMs,
    coveragePercent,
    coverageQuality:
      observedMs === 0
        ? 'no-data'
        : (observedMs * 100) / (endMs - startMs) >=
          MINIMUM_ADEQUATE_COVERAGE_PERCENT
        ? 'adequate'
        : 'low',
    ranges:
      observedMs === 0
        ? undefined
        : {
            veryLowPercent: percent(durations.veryLowPercent, observedMs),
            lowPercent: percent(durations.lowPercent, observedMs),
            targetPercent: percent(durations.targetPercent, observedMs),
            highPercent: percent(durations.highPercent, observedMs),
            veryHighPercent: percent(durations.veryHighPercent, observedMs),
          },
  };
};
