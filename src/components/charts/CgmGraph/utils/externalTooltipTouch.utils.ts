/**
 * Utilities for `tooltipMode="external"`.
 *
 * In external mode we emit the raw touch time so a parent can:
 * - keep a unified cursor across multiple stacked charts
 * - optionally snap/normalize the time
 */

import type {CGMGraphExternalTooltipPayload} from '../CgmGraph.types';

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

type TouchTimeScale = {invert: (x: number) => Date};

export function computeTouchTimeMsFromLocationX(params: {
  /** Raw `nativeEvent.locationX` (px). */
  rawX: number;

  /** Left margin inside the SVG plot area (px). */
  plotMarginLeft: number;

  /** Width of the drawable plot area (px). */
  plotWidth: number;

  /** D3 time scale (must support `.invert(x)` returning a Date). */
  xScale: TouchTimeScale;
}): number | null {
  const {rawX, plotMarginLeft, plotWidth, xScale} = params;

  if (typeof rawX !== 'number' || !Number.isFinite(rawX)) {
    return null;
  }

  const localX = clamp(rawX - plotMarginLeft, 0, Math.max(0, plotWidth));
  const t = xScale.invert(localX).getTime();
  return Number.isFinite(t) ? t : null;
}

export function buildExternalTooltipPayloadFromLocationX(params: {
  rawX: number;
  plotMarginLeft: number;
  plotWidth: number;
  xScale: TouchTimeScale;
}): CGMGraphExternalTooltipPayload | null {
  const touchTimeMs = computeTouchTimeMsFromLocationX(params);
  if (touchTimeMs == null) {
    return null;
  }

  return {
    touchTimeMs,
    anchorTimeMs: touchTimeMs,
  };
}
