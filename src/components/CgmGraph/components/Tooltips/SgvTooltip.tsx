import React from 'react';
import {Rect, Text} from 'react-native-svg';
import Tooltip from './Tooltip';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {determineBgColorByGlucoseValue} from 'app/style/styling.utils';
import {useTheme} from 'styled-components/native';

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

  // More subtle shadow settings
  const shadowColor = '#676767'; // Slightly darker shadow for subtlety
  const shadowOffset = 0.5; // Reduced offset for a minimalistic look

  return (
    <Tooltip x={tooltipX} y={y}>
      <Rect
        width={tooltipWidth}
        height={tooltipHeight}
        fill="#f0f0f0"
        stroke="#cccccc"
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
