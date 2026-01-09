import {useMemo} from 'react';

import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {findBolusEventsInTooltipWindow, findClosestBolus} from 'app/components/charts/CgmGraph/utils/bolusUtils';
import {findCarbEventsInTooltipWindow, findClosestCarbEvent} from 'app/components/charts/CgmGraph/utils/carbsUtils';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type TooltipAlign = 'left' | 'right' | 'auto';

export type StackedChartsTooltipInput = {
  /** Latest emitted tooltip payload from the CGM graph (external tooltip mode). */
  chartsTooltip: {touchTimeMs: number; anchorTimeMs: number} | null;

  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];

  /** If provided, anchors the cursor when there is no touch interaction. */
  fallbackAnchorTimeMs?: number;

  /** Used only for `tooltipAlign="auto"` calculations. */
  width: number;

  /** Used only for `tooltipAlign="auto"` calculations. */
  marginLeft: number;
  marginRight: number;

  /** Used only for `tooltipAlign="auto"` calculations. */
  xDomain?: [Date, Date] | null;

  tooltipAlign?: TooltipAlign;
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
   * This may snap to the closest event to capture clusters reliably,
   * but must not influence `cgmAnchorTimeMs`.
   */
  eventsAnchorTimeMs: number;

  /** Cursor time displayed on all stacked charts (null when not touching). */
  cursorTimeMs: number | null;

  resolvedTooltipAlign: 'left' | 'right';

  tooltipBgSample: BgSample | null;

  tooltipBolusEvents: Array<InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string}>;
  tooltipCarbEvents: Array<(FoodItemDTO | formattedFoodItemDTO) & {id: string; timestamp: number; carbs: number}>;
};

/**
 * Shared tooltip model for stacked charts.
 *
 * Why this exists:
 * - We show a unified tooltip for multiple charts (CGM + minis).
 * - Users must be able to scrub every CGM sample (no snapping to events).
 * - We still want to cluster nearby boluses/carbs (snapping is allowed for event windowing only).
 */
export function useStackedChartsTooltipModel(input: StackedChartsTooltipInput): StackedChartsTooltipModel {
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
  } = input;

  const shouldShowTooltip = chartsTooltip != null;

  const fallbackAnchorResolvedMs = useMemo(() => {
    return typeof fallbackAnchorTimeMs === 'number' && Number.isFinite(fallbackAnchorTimeMs)
      ? fallbackAnchorTimeMs
      : null;
  }, [fallbackAnchorTimeMs]);

  const latestBgTimeMs = useMemo(() => {
    if (fallbackAnchorResolvedMs != null) return fallbackAnchorResolvedMs;
    if (!bgSamples?.length) return Date.now();
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
    if (fallbackAnchorResolvedMs != null) return fallbackAnchorResolvedMs;
    return latestBgTimeMs;
  }, [chartsTooltip?.touchTimeMs, fallbackAnchorResolvedMs, latestBgTimeMs]);

  const eventsAnchorTimeMs = useMemo(() => {
    if (chartsTooltip?.touchTimeMs != null) {
      const touchTimeMs = chartsTooltip.touchTimeMs;

      const closestBolus = insulinData?.length ? findClosestBolus(touchTimeMs, insulinData) : null;
      if (closestBolus?.timestamp) {
        const t = Date.parse(closestBolus.timestamp);
        if (Number.isFinite(t)) return t;
      }

      const closestCarb = foodItems?.length ? findClosestCarbEvent(touchTimeMs, foodItems) : null;
      if (closestCarb?.timestamp != null) {
        return closestCarb.timestamp;
      }

      return touchTimeMs;
    }

    return cgmAnchorTimeMs;
  }, [cgmAnchorTimeMs, chartsTooltip?.touchTimeMs, foodItems, insulinData]);

  const cursorTimeMs = useMemo(() => {
    return shouldShowTooltip ? cgmAnchorTimeMs : null;
  }, [cgmAnchorTimeMs, shouldShowTooltip]);

  const resolvedTooltipAlign = useMemo<'left' | 'right'>(() => {
    if (tooltipAlign !== 'auto') return tooltipAlign;
    if (!shouldShowTooltip || cursorTimeMs == null) return 'right';

    const graphWidth = Math.max(1, width - marginLeft - marginRight);

    const startMs = xDomain?.[0] ? xDomain[0].getTime() : NaN;
    const endMs = xDomain?.[1] ? xDomain[1].getTime() : NaN;
    const spanMs = Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : NaN;
    if (!(spanMs > 0)) return 'right';

    const t = clamp01((cursorTimeMs - startMs) / spanMs);
    const cursorX = t * graphWidth;

    return cursorX > graphWidth / 2 ? 'left' : 'right';
  }, [cursorTimeMs, marginLeft, marginRight, shouldShowTooltip, tooltipAlign, width, xDomain]);

  const tooltipBgSample = useMemo(() => {
    if (!shouldShowTooltip) return null;
    if (!bgSamples?.length) return null;
    return findClosestBgSample(cgmAnchorTimeMs, bgSamples);
  }, [bgSamples, cgmAnchorTimeMs, shouldShowTooltip]);

  const tooltipBolusEvents = useMemo(() => {
    if (!shouldShowTooltip) return [];
    if (!insulinData?.length) return [];
    return findBolusEventsInTooltipWindow({anchorTimeMs: eventsAnchorTimeMs, insulinData});
  }, [eventsAnchorTimeMs, insulinData, shouldShowTooltip]);

  const tooltipCarbEvents = useMemo(() => {
    if (!shouldShowTooltip) return [];
    if (!foodItems?.length) return [];
    return findCarbEventsInTooltipWindow({anchorTimeMs: eventsAnchorTimeMs, foodItems});
  }, [eventsAnchorTimeMs, foodItems, shouldShowTooltip]);

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
