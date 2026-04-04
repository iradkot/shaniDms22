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
const MIN_X_GAP_PX = 14;
const LANE_SPACING_PX = 12;

const FoodItemsRenderer: React.FC<Props> = ({foodItems, focusedFoodItemIds}) => {
  const theme = useTheme() as ThemeType;
  const [{xScale, yScale}] = useContext(GraphStyleContext);

  const focusedSet = useMemo(
    () => new Set((focusedFoodItemIds ?? []).filter(Boolean)),
    [focusedFoodItemIds],
  );

  const positioned = useMemo(() => {
    if (!foodItems?.length) {
      return [];
    }

    const normalized = foodItems
      .map(item => {
        const ts = (item as any)?.timestamp;
        const id = (item as any)?.id;
        if (typeof ts !== 'number' || !Number.isFinite(ts)) {
          return null;
        }
        return {
          id: typeof id === 'string' ? id : String(ts),
          ts,
          x: xScale(new Date(ts)),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.ts - b.ts) as Array<{id: string; ts: number; x: number}>;

    const laneLastX: number[] = [];

    return normalized.map(item => {
      let lane = laneLastX.findIndex(lastX => item.x - lastX >= MIN_X_GAP_PX);
      if (lane === -1) {
        lane = laneLastX.length;
        laneLastX.push(item.x);
      } else {
        laneLastX[lane] = item.x;
      }

      return {
        ...item,
        lane,
      };
    });
  }, [foodItems, xScale]);

  if (!positioned.length) {
    return null;
  }

  return (
    <G>
      {positioned.map(item => {
        const yBase = yScale(FOOD_MARKER_BG_Y_VALUE);
        const y = yBase - item.lane * LANE_SPACING_PX;
        const isFocused = focusedSet.has(item.id);

        return (
          <Circle
            key={item.id}
            cx={item.x}
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
