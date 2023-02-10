import {G, Line, Text} from 'react-native-svg';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import React from 'react';
import subMinutes from 'date-fns/subMinutes';
import useIsLandscape from 'app/hooks/useIsLandscape';

interface Props {
  graphHeight: number;
  xScale: any;
}

const XGridAndAxis = ({graphHeight, xScale}: Props) => {
  const isLandscape = useIsLandscape();

  const ticksAmount = isLandscape
    ? (xScale.range()[1] - xScale.range()[0]) / 100
    : 5;
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);
  const startDateTime = xScale.domain()[0];
  const endDateTime = xScale.domain()[1];
  console.log('startDateTime', startDateTime);
  console.log('endDateTime', endDateTime);
  // const formattedStartDate = formatDateToLocaleDateString(startDateTime);
  // const formattedEndDate = formatDateToLocaleDateString(endDateTime);
  return (
    <>
      {ticks.map((tick, index) => {
        const tickX =
          xScale.range()[0] +
          ((xScale.range()[1] - xScale.range()[0]) / (ticksAmount - 1)) * tick;
        const dateTick = xScale.invert(tickX);
        const roundHourOffset = new Date(dateTick).getMinutes() % 30;
        const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
        const roundTickX = xScale(roundHourDate);
        return (
          <G key={index}>
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
