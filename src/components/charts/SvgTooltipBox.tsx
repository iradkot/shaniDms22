import React from 'react';
import {Rect} from 'react-native-svg';
import {ThemeType} from 'app/types/theme';

import {useAppTheme} from 'app/hooks/useAppTheme';
type Props = {
  width: number;
  height: number;
  rx?: number;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
};

const SvgTooltipBox: React.FC<Props> = ({
  width,
  height,
  rx = 8,
  strokeWidth = 1,
  fill,
  stroke,
}) => {
  const theme = useAppTheme();

  return (
    <Rect
      width={width}
      height={height}
      fill={fill ?? theme.white}
      stroke={stroke ?? theme.borderColor}
      strokeWidth={strokeWidth}
      rx={rx}
    />
  );
};

export default SvgTooltipBox;
