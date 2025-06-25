// src/types/food.types.ts

import { CameraCapturedPicture } from 'expo-camera';
import {CommonFormattedEvent} from 'app/types/commonEvent.types';
import {KeyboardType, ReturnKeyType, TextInput} from 'react-native';

export interface FoodItemDTO {
  id: string;
  carbs: number;
  name: string;
  image: string;
  notes: string;
  score: number;
  timestamp: number; // timestamp in milliseconds
}

export interface FormattedFoodItemDTO
  extends FoodItemDTO,
    CommonFormattedEvent {
  id: string;
}

export interface GroupedMeal {
  date: string;
  meals: FormattedFoodItemDTO[];
  count: number;
}

export interface AddFoodItem extends Omit<FoodItemDTO, 'id' | 'image'> {
  image: CameraCapturedPicture;
}

export interface FoodItemFormProps {
  foodItem?: AddFoodItem; // Make this prop optional
  onSubmit: (
    foodItem: AddFoodItem,
    foodItemFromProps?: FoodItemDTO,
  ) => Promise<void>;
  submitHandlerRef: React.MutableRefObject<null | (() => void)>;
}

export interface InputControllerProps {
  ref: React.RefObject<TextInput>;
  name: 'name' | 'carbs' | 'image' | 'notes' | 'timestamp';
  placeholder: string;
  keyboardType: KeyboardType;
  returnKeyType: ReturnKeyType;
  onSubmitEditing: () => void;
  rules: any;
  selectTextOnFocus?: boolean;
}
