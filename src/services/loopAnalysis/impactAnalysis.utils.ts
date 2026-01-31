/**
 * Impact Analysis Utilities
 *
 * Pure functions for calculating glucose statistics and comparing
 * periods before/after a settings change.
 *
 * All functions are stateless and testable.
 */

import {BgSample} from 'app/types/day_bgs.types';
import {
  PeriodStats,
  HourlyAggregate,
  ImpactDeltas,
  DataQualityAssessment,
  TirThresholds,
  TimeInRangeBreakdown,
} from 'app/types/loopAnalysis.types';

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const EXPECTED_READINGS_PER_DAY = 288; // 5-minute CGM
const LARGE_GAP_THRESHOLD_MS = 2 * MS_PER_HOUR; // 2 hours
const MIN_COVERAGE_FOR_VALID = 0.7; // 70%

// Event detection constants
const HYPO_EVENT_MAX_GAP_MS = 20 * 60 * 1000; // 20 minutes
const HYPER_EVENT_MAX_GAP_MS = 20 * 60 * 1000;

// Significance thresholds
const TIR_SIGNIFICANCE_THRESHOLD = 3; // 3 percentage points
const AVG_BG_SIGNIFICANCE_THRESHOLD = 10; // 10 mg/dL

// Default TIR thresholds (ADA/AACE consensus)
export const DEFAULT_TIR_THRESHOLDS: TirThresholds = {
  veryLowMax: 54,
  targetMin: 70,
  targetMax: 180,
  highMax: 250,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function toFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Calculates percentile from a sorted array.
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  if (sortedArr.length === 1) return sortedArr[0];

  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
}

/**
 * Calculates mean of an array.
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculates standard deviation of an array.
 */
function stdDev(arr: number[], meanVal?: number): number {
  if (arr.length < 2) return 0;
  const m = meanVal ?? mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// =============================================================================
// TIME IN RANGE CALCULATION
// =============================================================================

/**
 * Calculates Time in Range breakdown from BG samples.
 */
export function calculateTimeInRangeBreakdown(
  bgSamples: BgSample[],
  thresholds: TirThresholds
): {breakdown: TimeInRangeBreakdown; validCount: number} {
  const {veryLowMax, targetMin, targetMax, highMax} = thresholds;

  let veryLow = 0;
  let low = 0;
  let target = 0;
  let high = 0;
  let veryHigh = 0;

  for (const s of bgSamples ?? []) {
    const v = toFiniteNumber(s?.sgv);
    if (v == null) continue;

    if (v <= veryLowMax) veryLow++;
    else if (v < targetMin) low++;
    else if (v <= targetMax) target++;
    else if (v <= highMax) high++;
    else veryHigh++;
  }

  const validCount = veryLow + low + target + high + veryHigh;

  if (validCount === 0) {
    return {
      breakdown: {veryLow: 0, low: 0, target: 0, high: 0, veryHigh: 0},
      validCount: 0,
    };
  }

  const pct = (n: number) => (n / validCount) * 100;

  return {
    breakdown: {
      veryLow: pct(veryLow),
      low: pct(low),
      target: pct(target),
      high: pct(high),
      veryHigh: pct(veryHigh),
    },
    validCount,
  };
}

// =============================================================================
// EVENT COUNTING
// =============================================================================

/**
 * Counts distinct hypoglycemic events.
 * An event starts when BG drops below threshold and ends when it rises above
 * or after a gap > 20 minutes.
 */
export function countHypoEvents(
  bgSamples: BgSample[],
  threshold: number
): number {
  const sorted = [...(bgSamples ?? [])]
    .filter(s => typeof s?.date === 'number' && typeof s?.sgv === 'number')
    .sort((a, b) => a.date - b.date);

  let eventCount = 0;
  let inEvent = false;
  let lastTs: number | null = null;

  for (const s of sorted) {
    const gapBreaks = lastTs != null && s.date - lastTs > HYPO_EVENT_MAX_GAP_MS;

    if (gapBreaks && inEvent) {
      inEvent = false;
    }

    const isLow = s.sgv < threshold;

    if (isLow && !inEvent) {
      inEvent = true;
      eventCount++;
    } else if (!isLow && inEvent) {
      inEvent = false;
    }

    lastTs = s.date;
  }

  return eventCount;
}

/**
 * Counts distinct hyperglycemic events.
 */
export function countHyperEvents(
  bgSamples: BgSample[],
  threshold: number
): number {
  const sorted = [...(bgSamples ?? [])]
    .filter(s => typeof s?.date === 'number' && typeof s?.sgv === 'number')
    .sort((a, b) => a.date - b.date);

  let eventCount = 0;
  let inEvent = false;
  let lastTs: number | null = null;

  for (const s of sorted) {
    const gapBreaks = lastTs != null && s.date - lastTs > HYPER_EVENT_MAX_GAP_MS;

    if (gapBreaks && inEvent) {
      inEvent = false;
    }

    const isHigh = s.sgv > threshold;

    if (isHigh && !inEvent) {
      inEvent = true;
      eventCount++;
    } else if (!isHigh && inEvent) {
      inEvent = false;
    }

    lastTs = s.date;
  }

  return eventCount;
}

// =============================================================================
// GMI CALCULATION
// =============================================================================

/**
 * Calculates GMI (Glucose Management Indicator) from average glucose.
 * Formula: GMI = 3.31 + 0.02392 × mean glucose (mg/dL)
 */
export function calculateGMI(avgBg: number | null): number | null {
  if (avgBg == null || avgBg <= 0) return null;
  return 3.31 + 0.02392 * avgBg;
}

// =============================================================================
// PERIOD STATS CALCULATION
// =============================================================================

/**
 * Calculates comprehensive statistics for a time period.
 */
export function calculatePeriodStats(
  bgSamples: BgSample[],
  startMs: number,
  endMs: number,
  thresholds: TirThresholds = DEFAULT_TIR_THRESHOLDS
): PeriodStats {
  // Filter to samples within the period
  const periodSamples = (bgSamples ?? []).filter(s => {
    const ts = s?.date;
    return typeof ts === 'number' && ts >= startMs && ts <= endMs;
  });

  // Extract valid SGV values
  const values = periodSamples
    .map(s => toFiniteNumber(s?.sgv))
    .filter((v): v is number => v !== null);

  const sampleCount = values.length;

  // Calculate basic stats
  const averageBg = sampleCount > 0 ? mean(values) : null;
  const stdDevVal = sampleCount >= 2 ? stdDev(values, averageBg ?? undefined) : null;
  const cv = averageBg != null && stdDevVal != null && averageBg > 0
    ? (stdDevVal / averageBg) * 100
    : null;

  // Calculate TIR
  const {breakdown: timeInRange} = calculateTimeInRangeBreakdown(periodSamples, thresholds);

  // Count events
  const hypoEventCount = countHypoEvents(periodSamples, thresholds.targetMin);
  const hyperEventCount = countHyperEvents(periodSamples, thresholds.targetMax);

  // Calculate GMI
  const gmi = calculateGMI(averageBg);

  return {
    startMs,
    endMs,
    sampleCount,
    averageBg: averageBg != null ? Math.round(averageBg * 10) / 10 : null,
    stdDev: stdDevVal != null ? Math.round(stdDevVal * 10) / 10 : null,
    cv: cv != null ? Math.round(cv * 10) / 10 : null,
    timeInRange,
    hypoEventCount,
    hyperEventCount,
    totalInsulinDailyAverage: null, // Would require treatment data
    gmi: gmi != null ? Math.round(gmi * 100) / 100 : null,
  };
}

// =============================================================================
// HOURLY AGGREGATES
// =============================================================================

/**
 * Computes hourly aggregates for the ghost chart.
 * Groups all samples by hour of day and calculates percentiles.
 */
export function computeHourlyAggregates(bgSamples: BgSample[]): HourlyAggregate[] {
  // Initialize buckets for each hour
  const hourBuckets: number[][] = Array.from({length: 24}, () => []);

  // Group samples by hour of day
  for (const s of bgSamples ?? []) {
    const ts = s?.date;
    const sgv = toFiniteNumber(s?.sgv);
    if (typeof ts !== 'number' || sgv == null) continue;

    const hour = new Date(ts).getHours();
    hourBuckets[hour].push(sgv);
  }

  // Calculate aggregates for each hour
  return hourBuckets.map((values, hour) => {
    if (values.length === 0) {
      return {
        hour,
        meanBg: 0,
        p10: 0,
        p25: 0,
        median: 0,
        p75: 0,
        p90: 0,
        count: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);

    return {
      hour,
      meanBg: Math.round(mean(values)),
      p10: Math.round(percentile(sorted, 10)),
      p25: Math.round(percentile(sorted, 25)),
      median: Math.round(percentile(sorted, 50)),
      p75: Math.round(percentile(sorted, 75)),
      p90: Math.round(percentile(sorted, 90)),
      count: values.length,
    };
  });
}

// =============================================================================
// DELTA COMPUTATION
// =============================================================================

/**
 * Computes deltas between pre and post change periods.
 */
export function computeDeltas(
  preChange: PeriodStats,
  postChange: PeriodStats
): ImpactDeltas {
  // TIR delta (positive = improvement)
  const tirDelta = postChange.timeInRange.target - preChange.timeInRange.target;

  // Avg BG delta (negative = improvement)
  const avgBgDelta =
    preChange.averageBg != null && postChange.averageBg != null
      ? postChange.averageBg - preChange.averageBg
      : null;

  // CV delta (negative = less variable = improvement)
  const cvDelta =
    preChange.cv != null && postChange.cv != null
      ? postChange.cv - preChange.cv
      : null;

  // Event count deltas
  const hypoCountDelta = postChange.hypoEventCount - preChange.hypoEventCount;
  const hyperCountDelta = postChange.hyperEventCount - preChange.hyperEventCount;

  // Determine significance
  const isSignificant =
    Math.abs(tirDelta) >= TIR_SIGNIFICANCE_THRESHOLD ||
    (avgBgDelta != null && Math.abs(avgBgDelta) >= AVG_BG_SIGNIFICANCE_THRESHOLD);

  // Determine overall trend
  const overallTrend = determineOverallTrend({
    tirDelta,
    avgBgDelta,
    hypoCountDelta,
    hyperCountDelta,
    isSignificant,
  });

  return {
    tirDelta: Math.round(tirDelta * 10) / 10,
    avgBgDelta: avgBgDelta != null ? Math.round(avgBgDelta * 10) / 10 : null,
    cvDelta: cvDelta != null ? Math.round(cvDelta * 10) / 10 : null,
    hypoCountDelta,
    hyperCountDelta,
    isSignificant,
    overallTrend,
  };
}

/**
 * Determines the overall trend based on multiple metrics.
 */
function determineOverallTrend(params: {
  tirDelta: number;
  avgBgDelta: number | null;
  hypoCountDelta: number;
  hyperCountDelta: number;
  isSignificant: boolean;
}): 'improved' | 'worsened' | 'mixed' | 'neutral' {
  const {tirDelta, avgBgDelta, hypoCountDelta, isSignificant} = params;

  if (!isSignificant) {
    return 'neutral';
  }

  // Check for clear improvement
  const tirImproved = tirDelta > 0;
  const bgImproved = avgBgDelta != null && avgBgDelta < 0;
  const moreHypos = hypoCountDelta > 0;

  // If TIR improved and no increase in hypos, it's improved
  if (tirImproved && !moreHypos) {
    return 'improved';
  }

  // If TIR worsened significantly
  if (tirDelta < -TIR_SIGNIFICANCE_THRESHOLD) {
    return 'worsened';
  }

  // If avg BG went up significantly
  if (avgBgDelta != null && avgBgDelta > AVG_BG_SIGNIFICANCE_THRESHOLD) {
    return 'worsened';
  }

  // If more hypos without TIR improvement
  if (moreHypos && !tirImproved) {
    return 'worsened';
  }

  // Mixed: some metrics improved, others worsened
  if ((tirImproved && moreHypos) || (!tirImproved && bgImproved)) {
    return 'mixed';
  }

  return 'neutral';
}

// =============================================================================
// DATA QUALITY ASSESSMENT
// =============================================================================

/**
 * Counts gaps larger than the threshold in a sorted sample array.
 */
function countLargeGaps(sortedSamples: BgSample[], thresholdMs: number): number {
  let gapCount = 0;
  let lastTs: number | null = null;

  for (const s of sortedSamples) {
    if (typeof s?.date !== 'number') continue;
    if (lastTs != null && s.date - lastTs > thresholdMs) {
      gapCount++;
    }
    lastTs = s.date;
  }

  return gapCount;
}

/**
 * Assesses data quality for both periods.
 */
export function assessDataQuality(
  preBgSamples: BgSample[],
  postBgSamples: BgSample[],
  windowDays: number
): DataQualityAssessment {
  const expectedReadings = windowDays * EXPECTED_READINGS_PER_DAY;
  const warnings: string[] = [];

  // Filter valid samples
  const preValid = (preBgSamples ?? []).filter(
    s => typeof s?.date === 'number' && typeof s?.sgv === 'number'
  );
  const postValid = (postBgSamples ?? []).filter(
    s => typeof s?.date === 'number' && typeof s?.sgv === 'number'
  );

  // Calculate coverage
  const preCoverage = clamp(preValid.length / expectedReadings, 0, 1);
  const postCoverage = clamp(postValid.length / expectedReadings, 0, 1);

  // Count large gaps
  const preSorted = [...preValid].sort((a, b) => a.date - b.date);
  const postSorted = [...postValid].sort((a, b) => a.date - b.date);
  const preGapCount = countLargeGaps(preSorted, LARGE_GAP_THRESHOLD_MS);
  const postGapCount = countLargeGaps(postSorted, LARGE_GAP_THRESHOLD_MS);

  // Generate warnings
  if (preCoverage < 0.5) {
    warnings.push('Very limited data before the change (< 50% coverage).');
  } else if (preCoverage < MIN_COVERAGE_FOR_VALID) {
    warnings.push('Limited data before the change may affect accuracy.');
  }

  if (postCoverage < 0.5) {
    warnings.push('Very limited data after the change (< 50% coverage).');
  } else if (postCoverage < MIN_COVERAGE_FOR_VALID) {
    warnings.push('Limited data after the change may affect accuracy.');
  }

  if (preGapCount > 3 || postGapCount > 3) {
    warnings.push('Significant data gaps detected (> 2 hours).');
  }

  const hasEnoughData =
    preCoverage >= MIN_COVERAGE_FOR_VALID && postCoverage >= MIN_COVERAGE_FOR_VALID;

  return {
    prePeriodCoverage: Math.round(preCoverage * 100) / 100,
    postPeriodCoverage: Math.round(postCoverage * 100) / 100,
    hasEnoughData,
    preGapCount,
    postGapCount,
    warnings,
  };
}

// =============================================================================
// NATURAL LANGUAGE SUMMARY
// =============================================================================

/**
 * Generates a natural language summary of the impact analysis.
 * Used by both UI and LLM tools.
 */
export function generateImpactSummary(
  deltas: ImpactDeltas,
  preChange: PeriodStats,
  postChange: PeriodStats,
  windowDays: number
): string {
  const parts: string[] = [];

  const period = windowDays === 1 ? 'day' : `${windowDays} days`;

  if (!deltas.isSignificant) {
    return `Over the ${period} comparison window, no significant changes in glucose control were observed.`;
  }

  // TIR change
  if (Math.abs(deltas.tirDelta) >= TIR_SIGNIFICANCE_THRESHOLD) {
    const direction = deltas.tirDelta > 0 ? 'increased' : 'decreased';
    parts.push(
      `Time in Range ${direction} by ${Math.abs(deltas.tirDelta).toFixed(1)}% ` +
      `(${preChange.timeInRange.target.toFixed(1)}% → ${postChange.timeInRange.target.toFixed(1)}%)`
    );
  }

  // Avg BG change
  if (deltas.avgBgDelta != null && Math.abs(deltas.avgBgDelta) >= AVG_BG_SIGNIFICANCE_THRESHOLD) {
    const direction = deltas.avgBgDelta < 0 ? 'dropped' : 'increased';
    parts.push(
      `Average glucose ${direction} by ${Math.abs(deltas.avgBgDelta).toFixed(0)} mg/dL`
    );
  }

  // Hypo change
  if (deltas.hypoCountDelta !== 0) {
    const direction = deltas.hypoCountDelta < 0 ? 'fewer' : 'more';
    parts.push(
      `${Math.abs(deltas.hypoCountDelta)} ${direction} low glucose events`
    );
  }

  if (parts.length === 0) {
    return `Over the ${period} comparison window, minor changes were observed.`;
  }

  // Add overall assessment
  const trendLabel = {
    improved: 'Overall, this appears to be a positive change.',
    worsened: 'Overall, this change may need review.',
    mixed: 'The results are mixed.',
    neutral: '',
  }[deltas.overallTrend];

  return `Over the ${period} comparison window: ${parts.join('; ')}. ${trendLabel}`.trim();
}
