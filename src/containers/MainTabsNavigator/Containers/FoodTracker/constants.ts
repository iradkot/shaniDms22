import {MealSlot} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';

/** Map meal-slot → Ionicons / MaterialCommunityIcons name. */
export const MEAL_SLOT_ICON: Record<MealSlot, {name: string; set: 'ionicons' | 'mci'}> = {
  breakfast: {name: 'sunny-outline', set: 'ionicons'},          // ☀ sunrise / morning
  lunch: {name: 'food', set: 'mci'},                            // 🍴 fork+knife
  dinner: {name: 'weather-night', set: 'mci'},                  // 🌙 moon
  snack: {name: 'food-apple-outline', set: 'mci'},              // 🍎 apple
};

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
