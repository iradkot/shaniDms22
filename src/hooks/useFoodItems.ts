// hooks/useFoodItems.ts
import {useState, useEffect} from 'react';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {formatFoodItem} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/utils';

export const useFoodItems = (currentDate: Date) => {
  const [foodItems, setFoodItems] = useState<formattedFoodItemDTO[]>([]);

  useEffect(() => {
    const fsManager = new FirebaseService();
    const date = new Date(currentDate);
    fsManager.getFoodItems(date).then(items => {
      Promise.all(
        items.map((item: FoodItemDTO) => formatFoodItem(item, fsManager)),
      ).then(formattedItems => {
        setFoodItems(formattedItems);
      });
    });
  }, []);

  return {
    foodItems,
  };
};
