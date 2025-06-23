// Chart Grid Lines Component

import React from 'react';
import { G, Line } from 'react-native-svg';
import { AGP_COLORS } from '../../utils/constants';

interface ChartGridProps {
  gridLines: {
    major: number[];
    minor: number[];
  };
  timePoints: number[];
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  chartWidth: number;
  chartHeight: number;
}

export const ChartGrid: React.FC<ChartGridProps> = ({
  gridLines,
  timePoints,
  xScale,
  yScale,
  chartWidth,
  chartHeight
}) => {
  return (
    <G>      
        {/* Horizontal grid lines - Major glucose levels */}
      {gridLines.major.map(glucose => (
        <Line
          key={`major-${glucose}`}
          x1={0}
          y1={yScale(glucose)}
          x2={chartWidth}
          y2={yScale(glucose)}
          stroke={AGP_COLORS.gridMajor}
          strokeWidth={1}
          opacity={0.8}
        />
      ))}
      
      {/* Horizontal grid lines - Minor glucose levels */}
      {gridLines.minor.map(glucose => (
        <Line
          key={`minor-${glucose}`}
          x1={0}
          y1={yScale(glucose)}
          x2={chartWidth}
          y2={yScale(glucose)}
          stroke={AGP_COLORS.gridMinor}
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
      
      {/* Vertical grid lines - Time points */}
      {timePoints.map(minutes => (
        <Line
          key={`time-${minutes}`}
          x1={xScale(minutes)}
          y1={0}
          x2={xScale(minutes)}
          y2={chartHeight}
          stroke={AGP_COLORS.gridMinor}
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
    </G>
  );
};

export default ChartGrid;
