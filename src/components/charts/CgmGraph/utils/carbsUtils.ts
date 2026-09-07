import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {
  BOLUS_HOVER_CONFIG,
  BOLUS_MAX_FOCUS_PROXIMITY_MS,
  BOLUS_TOOLTIP_WINDOW_MS,
} from 'app/components/charts/CgmGraph/constants/bolusHoverConfig';

export type CarbEvent = FoodItemDTO | formattedFoodItemDTO;
export type ValidCarbEvent = CarbEvent & {
  timestamp: number;
  carbs: number;
  id: string;
};

function isValidCarbEvent(item: CarbEvent): item is ValidCarbEvent {
  return (
    typeof item?.id === 'string' &&
    typeof item?.timestamp === 'number' &&
    Number.isFinite(item.timestamp) &&
    typeof item?.carbs === 'number' &&
    Number.isFinite(item.carbs) &&
    item.carbs > 0
  );
}

/** One factual event list for markers, lanes and selection; never proximity-merge records. */
export function buildCarbEvents(
  foodItems: readonly CarbEvent[] | null | undefined,
  domain?: readonly [Date, Date] | null,
): ValidCarbEvent[] {
  const start = domain ? +domain[0] : Number.NEGATIVE_INFINITY;
  const end = domain ? +domain[1] : Number.POSITIVE_INFINITY;
  return (foodItems ?? [])
    .filter(isValidCarbEvent)
    .filter(item => item.timestamp >= start && item.timestamp <= end)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function findClosestCarbEvent(
  touchTimeMs: number,
  foodItems: CarbEvent[],
): (CarbEvent & {id: string; timestamp: number; carbs: number}) | null {
  if (!foodItems?.length) {
    return null;
  }

  const carbs = buildCarbEvents(foodItems);
  if (!carbs.length) {
    return null;
  }

  let closest = carbs[0]!;
  let minDiff = Math.abs(closest.timestamp - touchTimeMs);

  for (const item of carbs) {
    const diff = Math.abs(item.timestamp - touchTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }

  return minDiff <= BOLUS_MAX_FOCUS_PROXIMITY_MS ? closest : null;
}

export function findCarbEventsInTooltipWindow(params: {
  anchorTimeMs: number;
  foodItems: CarbEvent[];
}): Array<CarbEvent & {id: string; timestamp: number; carbs: number}> {
  const {anchorTimeMs, foodItems} = params;

  if (!foodItems?.length) {
    return [];
  }

  const carbs = buildCarbEvents(foodItems);
  if (!carbs.length) {
    return [];
  }

  return carbs
    .map(item => ({item, t: item.timestamp}))
    .filter(({t}) => Math.abs(t - anchorTimeMs) <= BOLUS_TOOLTIP_WINDOW_MS)
    .sort((a, b) => a.t - b.t)
    .slice(0, BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip)
    .map(({item}) => item);
}
