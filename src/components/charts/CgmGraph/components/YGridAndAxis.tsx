import {G, Line, Text} from 'react-native-svg';
import React, {useContext} from 'react';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';

interface Props {
  highestBgThreshold: number;
  ticksAmount?: number;
  showLabels?: boolean;
}
const YGridAndAxis = ({
  highestBgThreshold, // max y value
  ticksAmount = 6,
  showLabels = true,
}: Props) => {
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);
  const theme = useTheme() as ThemeType;
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);

  return (
    <>
      {ticks.map((tick, index) => {
        // skip the first tick
        if (index === 0) {
          return null;
        }
        const y = (graphHeight / ticksAmount) * tick;
        return (
          <G key={index}>
            <Line
              x1={0}
              y1={y}
              x2={graphWidth}
              y2={y}
              stroke={theme.borderColor}
              opacity={0.45}
              strokeWidth={1}
            />
            {showLabels ? (
              <Text
                x={-8}
                y={y + 4}
                fontSize={12}
                fill={theme.textColor}
                opacity={1}
                textAnchor="end">
                {Math.round(
                  highestBgThreshold -
                    (highestBgThreshold / ticksAmount) * index,
                )}
              </Text>
            ) : null}
          </G>
        );
      })}
    </>
  );
};

export default React.memo(YGridAndAxis);
