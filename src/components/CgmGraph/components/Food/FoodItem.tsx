import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import styled, {useTheme} from 'styled-components/native';
import {Theme} from 'app/types/theme';
import React, {useContext} from 'react';
import {Rect, Text} from 'react-native-svg';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import Icon from 'react-native-vector-icons/MaterialIcons';
import XTick from 'app/components/CgmGraph/components/XTick';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import {theme} from 'app/style/theme';

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
  const appTheme = useTheme() as typeof theme;
  const [{xScale, yScale, margin}] = useContext(GraphStyleContext);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const [containerHeight, setContainerHeight] = React.useState<number>(0);

  const x = xScale(new Date(foodItem.timestamp));
  const y = yScale(300);
  return (
    <>
      <Container
        isFocused={isFocused}
        onLayout={event => {
          const {width, height} = event.nativeEvent.layout;
          setContainerWidth(width);
          setContainerHeight(height);
        }}
        style={{
          position: 'absolute',
          left: x + margin.left - containerWidth / 2,
          top: y + margin.top,
          zIndex: isFocused ? 100 : 5,
        }}>
        <StyledIcon name="restaurant" size={15} />
        <StyledText>{foodItem.name}</StyledText>
      </Container>
      {isFocused && (
        <>
          <XTick
            x={x}
            lineStyle={{stroke: appTheme.accentColor, strokeWidth: 2}}
          />
          <Text
            x={x}
            y={y + containerHeight + 20}
            fontSize={12}
            textAnchor="middle"
            fill={appTheme.accentColor}>
            {formatDateToLocaleTimeString(foodItem.timestamp)}
          </Text>
        </>
      )}
      <Rect
        width={containerWidth}
        height={containerHeight}
        x={x - containerWidth / 2}
        y={y}
        rx={5}
        ry={5}
        fill="red"
        onPress={() => {
          setFocusedItem(preFocusedItem => {
            if (preFocusedItem?.timestamp === foodItem.timestamp) {
              return null;
            }
            return foodItem;
          });
        }}
      />
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
