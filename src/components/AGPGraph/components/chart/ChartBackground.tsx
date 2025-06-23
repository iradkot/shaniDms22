// Chart Background Component

import React from 'react';
import { Rect } from 'react-native-svg';
import { AGP_COLORS } from '../../utils/constants';

interface ChartBackgroundProps {
  width: number;
  height: number;
}

export const ChartBackground: React.FC<ChartBackgroundProps> = ({
  width,
  height
}) => {
  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={AGP_COLORS.background}
      stroke={AGP_COLORS.border}
      strokeWidth={1}
    />
  );
};

export default ChartBackground;
