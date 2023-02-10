import {G, Line, Text} from 'react-native-svg';
import React from 'react';

interface Props {
  graphWidth: number;
  graphHeight: number;
  highestBgThreshold: number;
}
const YGridAndAxis = ({
  graphWidth,
  graphHeight,
  highestBgThreshold, // max y value
}: Props) => {
  const ticksAmount = 6;
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);
  const GridLine = ({y}: {y: number}) => (
    <Line
      x1={0}
      y1={y}
      x2={graphWidth}
      y2={y}
      stroke="black"
      opacity={0.2}
      strokeWidth={1}
    />
  );
  const GridLabel = ({y, index}: {y: number; index: number}) => (
    <Text
      x={0}
      y={y}
      fontSize={10}
      fill="black"
      opacity={0.5}
      textAnchor="middle">
      {Math.round(
        highestBgThreshold - (highestBgThreshold / ticksAmount) * index,
      )}
    </Text>
  );

  return (
    <>
      {ticks.map((tick, index) => {
        // skip the first tick
        if (index === 0) {
          return null;
        }
        return (
          <G key={index}>
            <GridLine y={(graphHeight / ticksAmount) * tick} />
            <GridLabel y={(graphHeight / ticksAmount) * tick} index={index} />
          </G>
        );
      })}
    </>
  );
};

export default YGridAndAxis;
