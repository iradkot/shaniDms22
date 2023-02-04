import {G, Line, Text} from 'react-native-svg';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import React from 'react';
import subMinutes from 'date-fns/subMinutes';

interface Props {
  graphWidth: number;
  graphHeight: number;
  dataStartDateTime: number;
  dataEndDateTime: number;
  xScale: any;
}

const XGridAndAxis = ({
  graphWidth,
  graphHeight,
  dataStartDateTime,
  dataEndDateTime,
  xScale,
}: Props) => {
  const ticksAmount = 4;
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);
  console.log('firstScale', xScale(dataStartDateTime));
  console.log('lastScale', xScale(dataEndDateTime));
  console.log('0', xScale(0));
  return (
    <>
      {ticks.map((tick, index) => {
        const tickX = (graphWidth / ticksAmount) * index;
        const dateTick = xScale.invert(tickX);
        const roundHourOffset = new Date(dateTick).getMinutes() % 30;
        const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
        const roundTickX = xScale(roundHourDate);
        return (
          <G>
            <Line
              key={index}
              x1={roundTickX}
              y1={0}
              x2={roundTickX}
              y2={graphHeight}
              stroke="black"
              opacity={0.2}
              strokeWidth={1}
            />
            <Text
              x={roundTickX}
              y={graphHeight}
              fontSize={10}
              fill="black"
              opacity={0.5}
              textAnchor="middle">
              {formatDateToLocaleTimeString(roundHourDate)}
            </Text>
          </G>
        );
      })}
    </>
  );
};

export default XGridAndAxis;
