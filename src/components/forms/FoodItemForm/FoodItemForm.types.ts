import React, {MutableRefObject} from 'react';
import {KeyboardType, ReturnKeyType, TextInput} from 'react-native';
import {AddFoodItem} from 'app/hooks/foods/useAddFoodItem';

export type FoodItemFormProps = {
  foodItem: AddFoodItem | null;
  onSubmit: (foodItem: AddFoodItem) => Promise<void>;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
};

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
