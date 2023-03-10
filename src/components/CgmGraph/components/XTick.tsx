import styled from 'styled-components/native';
import {G, Line, Text} from 'react-native-svg';
import subMinutes from 'date-fns/subMinutes';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import React, {useContext} from 'react';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';

interface TickProps {
  x: number;
  withDate?: boolean;
  lineStyle?: any;
  textStyle?: any;
  roundTicks?: boolean;
}

const StyledLine = styled(Line)`
  stroke: black;
  opacity: 0.2;
  strokewidth: 1;
`;
const StyledText = styled(Text)`
  fill: black;
  opacity: 0.5;
`;
const XTick = ({x, withDate, lineStyle, textStyle, roundTicks}: TickProps) => {
  const [{xScale, graphHeight}] = useContext(GraphStyleContext);
  const dateTick = xScale.invert(x);
  const roundHourOffset = new Date(dateTick).getMinutes() % 60;
  const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
  const tickX = xScale(roundTicks ? roundHourDate : (dateTick as any));

  return (
    <G>
      <StyledLine
        x1={tickX}
        y1={0}
        x2={tickX}
        y2={graphHeight}
        {...lineStyle}
      />
      {withDate && (
        <StyledText
          x={tickX}
          y={graphHeight}
          fontSize={10}
          textAnchor="middle"
          {...textStyle}>
          {formatDateToLocaleTimeString(roundHourDate)}
        </StyledText>
      )}
    </G>
  );
};

export default XTick;
