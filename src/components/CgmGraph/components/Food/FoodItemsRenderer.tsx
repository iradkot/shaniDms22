import React, {useContext} from 'react';
import {FoodItemDTO, formattedItemDTO} from 'app/types/food.types';
import {FoodItem} from 'app/components/CgmGraph/components/Food/FoodItem';
import {GraphStyleContext} from '../../contextStores/GraphStyleContext';

interface Props {
  foodItems: FoodItemDTO[] | formattedItemDTO[] | null;
}

const FoodItemsRenderer = ({foodItems}: Props): JSX.Element => {
  const [focusedItem, setFocusedItem] = React.useState<FoodItemDTO | null>(
    null,
  );
  return (
    <>
      {foodItems?.map((item, index) => (
        <FoodItem
          key={index}
          foodItem={item}
          isFocused={focusedItem?.timestamp === item?.timestamp}
          setFocusedItem={setFocusedItem}
        />
      ))}
    </>
  );
};

export default FoodItemsRenderer;
