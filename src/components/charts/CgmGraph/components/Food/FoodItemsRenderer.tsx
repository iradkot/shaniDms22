import React, {useContext, useMemo} from 'react';
import {Circle, G} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {ThemeType} from 'app/types/theme';
import {GraphStyleContext} from '../../contextStores/GraphStyleContext';

interface Props {
  foodItems: FoodItemDTO[] | formattedFoodItemDTO[] | null;

  /** IDs of items to visually highlight (e.g. items included in tooltip). */
  focusedFoodItemIds?: string[];
}

const FOOD_MARKER_BG_Y_VALUE = 20;
const FOOD_MARKER_RADIUS = 6;

const FoodItemsRenderer: React.FC<Props> = ({foodItems, focusedFoodItemIds}) => {
  const theme = useTheme() as ThemeType;
  const [{xScale, yScale}] = useContext(GraphStyleContext);

  const focusedSet = useMemo(
    () => new Set((focusedFoodItemIds ?? []).filter(Boolean)),
    [focusedFoodItemIds],
  );

  if (!foodItems?.length) {
    return null;
  }

  return (
    <G>
      {foodItems.map(item => {
        const ts = (item as any)?.timestamp;
        const id = (item as any)?.id;
        if (typeof ts !== 'number' || !Number.isFinite(ts)) {
          return null;
        }

        const x = xScale(new Date(ts));
        const y = yScale(FOOD_MARKER_BG_Y_VALUE);
        const isFocused = typeof id === 'string' && focusedSet.has(id);

        return (
          <Circle
            key={typeof id === 'string' ? id : String(ts)}
            cx={x}
            cy={y}
            r={isFocused ? FOOD_MARKER_RADIUS + 2 : FOOD_MARKER_RADIUS}
            fill={theme.colors.carbs}
            stroke={theme.white}
            strokeWidth={1}
            opacity={isFocused ? 0.95 : 0.8}
          />
        );
      })}
    </G>
  );
};

export default FoodItemsRenderer;
