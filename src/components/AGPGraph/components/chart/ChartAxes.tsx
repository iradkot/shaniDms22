// Chart Axes Component

import React from 'react';
import { G, Text as SvgText } from 'react-native-svg';
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
}

export const ChartAxes: React.FC<ChartAxesProps> = ({
  gridLines,
  timeLabels,
  timePoints,
  xScale,
  yScale,
  chartHeight
}) => {
  return (
    <G>
      <G>        
        {gridLines.major.map(glucose => (
          <SvgText
            key={`ylabel-${glucose}`}
            x={-5}
            y={yScale(glucose)}
            textAnchor="end"
            alignmentBaseline="central"
            fontSize={11}
            fill={AGP_COLORS.text}
            fontWeight="500"
          >
            {glucose}
          </SvgText>
        ))}
      </G>
      
      <G>        
        {timeLabels.map((label, index) => (
          <SvgText
            key={`xlabel-${index}`}
            x={xScale(timePoints[index])}
            y={chartHeight + 20}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontSize={10}
            fill={AGP_COLORS.text}
            fontWeight="400"
          >
            {label}
          </SvgText>
        ))}
      </G>
    </G>
  );
};

export default ChartAxes;
