import type * as d3 from 'd3';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {
  BOLUS_DETECTION_WINDOW_MS,
  BOLUS_MAX_FOCUS_PROXIMITY_MS,
  BOLUS_TOOLTIP_WINDOW_MS,
  BOLUS_HOVER_CONFIG,
} from '../constants/bolusHoverConfig';

const BOLUS_MARKER_BG_Y_VALUE = 50;

type TimeScale = d3.ScaleTime<number, number>;
type LinearScale = d3.ScaleLinear<number, number>;

function parseBolusTimestampMs(bolus: InsulinDataEntry): number | null {
  if (bolus.type !== 'bolus' || !bolus.timestamp) {
    return null;
  }

  const t = new Date(bolus.timestamp).getTime();
  return Number.isFinite(t) ? t : null;
}

function isValidBolus(bolus: InsulinDataEntry): bolus is InsulinDataEntry & {
  type: 'bolus';
  amount: number;
  timestamp: string;
} {
  return (
    bolus.type === 'bolus' &&
    typeof bolus.amount === 'number' &&
    Number.isFinite(bolus.amount) &&
    bolus.amount > 0 &&
    typeof bolus.timestamp === 'string' &&
    bolus.timestamp.length > 0
  );
}

/**
 * Find the closest bolus to a given timestamp, within a reasonable proximity.
 *
 * This is time-based (not spatial), so users can touch "near" a bolus by time.
 */
export function findClosestBolus(touchTimeMs: number, insulinData: InsulinDataEntry[]):
  | (InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string})
  | null {
  if (!insulinData?.length) {
    return null;
  }

  const boluses = insulinData.filter(isValidBolus);
  if (!boluses.length) {
    return null;
  }

  let closest = boluses[0];
  let minDiff = Math.abs(new Date(closest.timestamp).getTime() - touchTimeMs);

  for (const bolus of boluses) {
    const t = new Date(bolus.timestamp).getTime();
    const diff = Math.abs(t - touchTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = bolus;
    }
  }

  return minDiff <= BOLUS_MAX_FOCUS_PROXIMITY_MS ? closest : null;
}

/**
 * Collect bolus events in a +/- window around a reference time.
 * Used for showing context in tooltips once a bolus is focused.
 */
export function findBolusEventsInTooltipWindow(params: {
  anchorTimeMs: number;
  insulinData: InsulinDataEntry[];
}): Array<InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string}> {
  const {anchorTimeMs, insulinData} = params;

  if (!insulinData?.length) {
    return [];
  }

  const boluses = insulinData.filter(isValidBolus);
  if (!boluses.length) {
    return [];
  }

  const matches = boluses
    .map(b => ({b, t: new Date(b.timestamp).getTime()}))
    .filter(({t}) => Math.abs(t - anchorTimeMs) <= BOLUS_TOOLTIP_WINDOW_MS)
    .sort((a, b) => a.t - b.t)
    .slice(0, BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip)
    .map(({b}) => b);

  return matches;
}

/**
 * Returns bolus events considered "near" a touch point.
 *
 * Primary matching is by time window (around the touch time).
 * We also allow a small spatial-proximity fallback to make boluses easier to hit.
 */
export function findBolusEventsInWindow(params: {
  touchX: number;
  touchY: number;
  touchTimeMs: number;
  insulinData: InsulinDataEntry[];
  xScale: TimeScale;
  yScale: LinearScale;
}): InsulinDataEntry[] {
  const {touchX, touchY, touchTimeMs, insulinData, xScale, yScale} = params;

  if (!insulinData?.length) {
    return [];
  }

  const candidates = insulinData.filter(isValidBolus);
  if (!candidates.length) {
    return [];
  }

  const spatialRadius = BOLUS_HOVER_CONFIG.spatialDetectionRadiusPx;
  const extendedWindowMs = BOLUS_DETECTION_WINDOW_MS * 2;

  const matches: Array<{bolus: InsulinDataEntry; t: number}> = [];

  for (const bolus of candidates) {
    const bolusTimeMs = parseBolusTimestampMs(bolus);
    if (bolusTimeMs == null) continue;

    const timeDistance = Math.abs(bolusTimeMs - touchTimeMs);

    const markerX = xScale(new Date(bolusTimeMs));
    const markerY = yScale(BOLUS_MARKER_BG_Y_VALUE);

    const dx = touchX - markerX;
    const dy = touchY - markerY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    const withinTimeWindow = timeDistance <= BOLUS_DETECTION_WINDOW_MS;
    const withinSpatialRadius = pixelDistance <= spatialRadius;

    if (withinTimeWindow || (withinSpatialRadius && timeDistance <= extendedWindowMs)) {
      matches.push({bolus, t: bolusTimeMs});
    }
  }

  matches.sort((a, b) => a.t - b.t);

  return matches
    .slice(0, BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip)
    .map(m => m.bolus);
}

export function getBolusMarkerYValue(): number {
  return BOLUS_MARKER_BG_Y_VALUE;
}
