// Tooltip.tsx
import React from 'react';
import {G, Rect, Text} from 'react-native-svg';

interface TooltipProps {
  x: number;
  y: number;
  children: React.ReactNode; // Accept ReactNode as children for flexible content
}

const Tooltip: React.FC<TooltipProps> = ({x, y, children}) => {
  const tooltipWidth = 100;
  const tooltipHeight = 50;

  return (
    <G x={x - tooltipWidth / 2} y={y - tooltipHeight - 10}>
      <Rect
        width={tooltipWidth}
        height={tooltipHeight}
        fill="white"
        stroke="black"
        strokeWidth={1}
      />
      {children}
    </G>
  );
};

export default Tooltip;
