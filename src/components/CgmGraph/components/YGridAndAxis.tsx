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
  return (
    <>
      {ticks.map((tick, index) => (
        <G>
          <Line
            key={index}
            x1={0}
            y1={(graphHeight / ticksAmount) * index}
            x2={graphWidth}
            y2={(graphHeight / ticksAmount) * index}
            stroke="black"
            opacity={0.2}
            strokeWidth={1}
          />
          <Text
            x={0}
            y={(graphHeight / ticksAmount) * index}
            fontSize={10}
            fill="black"
            opacity={0.5}
            textAnchor="middle">
            {Math.round(
              highestBgThreshold - (highestBgThreshold / ticksAmount) * index,
            )}
          </Text>
        </G>
      ))}
    </>
  );
};

export default YGridAndAxis;
