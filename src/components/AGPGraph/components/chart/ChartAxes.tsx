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
  return (
    <G>
      {/* X-axis line */}
      <Line
        x1={0}
        y1={chartHeight}
        x2={chartWidth}
        y2={chartHeight}
        stroke={AGP_COLORS.border}
        strokeWidth={1.5}
      />
      
      {/* Y-axis line */}
      <Line
        x1={0}
        y1={0}
        x2={0}
        y2={chartHeight}
        stroke={AGP_COLORS.border}
        strokeWidth={1.5}
      />
        {/* Y-axis labels - positioned outside chart area */}
      <G>        
        {gridLines.major.map(glucose => (
          <SvgText
            key={`ylabel-${glucose}`}
            x={-12}  // Adjusted for reduced margin
            y={yScale(glucose)}
            textAnchor="end"
            alignmentBaseline="central"
            fontSize={12}
            fill={AGP_COLORS.text}
            fontWeight="600"
          >
            {glucose}
          </SvgText>
        ))}
      </G>
      
      {/* X-axis labels - positioned below chart area */}
      <G>        
        {timeLabels.map((label, index) => (
          <SvgText
            key={`xlabel-${index}`}
            x={xScale(timePoints[index])}            y={chartHeight + 35}  // Further below for better visibility
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
