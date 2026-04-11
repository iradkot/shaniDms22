import React from 'react';
import {Rect} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';

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
  const theme = useTheme() as ThemeType;

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
