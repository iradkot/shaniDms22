import {useTheme} from 'styled-components/native';
import {G, Line, Text} from 'react-native-svg';
import subMinutes from 'date-fns/subMinutes';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import React, {useContext} from 'react';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';
import type {ThemeType} from 'app/types/theme';

interface TickProps {
  x: number;
  withDate?: boolean;
  lineStyle?: any;
  textStyle?: any;
  roundTicks?: boolean;
  labelFormatter?: (date: Date) => string;
}

const XTick = ({
  x,
  withDate,
  lineStyle,
  textStyle,
  roundTicks,
  labelFormatter,
}: TickProps) => {
  const [{xScale, graphHeight}] = useContext(GraphStyleContext);
  const theme = useTheme() as ThemeType;
  const dateTick = xScale.invert(x);
  const roundHourOffset = new Date(dateTick).getMinutes() % 60;
  const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
  const tickDate = roundTicks ? roundHourDate : dateTick;
  const tickX = xScale(tickDate);
  const range = xScale.range();
  const textAnchor =
    tickX <= (range[0] ?? 0) + 22
      ? 'start'
      : tickX >= (range[range.length - 1] ?? 0) - 22
      ? 'end'
      : 'middle';
  const label = labelFormatter
    ? labelFormatter(tickDate)
    : formatDateToLocaleTimeString(tickDate);

  return (
    <G>
      <Line
        x1={tickX}
        y1={0}
        x2={tickX}
        y2={graphHeight}
        stroke={theme.borderColor}
        opacity={0.45}
        strokeWidth={1}
        {...lineStyle}
      />
      {withDate && (
        <Text
          x={tickX}
          y={graphHeight + 19}
          fontSize={12}
          fontWeight="600"
          fill={theme.textColor}
          fontFamily={theme.fontFamily}
          opacity={1}
          textAnchor={textAnchor}
          {...textStyle}>
          {label}
        </Text>
      )}
    </G>
  );
};

export default XTick;
