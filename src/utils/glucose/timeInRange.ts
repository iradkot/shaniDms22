import {BgSample} from 'app/types/day_bgs.types';

export type TimeInRangeThresholds = {
  /** Values <= this are classified as very/severe low. */
  veryLowMax: number;
  /** In-range lower bound (inclusive). */
  targetMin: number;
  /** In-range upper bound (inclusive). */
  targetMax: number;
  /** Values <= this are classified as high (above target but not very high). */
  highMax: number;
};

export type TimeInRangePercentages = {
  veryLow: number;
  low: number;
  target: number;
  high: number;
  veryHigh: number;
};

function toFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Computes time-in-range buckets as percentages (0..100) over *valid* readings.
 *
 * Boundaries:
 * - veryLow: <= veryLowMax
 * - low: (veryLowMax, targetMin)
 * - target: [targetMin, targetMax]
 * - high: (targetMax, highMax]
 * - veryHigh: > highMax
 */
export function calculateTimeInRangePercentages(
  bgSamples: BgSample[],
  thresholds: TimeInRangeThresholds,
): {percentages: TimeInRangePercentages; validCount: number} {
  const veryLowMax = toFiniteNumber(thresholds?.veryLowMax);
  const targetMin = toFiniteNumber(thresholds?.targetMin);
  const targetMax = toFiniteNumber(thresholds?.targetMax);
  const highMax = toFiniteNumber(thresholds?.highMax);

  if (veryLowMax == null || targetMin == null || targetMax == null || highMax == null) {
    return {
      percentages: {veryLow: 0, low: 0, target: 0, high: 0, veryHigh: 0},
      validCount: 0,
    };
  }

  let veryLow = 0;
  let low = 0;
  let target = 0;
  let high = 0;
  let veryHigh = 0;

  for (const s of bgSamples ?? []) {
    const v = toFiniteNumber((s as any)?.sgv);
    if (v == null) continue;

    if (v <= veryLowMax) veryLow += 1;
    else if (v < targetMin) low += 1;
    else if (v <= targetMax) target += 1;
    else if (v <= highMax) high += 1;
    else veryHigh += 1;
  }

  const validCount = veryLow + low + target + high + veryHigh;
  if (!validCount) {
    return {
      percentages: {veryLow: 0, low: 0, target: 0, high: 0, veryHigh: 0},
      validCount: 0,
    };
  }

  const pct = (n: number) => (n / validCount) * 100;
  return {
    percentages: {
      veryLow: pct(veryLow),
      low: pct(low),
      target: pct(target),
      high: pct(high),
      veryHigh: pct(veryHigh),
    },
    validCount,
  };
}

export function calculateTargetTimeInRangePct(
  bgSamples: BgSample[],
  thresholds: TimeInRangeThresholds,
): number | null {
  const res = calculateTimeInRangePercentages(bgSamples, thresholds);
  return res.validCount ? res.percentages.target : null;
}

export function calculateFractionInInclusiveRange(
  values: Array<number | null | undefined>,
  minInclusive: number,
  maxInclusive: number,
): number | null {
  const minV = toFiniteNumber(minInclusive);
  const maxV = toFiniteNumber(maxInclusive);
  if (minV == null || maxV == null) return null;

  let total = 0;
  let inRange = 0;
  for (const raw of values ?? []) {
    const v = toFiniteNumber(raw);
    if (v == null) continue;
    total += 1;
    if (v >= minV && v <= maxV) inRange += 1;
  }

  if (!total) return null;
  return inRange / total;
}
