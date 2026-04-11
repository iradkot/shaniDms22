import {useAppTheme} from 'app/hooks/useAppTheme';
// Tooltip.tsx
import React from 'react';
import {G, Rect} from 'react-native-svg';
import {ThemeType} from 'app/types/theme';

interface TooltipProps {
  x: number; // top-left x
  y: number; // top-left y
  width: number;
  height: number;
  children: React.ReactNode; // Accept ReactNode as children for flexible content
}

const Tooltip: React.FC<TooltipProps> = ({x, y, width, height, children}) => {
  const theme = useAppTheme();

  return (
    <G x={x} y={y}>
      <Rect
        width={width}
        height={height}
        fill={theme.white}
        stroke={theme.borderColor}
        strokeWidth={1}
      />
      {children}
    </G>
  );
};

export default Tooltip;
