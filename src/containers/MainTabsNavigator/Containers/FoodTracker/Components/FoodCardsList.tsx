// The FooCardsList component is a list of FoodCard components
// The FoodCard component is a card that displays the food item's name, image, notes, and date
// The FoodTracker component is a container that holds the FoodCardsList component

// Based on this file, create a RN typescript with styled components, FoodCards list renderer Path: src/containers/FoodTracker/Components/FoodCard.tsx

import React from 'react';
import FoodCard from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/FoodCard';
import {formattedFoodItemDTO} from 'app/types/food.types';
import {useNavigation} from '@react-navigation/native';
import {EDIT_FOOD_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';

interface FoodCardsListProps {
  foodItems: formattedFoodItemDTO[];
  setFsFoodItems: (foodItems: formattedFoodItemDTO[]) => void;
}

const FoodCardsList: ({
  foodItems,
  setFsFoodItems,
}: FoodCardsListProps) => JSX.Element = ({foodItems, setFsFoodItems}) => {
  const navigation = useNavigation();
  if (!foodItems) {
    return <></>;
  }
  return foodItems.map(
    (item: formattedFoodItemDTO, index: React.Key | null | undefined) => (
      <FoodCard
        onEdit={() => {
          // @ts-ignore
          navigation.navigate(EDIT_FOOD_ITEM_SCREEN, {
            foodItem: item,
            setFsFoodItems: setFsFoodItems,
          });
        }}
        key={index}
        foodItem={item}
        imageUri={item.image}
        name={item.name}
        bgSamples={item.bgData || []}
        date={item.localDateString}
        notes={item.notes}
        carbsGrams={item.carbs}
      />
    ),
  );
};

export default FoodCardsList;
