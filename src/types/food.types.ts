import {CommonFormattedEvent} from 'app/types/commonEvent.types';

export interface FoodItemDTO {
  carbs: number;
  name: string;
  image: string;
  notes: string;
  score: number;
  timestamp: number; // timestamp in millisecondsFoodItemDTO
}

export interface formattedFoodItemDTO
  extends FoodItemDTO,
    CommonFormattedEvent {}
