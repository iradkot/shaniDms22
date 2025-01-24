import {useState, useEffect} from 'react';
import FirebaseService from 'app/api/firebase/FirebaseService'; // Assuming default export is used
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {formatFoodItem} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/utils';

export const useFoodItems = (currentDate: Date) => {
  const [foodItems, setFoodItems] = useState<formattedFoodItemDTO[]>([]);

  useEffect(() => {
    const date = new Date(currentDate);
    FirebaseService.getFoodItemsForSingleDay(date).then(items => {
      // Updated to use getFoodItemsForSingleDay
      Promise.all(
        items.map((item: FoodItemDTO) => formatFoodItem(item)), // This might need adjustment if formatFoodItem specifically needs a FoodService instance
      ).then(formattedItems => {
        setFoodItems(formattedItems);
      });
    });
  }, [currentDate]); // Added currentDate as a dependency to useEffect

  return {
    foodItems,
  };
};
