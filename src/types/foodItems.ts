import {BgSample} from 'app/types/day_bgs';

export interface FoodItemDTO {
  name: string;
  image: string;
  notes: string;
  score: number;
  timestamp: number; // timestamp in millisecondsFoodItemDTO
}
