// Target Range Area Component

import React from 'react';
import { Path, G, Line } from 'react-native-svg';
import { AGP_PERCENTILE_COLORS, AGP_GLUCOSE_RANGES } from '../../utils/constants';

interface TargetRangeProps {
  targetRangeArea: string | null;
  targetRange: { min: number; max: number };
  yScale: (value: number) => number;
  chartWidth: number;
}

export const TargetRange: React.FC<TargetRangeProps> = ({
  targetRangeArea,
  targetRange,
  yScale,
  chartWidth
}) => {
  return (
    <G>
      {targetRangeArea && (
        <Path
          d={targetRangeArea}
          fill={AGP_PERCENTILE_COLORS.target}
          opacity={0.3}
        />
      )}
      
      <Line
        x1={0}
        y1={yScale(targetRange.min)}
        x2={chartWidth}
        y2={yScale(targetRange.min)}
        stroke={AGP_GLUCOSE_RANGES.target.color}
        strokeWidth={2}
        strokeDasharray="5,5"
      />
      <Line
        x1={0}
        y1={yScale(targetRange.max)}
        x2={chartWidth}
        y2={yScale(targetRange.max)}
        stroke={AGP_GLUCOSE_RANGES.target.color}
        strokeWidth={2}
        strokeDasharray="5,5"
      />
    </G>
  );
};

export default TargetRange;
