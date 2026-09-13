import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';

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
