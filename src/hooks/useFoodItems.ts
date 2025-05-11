import {useState, useEffect} from 'react';
import FirebaseService from 'app/api/firebase/FirebaseService'; // Assuming default export is used
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {formatFoodItem} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/utils';

export const useFoodItems = (currentDate: Date) => {
  const [foodItems, setFoodItems] = useState<formattedFoodItemDTO[]>([]);

  useEffect(() => {
    // Track this effect's active status to prevent updates after cancellation
    let isActive = true;
    (async () => {
      // Validate date
      if (!currentDate || !(currentDate instanceof Date) || isNaN(currentDate.getTime())) {
        if (isActive) {
          setFoodItems([]);
        }
        return;
      }
      const date = new Date(currentDate);
      try {
        const items = await FirebaseService.getFoodItemsForSingleDay(date);
        const formattedItems = await Promise.all(
          items.map((item: FoodItemDTO) => formatFoodItem(item)),
        );
        if (isActive) {
          setFoodItems(prev =>
            JSON.stringify(prev) === JSON.stringify(formattedItems)
              ? prev
              : formattedItems,
          );
        }
      } catch (err: any) {
        console.warn('useFoodItems: Failed to fetch items', err);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [currentDate]);

  return {
    foodItems,
  };
};
