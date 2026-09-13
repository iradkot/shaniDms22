import {useMemo} from 'react';

import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {InsulinDataEntry} from 'app/types/insulin.types';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {
  BOLUS_HOVER_CONFIG,
  BOLUS_MAX_FOCUS_PROXIMITY_MS,
  BOLUS_TOOLTIP_WINDOW_MS,
} from 'app/components/charts/CgmGraph/constants/bolusHoverConfig';
import {
  createBolusTooltipIndex,
  createCarbTooltipIndex,
} from 'app/components/charts/CgmGraph/utils/tooltipEventIndex';

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

  focusedFoodItemIds: string[];
  focusedBolusTimestamps: string[];

  showCombined: boolean;
  showCombinedMulti: boolean;
  showBgOnly: boolean;
  showBolusOnly: boolean;

  shouldUseExternalCursor: boolean;
};

export function resolveCgmTooltipInteractionTime(params: {
  tooltipMode: CgmGraphTooltipMode;
  cursorTimeMs?: number | null | undefined;
  isTouchActive: boolean;
  touchTimeMs: number | null;
}) {
  const {tooltipMode, cursorTimeMs, isTouchActive, touchTimeMs} = params;
  const shouldUseExternalCursor =
    tooltipMode === 'external' && cursorTimeMs != null;
  const activeTimeMs = shouldUseExternalCursor
    ? cursorTimeMs
    : isTouchActive
    ? touchTimeMs
    : null;

  return {
    activeTimeMs,
    isInteractionActive: activeTimeMs != null,
    shouldUseExternalCursor,
  };
}

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
  insulinData?: InsulinDataEntry[] | undefined;

  tooltipMode: CgmGraphTooltipMode;
  cursorTimeMs?: number | null | undefined;

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

  const {activeTimeMs, isInteractionActive, shouldUseExternalCursor} =
    resolveCgmTooltipInteractionTime({
      tooltipMode,
      cursorTimeMs,
      isTouchActive,
      touchTimeMs,
    });

  const closestBgSample = useMemo(() => {
    return isInteractionActive
      ? findClosestBgSample(activeTimeMs as number, bgSamples)
      : null;
  }, [activeTimeMs, bgSamples, isInteractionActive]);

  const bolusIndex = useMemo(
    () => createBolusTooltipIndex(insulinData),
    [insulinData],
  );
  const carbIndex = useMemo(
    () => createCarbTooltipIndex(foodItems),
    [foodItems],
  );

  const closestBolusTimeMs = useMemo(() => {
    // In external mode, cursor snapping/windowing is expected to be driven by the parent.
    if (shouldUseExternalCursor) {
      return null;
    }
    if (!isTouchActive || touchTimeMs == null) {
      return null;
    }
    return bolusIndex.closestTime(touchTimeMs, BOLUS_MAX_FOCUS_PROXIMITY_MS);
  }, [bolusIndex, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const closestCarbTimeMs = useMemo(() => {
    if (shouldUseExternalCursor) {
      return null;
    }
    if (!isTouchActive || touchTimeMs == null) {
      return null;
    }
    return carbIndex.closestTime(touchTimeMs, BOLUS_MAX_FOCUS_PROXIMITY_MS);
  }, [carbIndex, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const cgmAnchorTimeMs = useMemo(() => {
    if (shouldUseExternalCursor) {
      return cursorTimeMs as number;
    }

    return isInteractionActive ? touchTimeMs : null;
  }, [cursorTimeMs, isInteractionActive, shouldUseExternalCursor, touchTimeMs]);

  const eventsAnchorTimeMs = useMemo(() => {
    if (shouldUseExternalCursor) {
      return cursorTimeMs as number;
    }
    if (!isInteractionActive || touchTimeMs == null) {
      return null;
    }

    if (closestBolusTimeMs != null) {
      return closestBolusTimeMs;
    }
    if (closestCarbTimeMs != null) {
      return closestCarbTimeMs;
    }

    return touchTimeMs;
  }, [
    closestBolusTimeMs,
    closestCarbTimeMs,
    cursorTimeMs,
    isInteractionActive,
    shouldUseExternalCursor,
    touchTimeMs,
  ]);

  const tooltipBolusEvents = useMemo(() => {
    if (!isInteractionActive) {
      return [];
    }
    if (eventsAnchorTimeMs == null) {
      return [];
    }
    return bolusIndex.within(
      eventsAnchorTimeMs,
      BOLUS_TOOLTIP_WINDOW_MS,
      BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
    );
  }, [eventsAnchorTimeMs, bolusIndex, isInteractionActive]);

  const tooltipCarbEvents = useMemo(() => {
    if (!isInteractionActive) {
      return [];
    }
    if (eventsAnchorTimeMs == null) {
      return [];
    }

    return carbIndex.within(
      eventsAnchorTimeMs,
      BOLUS_TOOLTIP_WINDOW_MS,
      BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
    );
  }, [eventsAnchorTimeMs, carbIndex, isInteractionActive]);

  // Avoid prop identity churn during touch-move renders.
  const focusedFoodItemIds = useMemo(
    () => tooltipCarbEvents.map(c => c.id),
    [tooltipCarbEvents],
  );
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
