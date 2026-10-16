import type {TrendsRangeThresholds} from '../trends';

export const DEFAULT_GLUCOSE_RANGE_THRESHOLDS: TrendsRangeThresholds =
  Object.freeze({
    veryLowMaxMgDl: 54,
    targetMinMgDl: 70,
    targetMaxMgDl: 180,
    highMaxMgDl: 250,
  });

/** Personal ranges are saved as one complete set in sensor units (mg/dL). */
export const isValidGlucoseRangeThresholds = (
  value: unknown,
): value is TrendsRangeThresholds => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const ordered = [
    candidate.veryLowMaxMgDl,
    candidate.targetMinMgDl,
    candidate.targetMaxMgDl,
    candidate.highMaxMgDl,
  ];
  return ordered.every(
    (threshold, index) =>
      typeof threshold === 'number' &&
      Number.isInteger(threshold) &&
      threshold >= 20 &&
      threshold <= 600 &&
      (index === 0 || threshold > (ordered[index - 1] as number)),
  );
};
