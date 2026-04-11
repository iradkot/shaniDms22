import {Text, Rect} from 'react-native-svg';
// Ensure XTick is correctly imported if it's a custom component
// If XTick is not an SVG component, adjust its usage accordingly

// Import statements for other dependencies
import React, {useContext, useState} from 'react';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
// Adjusted import for XTick if it's an SVG-based component or ensure correct prop forwarding if custom
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {TouchableOpacity} from 'react-native';

interface FoodItemProps {
  foodItem: FoodItemDTO | formattedFoodItemDTO;
  isFocused: boolean;
  setFocusedItem: (
    item: (preFocusedItem: any) => null | FoodItemDTO | formattedFoodItemDTO,
  ) => void;
}

export const FoodItem = ({
  foodItem,
  isFocused,
  setFocusedItem,
}: FoodItemProps): JSX.Element => {
  const appTheme = useTheme();
  const [{xScale, yScale, margin}] = useContext(GraphStyleContext);

  const x = xScale(new Date(foodItem.timestamp));
  const y = yScale(300);

  // Function to toggle focus state of the item
  const handlePress = () => {
    setFocusedItem(prevItem =>
      prevItem?.id === foodItem.id ? null : foodItem,
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{
        position: 'absolute',
        left: x + margin.left,
        top: y + margin.top,
        zIndex: isFocused ? 100 : 5,
      }}>
      <Container isFocused={isFocused}>
        <StyledIcon
          name="restaurant"
          size={24}
          color={isFocused ? appTheme.primaryColor : appTheme.textColor}
        />
        {isFocused && (
          <>
            <FoodItemDetails>
              <FoodItemName>{foodItem.name}</FoodItemName>
              <ItemDetails>
                Carbs: {foodItem.carbs}g -{' '}
                {formatDateToLocaleTimeString(foodItem.timestamp)}
              </ItemDetails>
            </FoodItemDetails>
            <XTick
              x={x}
              lineStyle={{stroke: appTheme.accentColor, strokeWidth: 2}}
            />
            <Text
              x={x}
              y={y + 20} // Adjust based on your actual layout needs
              fontSize={12}
              textAnchor="middle"
              fill={appTheme.textColor}>
              {formatDateToLocaleTimeString(foodItem.timestamp)}
            </Text>
          </>
        )}
      </Container>
    </TouchableOpacity>
  );
};

// Adjusted for conditional props
const Container = styled.View<{isFocused: boolean}>`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border-radius: ${({theme}) => theme.borderRadius}px;
  border: 1px solid
    ${({theme, isFocused}) => (isFocused ? theme.primaryColor : 'transparent')};
  background-color: ${({theme, isFocused}) =>
    isFocused ? theme.backgroundColor : 'transparent'};
  ${({theme, isFocused}) => isFocused && theme.shadow.default};
`;

const FoodItemDetails = styled.View`
  margin-left: 10px;
`;

const FoodItemName = styled.Text`
  color: ${({theme}) => theme.textColor};
  font-size: 16px;
  font-weight: bold;
`;

const ItemDetails = styled.Text`
  color: ${({theme}) => theme.textColor};
  font-size: 14px;
  opacity: 0.8;
`;

const StyledIcon = styled(Icon)<{color: string}>`
  color: ${({color}) => color};
`;

const XTick = styled.View`
  /* Placeholder for the actual XTick component */
  height: 1px;
  background-color: ${({theme}) => theme.accentColor};
  width: 100%; /* Adjust based on your layout */
`;
