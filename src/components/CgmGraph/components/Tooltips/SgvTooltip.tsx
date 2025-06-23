import React from 'react';
import {Rect, Text} from 'react-native-svg';
import Tooltip from './Tooltip';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {determineBgColorByGlucoseValue} from 'app/style/styling.utils';
import {useTheme} from 'styled-components/native';
import { CHART_COLORS, CHART_OPACITY } from 'app/components/shared/GlucoseChart';

interface SgvTooltipProps {
  x: number;
  y: number;
  bgSample: BgSample;
}

const SgvTooltip: React.FC<SgvTooltipProps> = ({x, y, bgSample}) => {
  const theme = useTheme() as ThemeType;

  const tooltipWidth = 160;
  const tooltipHeight = 70;
  let tooltipX = x - tooltipWidth / 2;

  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);

  tooltipX = Math.max(0, tooltipX);
  if (tooltipX + tooltipWidth > window.innerWidth) {
    tooltipX = window.innerWidth - tooltipWidth;
  }
  // Use theme colors for tooltip styling
  const shadowColor = CHART_COLORS.textSecondary;
  const shadowOffset = 0.5;

  return (
    <Tooltip x={tooltipX} y={y}>      <Rect
        width={tooltipWidth}
        height={tooltipHeight}
        fill={CHART_COLORS.background}
        stroke={CHART_COLORS.border}
        strokeWidth={1}
        rx={8}
      />
      {/* Subtle shadow for the glucose value text */}
      <Text
        x={20 + shadowOffset}
        y={20 + shadowOffset}
        fontSize="12"
        fontFamily="Arial, sans-serif"
        fill={shadowColor} // Shadow with slight offset for minimalistic effect
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Glucose value text */}
      <Text
        x={20}
        y={20}
        fontSize="12"
        fontFamily="Arial, sans-serif"
        fill={bgColor}
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Time text without shadow */}
      <Text
        x={20}
        y={40}
        fontSize="12"
        fontFamily="Arial, sans-serif"
        fill="black"
        textAnchor="start">
        Time: {formatDateToLocaleTimeString(bgSample.date)}
      </Text>
    </Tooltip>
  );
};

export default SgvTooltip;
