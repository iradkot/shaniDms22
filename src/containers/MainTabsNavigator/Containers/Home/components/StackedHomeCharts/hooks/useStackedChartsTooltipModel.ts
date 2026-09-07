import {useMemo} from 'react';

import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import {MAX_LOAD_CURSOR_DISTANCE_MS} from 'app/utils/chartLoadSeries.utils';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {BOLUS_DETECTION_WINDOW_MS} from 'app/components/charts/CgmGraph/constants/bolusHoverConfig';
import {buildCarbEvents} from 'app/components/charts/CgmGraph/utils/carbsUtils';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type TooltipAlign = 'left' | 'right' | 'auto';

export type StackedChartsTooltipInput = {
  /** Latest emitted tooltip payload from the CGM graph (external tooltip mode). */
  chartsTooltip: {touchTimeMs: number; anchorTimeMs: number} | null;

  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[] | undefined;

  /** If provided, anchors the cursor when there is no touch interaction. */
  fallbackAnchorTimeMs?: number | undefined;

  /** Used only for `tooltipAlign="auto"` calculations. */
  width: number;

  /** Used only for `tooltipAlign="auto"` calculations. */
  marginLeft: number;
  marginRight: number;

  /** Used only for `tooltipAlign="auto"` calculations. */
  xDomain?: [Date, Date] | null | undefined;

  tooltipAlign?: TooltipAlign;
  showFallback?: boolean;
};

export type StackedChartsTooltipModel = {
  shouldShowTooltip: boolean;

  /**
   * Time (ms) used for the CGM cursor + BG tooltip.
   *
   * IMPORTANT:
   * This must never snap to events. It should follow the raw touch time.
   */
  cgmAnchorTimeMs: number;

  /**
   * Time (ms) used to gather nearby bolus/carb events.
   *
   * Uses the same raw cursor and five-minute window as the bolus lane.
   */
  eventsAnchorTimeMs: number;

  /** Cursor time displayed on all stacked charts (null when not touching). */
  cursorTimeMs: number | null;

  resolvedTooltipAlign: 'left' | 'right';

  tooltipBgSample: BgSample | null;

  tooltipBolusEvents: Array<
    InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string}
  >;
  tooltipCarbEvents: Array<
    (FoodItemDTO | formattedFoodItemDTO) & {
      id: string;
      timestamp: number;
      carbs: number;
    }
  >;
};

/**
 * Shared tooltip model for stacked charts.
 *
 * Why this exists:
 * - We show a unified tooltip for multiple charts (CGM + minis).
 * - Users must be able to scrub every CGM sample (no snapping to events).
 * - Event summaries and the dose lane use the same time window.
 */
export function useStackedChartsTooltipModel(
  input: StackedChartsTooltipInput,
): StackedChartsTooltipModel {
  const {
    chartsTooltip,
    bgSamples,
    foodItems,
    insulinData,
    fallbackAnchorTimeMs,
    width,
    marginLeft,
    marginRight,
    xDomain,
    tooltipAlign = 'left',
    showFallback = false,
  } = input;

  const shouldShowTooltip = chartsTooltip != null || showFallback;

  const fallbackAnchorResolvedMs = useMemo(() => {
    return typeof fallbackAnchorTimeMs === 'number' &&
      Number.isFinite(fallbackAnchorTimeMs)
      ? fallbackAnchorTimeMs
      : null;
  }, [fallbackAnchorTimeMs]);

  const latestBgTimeMs = useMemo(() => {
    if (fallbackAnchorResolvedMs != null) {
      return fallbackAnchorResolvedMs;
    }
    if (!bgSamples?.length) {
      return Date.now();
    }
    let best = bgSamples[0]?.date ?? Date.now();
    for (const s of bgSamples) {
      if (typeof s?.date === 'number' && s.date > best) {
        best = s.date;
      }
    }
    return best;
  }, [bgSamples, fallbackAnchorResolvedMs]);

  const cgmAnchorTimeMs = useMemo(() => {
    if (chartsTooltip?.touchTimeMs != null) {
      return chartsTooltip.touchTimeMs;
    }
    if (fallbackAnchorResolvedMs != null) {
      return fallbackAnchorResolvedMs;
    }
    return latestBgTimeMs;
  }, [chartsTooltip?.touchTimeMs, fallbackAnchorResolvedMs, latestBgTimeMs]);

  const eventsAnchorTimeMs = cgmAnchorTimeMs;

  const cursorTimeMs = useMemo(() => {
    return chartsTooltip ? cgmAnchorTimeMs : null;
  }, [cgmAnchorTimeMs, chartsTooltip]);

  const resolvedTooltipAlign = useMemo<'left' | 'right'>(() => {
    if (tooltipAlign !== 'auto') {
      return tooltipAlign;
    }
    if (!shouldShowTooltip || cursorTimeMs == null) {
      return 'right';
    }

    const graphWidth = Math.max(1, width - marginLeft - marginRight);

    const startMs = xDomain?.[0] ? xDomain[0].getTime() : NaN;
    const endMs = xDomain?.[1] ? xDomain[1].getTime() : NaN;
    const spanMs =
      Number.isFinite(startMs) && Number.isFinite(endMs)
        ? endMs - startMs
        : NaN;
    if (!(spanMs > 0)) {
      return 'right';
    }

    const t = clamp01((cursorTimeMs - startMs) / spanMs);
    const cursorX = t * graphWidth;

    return cursorX > graphWidth / 2 ? 'left' : 'right';
  }, [
    cursorTimeMs,
    marginLeft,
    marginRight,
    shouldShowTooltip,
    tooltipAlign,
    width,
    xDomain,
  ]);

  const tooltipBgSample = useMemo(() => {
    if (!shouldShowTooltip) {
      return null;
    }
    if (!bgSamples?.length) {
      return null;
    }
    const sample = findClosestBgSample(cgmAnchorTimeMs, bgSamples);
    return sample &&
      Math.abs(sample.date - cgmAnchorTimeMs) <= MAX_LOAD_CURSOR_DISTANCE_MS
      ? sample
      : null;
  }, [bgSamples, cgmAnchorTimeMs, shouldShowTooltip]);

  const tooltipBolusEvents = useMemo(() => {
    if (!shouldShowTooltip) {
      return [];
    }
    if (!insulinData?.length) {
      return [];
    }
    return insulinData
      .filter(
        (
          entry,
        ): entry is InsulinDataEntry & {
          type: 'bolus';
          amount: number;
          timestamp: string;
        } => {
          if (
            entry.type !== 'bolus' ||
            typeof entry.amount !== 'number' ||
            !Number.isFinite(entry.amount) ||
            entry.amount <= 0 ||
            typeof entry.timestamp !== 'string'
          ) {
            return false;
          }
          const timeMs = Date.parse(entry.timestamp);
          return (
            (!xDomain || (timeMs >= +xDomain[0] && timeMs <= +xDomain[1])) &&
            Math.abs(timeMs - eventsAnchorTimeMs) <= BOLUS_DETECTION_WINDOW_MS
          );
        },
      )
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }, [eventsAnchorTimeMs, insulinData, shouldShowTooltip, xDomain]);

  const carbEvents = useMemo(
    () => buildCarbEvents(foodItems, xDomain),
    [foodItems, xDomain],
  );
  const tooltipCarbEvents = useMemo(() => {
    if (!shouldShowTooltip) {
      return [];
    }
    return carbEvents.filter(
      entry =>
        Math.abs(entry.timestamp - eventsAnchorTimeMs) <=
        BOLUS_DETECTION_WINDOW_MS,
    );
  }, [eventsAnchorTimeMs, carbEvents, shouldShowTooltip]);

  return {
    shouldShowTooltip,
    cgmAnchorTimeMs,
    eventsAnchorTimeMs,
    cursorTimeMs,
    resolvedTooltipAlign,
    tooltipBgSample,
    tooltipBolusEvents,
    tooltipCarbEvents,
  };
}
