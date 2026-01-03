import {BgSample} from 'app/types/day_bgs.types';

/**
 * Shared constants for glucose log load bars.
 *
 * These values exist to keep UI/layout rules consistent and avoid hard-coded
 * "magic" numbers in components.
 */
export const LOAD_BARS_CONSTANTS = {
  rowHeight: 68,
  timeBgSectionWidth: 120,
  deltaSectionWidth: 50,
  barHeight: 6,
  barRadius: 6,
  /** Gap between label text and its track (small, not tied to spacing scale). */
  labelToTrackGapPx: 2,
  /** Spec: show a minimum width if value is meaningful (> 0.3). */
  minVisibleValue: 0.3,
  minVisiblePercent: 5,
  minVisiblePx: 2,
} as const;

const PERCENT_MAX = 100;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Calculates the max IOB/COB references for the current dataset.
 *
 * This is intended to be computed once in a parent component (e.g. list)
 * and passed to each row for performance.
 */
export function getLoadReferences(bgData: BgSample[]): {
  maxIobReference: number;
  maxCobReference: number;
} {
  let maxIob = 0;
  let maxCob = 0;

  for (const sample of bgData) {
    const iob = clampNonNegative(sample.iob ?? 0);
    const cob = clampNonNegative(sample.cob ?? 0);
    if (iob > maxIob) maxIob = iob;
    if (cob > maxCob) maxCob = cob;
  }

  return {maxIobReference: maxIob, maxCobReference: maxCob};
}

/**
 * Converts a raw value into a percentage of a reference max.
 *
 * - Clamps negative/NaN to 0
 * - Applies the "minimum visible" rule for small positive values
 */
export function toBarPercent(params: {
  value: number;
  referenceMax: number;
}): {percent: number; minWidthPx: number} {
  const value = clampNonNegative(params.value);
  const referenceMax = clampNonNegative(params.referenceMax);
  if (value <= 0) {
    return {percent: 0, minWidthPx: 0};
  }

  const effectiveRef = referenceMax > 0 ? referenceMax : value;
  const rawPercent = (value / effectiveRef) * PERCENT_MAX;
  const percent = Math.max(0, Math.min(PERCENT_MAX, rawPercent));

  const shouldMinify = value > LOAD_BARS_CONSTANTS.minVisibleValue;
  return {
    percent: shouldMinify
      ? Math.max(percent, LOAD_BARS_CONSTANTS.minVisiblePercent)
      : percent,
    minWidthPx: shouldMinify ? LOAD_BARS_CONSTANTS.minVisiblePx : 0,
  };
}

/** Formats IOB as units string (e.g., 3.5u). */
export function formatIob(value: number | undefined): string {
  const v = clampNonNegative(value ?? 0);
  return `${v.toFixed(1)}u`;
}

/** Formats COB as grams string (e.g., 45g). */
export function formatCob(value: number | undefined): string {
  const v = clampNonNegative(value ?? 0);
  // COB is typically displayed as whole grams.
  return `${Math.round(v)}g`;
}
