import {useMemo} from 'react';

import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {InsulinDataEntry} from 'app/types/insulin.types';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {
  findBolusEventsInTooltipWindow,
  findClosestBolus,
} from 'app/components/charts/CgmGraph/utils/bolusUtils';
import {
  findCarbEventsInTooltipWindow,
  findClosestCarbEvent,
} from 'app/components/charts/CgmGraph/utils/carbsUtils';

export type CgmGraphTooltipMode = 'internal' | 'external';

export type CgmGraphTooltipModel = {
  closestBgSample: BgSample | null;

  /**
   * Anchor used for CGM reading + crosshair.
   *
   * IMPORTANT: this must never snap to nearby events.
   */
  cgmAnchorTimeMs: number | null;

  /**
   * Anchor used for gathering “nearby” bolus/carb events.
   *
   * This may snap to the nearest event to make clustered events easier to collect,
   * but must not affect the CGM cursor.
   */
  eventsAnchorTimeMs: number | null;

  tooltipBolusEvents: Array<InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string}>;
  tooltipCarbEvents: Array<(FoodItemDTO | formattedFoodItemDTO) & {id: string; timestamp: number; carbs: number}>;

  focusedFoodItemIds: string[];
  focusedBolusTimestamps: string[];

  showCombined: boolean;
  showCombinedMulti: boolean;
  showBgOnly: boolean;
  showBolusOnly: boolean;

  shouldUseExternalCursor: boolean;
};

/**
 * Builds all derived tooltip state for `CgmGraph`.
 *
 * Key design goal:
 * - CGM values should always follow the touch/cursor time.
 * - Event clustering (boluses/carbs) can anchor to nearby events without snapping CGM.
 */
export function useCgmGraphTooltipModel(params: {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];

  tooltipMode: CgmGraphTooltipMode;
  cursorTimeMs?: number | null;

  isTouchActive: boolean;
  touchTimeMs: number | null;
}): CgmGraphTooltipModel {
  const {
    bgSamples,
    foodItems,
    insulinData,
    tooltipMode,
    cursorTimeMs,
    isTouchActive,
    touchTimeMs,
  } = params;

  const shouldUseExternalCursor = tooltipMode === 'external' && cursorTimeMs != null;

  const closestBgSample = useMemo(() => {
    return isTouchActive && touchTimeMs != null
      ? findClosestBgSample(touchTimeMs, bgSamples)
      : null;
  }, [bgSamples, isTouchActive, touchTimeMs]);

  const closestBolus = useMemo(() => {
    // In external mode, cursor snapping/windowing is expected to be driven by the parent.
    if (shouldUseExternalCursor) return null;
    if (!isTouchActive || touchTimeMs == null) return null;
    if (!insulinData?.length) return null;
    return findClosestBolus(touchTimeMs, insulinData);
  }, [insulinData, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const closestCarb = useMemo(() => {
    if (shouldUseExternalCursor) return null;
    if (!isTouchActive || touchTimeMs == null) return null;
    if (!foodItems?.length) return null;
    return findClosestCarbEvent(touchTimeMs, foodItems);
  }, [foodItems, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const cgmAnchorTimeMs = useMemo(() => {
    if (!isTouchActive) return null;
    if (touchTimeMs == null) return null;

    if (shouldUseExternalCursor) {
      return cursorTimeMs as number;
    }

    return touchTimeMs;
  }, [cursorTimeMs, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const eventsAnchorTimeMs = useMemo(() => {
    if (!isTouchActive) return null;
    if (touchTimeMs == null) return null;

    if (shouldUseExternalCursor) {
      return cursorTimeMs as number;
    }

    if (closestBolus?.timestamp != null) {
      const t = new Date(closestBolus.timestamp).getTime();
      if (Number.isFinite(t)) return t;
    }
    if (closestCarb?.timestamp != null) {
      return closestCarb.timestamp;
    }

    return touchTimeMs;
  }, [closestBolus?.timestamp, closestCarb?.timestamp, cursorTimeMs, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const tooltipBolusEvents = useMemo(() => {
    if (!isTouchActive) return [];
    if (eventsAnchorTimeMs == null) return [];
    if (!insulinData?.length) return [];

    return findBolusEventsInTooltipWindow({
      anchorTimeMs: eventsAnchorTimeMs,
      insulinData,
    });
  }, [eventsAnchorTimeMs, insulinData, isTouchActive]);

  const tooltipCarbEvents = useMemo(() => {
    if (!isTouchActive) return [];
    if (!foodItems?.length) return [];
    if (eventsAnchorTimeMs == null) return [];

    return findCarbEventsInTooltipWindow({anchorTimeMs: eventsAnchorTimeMs, foodItems});
  }, [eventsAnchorTimeMs, foodItems, isTouchActive]);

  // Avoid prop identity churn during touch-move renders.
  const focusedFoodItemIds = useMemo(() => tooltipCarbEvents.map(c => c.id), [tooltipCarbEvents]);
  const focusedBolusTimestamps = useMemo(
    () => tooltipBolusEvents.map(b => b.timestamp),
    [tooltipBolusEvents],
  );

  const showCombined = !!closestBgSample && tooltipBolusEvents.length === 1;
  const showCombinedMulti = !!closestBgSample && tooltipBolusEvents.length > 1;
  const showBgOnly = !!closestBgSample && tooltipBolusEvents.length === 0;
  const showBolusOnly = !closestBgSample && tooltipBolusEvents.length > 0;

  return {
    closestBgSample,
    cgmAnchorTimeMs,
    eventsAnchorTimeMs,
    tooltipBolusEvents,
    tooltipCarbEvents,
    focusedFoodItemIds,
    focusedBolusTimestamps,
    showCombined,
    showCombinedMulti,
    showBgOnly,
    showBolusOnly,
    shouldUseExternalCursor,
  };
}
