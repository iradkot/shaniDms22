import React from 'react';
import {useWindowDimensions} from 'react-native';
import Svg, {G, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {getChartPalette} from './chartPalette';
import {formatMiniTime} from './miniChartData';
import {COMPACT_CHART_LAYOUT} from './chartLayout';

/** One left-to-right time reference for every lane, including RTL layouts. */
export const ChartTimeAxis = React.memo(function ChartTimeAxis({
  width,
  domain,
  left,
  right,
  testID,
}: {
  width: number;
  domain: [Date, Date];
  left: number;
  right: number;
  testID?: string | undefined;
}) {
  const theme = useTheme();
  const fontScale = Math.max(1, useWindowDimensions().fontScale);
  const fontSize = theme.typography.size.xs * fontScale;
  const height = Math.ceil(COMPACT_CHART_LAYOUT.timeAxisHeight * fontScale);
  const plotWidth = Math.max(1, width - left - right);
  const intervals = plotWidth >= 240 * fontScale ? 4 : 2;
  return (
    <Svg {...(testID ? {testID} : {})} width={width} height={height}>
      <G x={left}>
        {Array.from({length: intervals + 1}, (_, index) => {
          const fraction = index / intervals;
          return (
            <Text
              key={index}
              x={fraction * plotWidth}
              y={fontSize + 2}
              textAnchor={
                index === 0 ? 'start' : index === intervals ? 'end' : 'middle'
              }
              fill={getChartPalette(theme).mutedText}
              fontFamily={theme.fontFamily}
              fontSize={fontSize}>
              {formatMiniTime(
                +domain[0] + fraction * (+domain[1] - +domain[0]),
              )}
            </Text>
          );
        })}
      </G>
    </Svg>
  );
});
