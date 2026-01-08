import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {
  BOLUS_HOVER_CONFIG,
  BOLUS_MAX_FOCUS_PROXIMITY_MS,
  BOLUS_TOOLTIP_WINDOW_MS,
} from 'app/components/charts/CgmGraph/constants/bolusHoverConfig';

export type CarbEvent = FoodItemDTO | formattedFoodItemDTO;

function isValidCarbEvent(item: CarbEvent): item is CarbEvent & {
  timestamp: number;
  carbs: number;
  id: string;
} {
  return (
    typeof (item as any)?.id === 'string' &&
    typeof (item as any)?.timestamp === 'number' &&
    Number.isFinite((item as any).timestamp) &&
    typeof (item as any)?.carbs === 'number' &&
    Number.isFinite((item as any).carbs) &&
    (item as any).carbs > 0
  );
}

export function findClosestCarbEvent(touchTimeMs: number, foodItems: CarbEvent[]):
  | (CarbEvent & {id: string; timestamp: number; carbs: number})
  | null {
  if (!foodItems?.length) {
    return null;
  }

  const carbs = foodItems.filter(isValidCarbEvent);
  if (!carbs.length) {
    return null;
  }

  let closest = carbs[0];
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

  const carbs = foodItems.filter(isValidCarbEvent);
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
