import * as d3 from 'd3';
import React from 'react';
import {View, Text} from 'react-native';
import {FoodItemDTO, formattedItemDTO} from 'app/types/food.types';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface Props {
  foodItems: FoodItemDTO[] | null;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
}

const FoodItemsRenderer: ({
  foodItems,
  xScale,
  yScale,
}: {
  foodItems: any;
  xScale: any;
  yScale: any;
}) => JSX.Element = ({foodItems, xScale, yScale}) => {
  console.log('foodItems', foodItems);
  return (
    foodItems?.map(
      (
        item: {timestamp: string | number | Date; name: string; carbs: number},
        index: React.Key | null | undefined,
      ) => {
        const x = xScale(new Date(item.timestamp));
        const y = yScale(280);

        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              top: y,
              left: x,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="restaurant" size={20} color="black" />
            <Text style={{fontSize: 12, textAlign: 'center'}}>
              {item.name} ({item.carbs}g)
            </Text>
          </View>
        );
      },
    ) || <></>
  );
};

export default FoodItemsRenderer;
