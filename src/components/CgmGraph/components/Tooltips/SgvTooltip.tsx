import React from 'react';
import {G, Rect, Text} from 'react-native-svg';
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
  chartWidth?: number; // Add chart width for proper bounds checking
}

const SgvTooltip: React.FC<SgvTooltipProps> = ({x, y, bgSample, chartWidth = 350}) => {
  const theme = useTheme() as ThemeType;

  const tooltipWidth = 160;
  const tooltipHeight = 70;
  let tooltipX = x - tooltipWidth / 2;

  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);
  tooltipX = Math.max(0, tooltipX);
  if (tooltipX + tooltipWidth > chartWidth) {
    tooltipX = chartWidth - tooltipWidth;
  }
  // Use theme colors for tooltip styling
  const shadowColor = CHART_COLORS.textSecondary;
  const shadowOffset = 0.5;
  return (
    <G x={tooltipX - tooltipWidth / 2} y={y - tooltipHeight - 10}>      
    <Rect
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
    </G>
  );
};

export default SgvTooltip;
