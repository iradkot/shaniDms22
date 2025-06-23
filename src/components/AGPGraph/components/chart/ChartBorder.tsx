// Chart Border Component

import React from 'react';
import { Rect } from 'react-native-svg';
import { AGP_COLORS } from '../../utils/constants';

interface ChartBorderProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ChartBorder: React.FC<ChartBorderProps> = ({
  x,
  y,
  width,
  height
}) => {
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="none"
      stroke={AGP_COLORS.border}
      strokeWidth={1}
    />
  );
};

export default ChartBorder;
