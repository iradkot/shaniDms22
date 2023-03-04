import * as d3 from 'd3';
import React from 'react';
import {View, Text, Pressable, TouchableOpacity} from 'react-native';
import styled from 'styled-components/native';
import {FoodItemDTO} from 'app/types/food.types';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {Theme} from 'app/types/theme';

interface Props {
  foodItems: FoodItemDTO[] | null;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
}

interface FoodItemProps {
  foodItem: FoodItemDTO;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  isFocused: boolean;
  setFocusedItem: (item: FoodItemDTO | null) => void;
}

const FoodItem = ({
  foodItem,
  xScale,
  yScale,
  isFocused,
  setFocusedItem,
}: FoodItemProps): JSX.Element => {
  const x = xScale(new Date(foodItem.timestamp));
  const y = yScale(280);
  return (
    <Pressable
      onPress={() => {
        console.log('FOOD ITEM', foodItem);
        setFocusedItem(foodItem);
      }}
      onLongPress={() => setFocusedItem(null)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: isFocused ? 100 : 5,
      }}>
      <Container isFocused={isFocused}>
        <StyledIcon name="restaurant" size={20} />
        <StyledText>{foodItem.name}</StyledText>
      </Container>
    </Pressable>
  );
};
const FoodItemsRenderer = ({foodItems, xScale, yScale}: Props): JSX.Element => {
  const [focusedItem, setFocusedItem] = React.useState<FoodItemDTO | null>(
    null,
  );
  return (
    <>
      {foodItems?.map((item, index) => (
        <FoodItem
          key={index}
          foodItem={item}
          xScale={xScale}
          yScale={yScale}
          isFocused={focusedItem?.timestamp === item.timestamp}
          setFocusedItem={setFocusedItem}
        />
      ))}
    </>
  );
};

const Container = styled.View<{theme: Theme; isFocused: Boolean}>`
  position: absolute;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}) => theme.accentColor};
  ${({theme}) => theme.shadow.small};
  border-radius: 5px;
  padding: 5px;
  border: 1px solid ${({theme}) => theme.buttonTextColor};
  z-index: ${({isFocused}) => (isFocused ? 100 : 5)};
`;

const StyledText = styled.Text<{theme: Theme}>`
  font-size: 12px;
  text-align: center;
  color: ${({theme}) => theme.buttonTextColor};
`;

const StyledIcon = styled(Icon)`
  color: ${({theme}) => theme.buttonTextColor};
`;

export default FoodItemsRenderer;
