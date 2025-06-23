// Chart Axes Component

import React from 'react';
import { G, Text as SvgText, Line } from 'react-native-svg';
import { AGP_COLORS } from '../../utils/constants';

interface ChartAxesProps {
  gridLines: {
    major: number[];
    minor: number[];
  };
  timeLabels: string[];
  timePoints: number[];
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  chartHeight: number;
  chartWidth?: number;
}

export const ChartAxes: React.FC<ChartAxesProps> = ({
  gridLines,
  timeLabels,
  timePoints,
  xScale,
  yScale,
  chartHeight,
  chartWidth = 300
}) => {
  console.log('[ChartAxes] Enhanced Debug Info:', {
    majorGridLines: gridLines.major,
    chartHeight,
    chartWidth,
    sampleYScaleValues: gridLines.major.slice(0, 3).map(val => ({
      glucose: val,
      yPos: yScale(val),
      isValidPosition: yScale(val) >= 0 && yScale(val) <= chartHeight
    }))
  });
  return (
    <G>
      <Line
        x1={0}
        y1={chartHeight}
        x2={chartWidth}
        y2={chartHeight}
        stroke={AGP_COLORS.border}
        strokeWidth={1.5}
      />      
      <Line
        x1={0}
        y1={0}
        x2={0}
        y2={chartHeight}
        stroke={AGP_COLORS.border}
        strokeWidth={1.5}
      />
      
      <G>        
        {timeLabels.map((label, index) => (
          <SvgText
            key={`xlabel-${index}`}
            x={xScale(timePoints[index])}
            y={chartHeight + 35}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontSize={12}
            fill={AGP_COLORS.text}
            fontWeight="500"
          >
            {label}
          </SvgText>
        ))}
      </G>
    </G>
  );
};

export default ChartAxes;
