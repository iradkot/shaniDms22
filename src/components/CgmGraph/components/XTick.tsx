import styled from 'styled-components/native';
import {G, Line, Text} from 'react-native-svg';
import subMinutes from 'date-fns/subMinutes';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import React, {useContext} from 'react';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';

interface TickProps {
  x: number;
  withDate?: boolean;
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
const XTick = ({x, withDate}: TickProps) => {
  const [{xScale, graphHeight}] = useContext(GraphStyleContext);
  const dateTick = xScale.invert(x);
  const roundHourOffset = new Date(dateTick).getMinutes() % 30;
  const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
  const roundTickX = xScale(roundHourDate);

  return (
    <G>
      <StyledLine x1={roundTickX} y1={0} x2={roundTickX} y2={graphHeight} />
      {withDate && (
        <StyledText
          x={roundTickX}
          y={graphHeight}
          fontSize={10}
          textAnchor="middle">
          {formatDateToLocaleTimeString(roundHourDate)}
        </StyledText>
      )}
    </G>
  );
};

export default XTick;
