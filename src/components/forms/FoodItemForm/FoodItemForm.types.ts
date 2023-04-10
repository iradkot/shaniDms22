import React, {MutableRefObject} from 'react';
import {KeyboardType, ReturnKeyType, TextInput} from 'react-native';
import {AddFoodItem} from 'app/hooks/foods/useAddFoodItem';
import {FoodItemDTO} from 'app/types/food.types';

export interface FoodItemFormProps {
  foodItem?: AddFoodItem; // Make this prop optional
  onSubmit: (
    foodItem: AddFoodItem,
    foodItemFromProps?: FoodItemDTO,
  ) => Promise<void>;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
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
