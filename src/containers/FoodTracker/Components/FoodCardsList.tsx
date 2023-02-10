// The FooCardsList component is a list of FoodCard components
// The FoodCard component is a card that displays the food item's name, image, notes, and date
// The FoodTracker component is a container that holds the FoodCardsList component

// Based on this file, create a RN typescript with styled components, FoodCards list renderer Path: src/containers/FoodTracker/Components/FoodCard.tsx

import {FlatList} from 'react-native';
import React from 'react';
import FoodCard from 'app/containers/FoodTracker/Components/FoodCard';
import {formattedItemDTO} from 'app/types/foodItems.types';

interface FoodCardsListProps {
  foodItems: formattedItemDTO[];
}
const FoodCardsList: React.FC<FoodCardsListProps> = ({foodItems}) => {
  if (!foodItems) {
    return <></>;
  }
  return (
    <FlatList
      data={foodItems}
      scrollEnabled={false}
      renderItem={({item}) => (
        <FoodCard
          image={item.image}
          name={item.name}
          bgData={item.bgData || []}
          date={item.localDateString}
          notes={item.notes}
        />
      )}
      keyExtractor={item => item.localDateString}
    />
  );
};

export default FoodCardsList;
