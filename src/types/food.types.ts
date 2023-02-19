import {BgSample} from 'app/types/day_bgs';

export interface FoodItemDTO {
  carbs: number;
  name: string;
  image: string;
  notes: string;
  score: number;
  timestamp: number; // timestamp in millisecondsFoodItemDTO
}

export interface formattedItemDTO extends FoodItemDTO {
  localDateString: string; // formatted date
  time: string; // formatted
  bgData: BgSample[];
}
