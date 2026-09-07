import React, {useContext, useMemo} from 'react';
import {Circle, G, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {GraphStyleContext} from '../../contextStores/GraphStyleContext';
import {buildCarbEvents, type ValidCarbEvent} from '../../utils/carbsUtils';
import {getChartPalette} from '../../../chartPalette';

interface Props {
  foodItems: FoodItemDTO[] | formattedFoodItemDTO[] | null;

  /** IDs of items to visually highlight (e.g. items included in tooltip). */
  focusedFoodItemIds?: string[];
}

const MARKER_RADIUS = 6;
const FOCUS_RADIUS = 8;
const MIN_X_GAP = FOCUS_RADIUS * 2 + 4;
type Marker = {
  events: ValidCarbEvent[];
  firstX: number;
  lastX: number;
  x: number;
};

const FoodItemsRenderer: React.FC<Props> = ({
  foodItems,
  focusedFoodItemIds,
}) => {
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const [{xScale, graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const focusedSet = useMemo(
    () => new Set((focusedFoodItemIds ?? []).filter(Boolean)),
    [focusedFoodItemIds],
  );

  const radius = Math.min(FOCUS_RADIUS, graphWidth / 2, graphHeight / 2);
  const positioned = useMemo(() => {
    const domain = xScale.domain();
    const events = buildCarbEvents(foodItems, [
      domain[0]!,
      domain[domain.length - 1]!,
    ]);
    const markers: Marker[] = [];
    for (const event of events) {
      const x = Math.max(
        radius,
        Math.min(graphWidth - radius, xScale(event.timestamp)),
      );
      const previous = markers[markers.length - 1];
      if (previous && x - previous.lastX < MIN_X_GAP) {
        previous.events.push(event);
        previous.lastX = x;
        previous.x = (previous.firstX + x) / 2;
      } else {
        markers.push({events: [event], firstX: x, lastX: x, x});
      }
    }
    return markers;
  }, [foodItems, xScale, graphWidth, radius]);

  if (!positioned.length || radius <= 0) {
    return null;
  }

  // Dense events get a visible count in a bounded row. Selection still uses
  // every original record, and marker height never implies a glucose value.
  const y = graphHeight - radius;
  return (
    <G>
      {positioned.map(marker => {
        const focused = marker.events.some(event => focusedSet.has(event.id));
        const count = marker.events.length;

        return (
          <G key={marker.events[0]!.id} testID="carb-marker-cluster">
            <Circle
              cx={marker.x}
              cy={y}
              r={Math.min(
                radius,
                focused || count > 1 ? FOCUS_RADIUS : MARKER_RADIUS,
              )}
              fill={theme.colors.carbs}
              stroke={palette.surface}
              strokeWidth={1}
              opacity={focused ? 1 : 0.85}
            />
            {count > 1 ? (
              <Text
                testID="carb-marker-count"
                x={marker.x}
                y={y + 3}
                fontSize={9}
                fontWeight="700"
                textAnchor="middle"
                fill={palette.surface}>
                {count}
              </Text>
            ) : null}
          </G>
        );
      })}
    </G>
  );
};

export default FoodItemsRenderer;
