import React from 'react';
import {Rect, Text} from 'react-native-svg';
import Tooltip from './Tooltip';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {determineBgColorByGlucoseValue} from 'app/style/styling.utils';
import {addOpacity} from 'app/style/styling.utils';
import {useTheme} from 'styled-components/native';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import {useContext} from 'react';

interface SgvTooltipProps {
  x: number;
  y: number;
  bgSample: BgSample;
}

const SgvTooltip: React.FC<SgvTooltipProps> = ({x, y, bgSample}) => {
  const theme = useTheme() as ThemeType;
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const tooltipWidth = 160;
  const tooltipHeight = 70;
  let tooltipX = x - tooltipWidth / 2;
  let tooltipY = y - tooltipHeight - theme.spacing.sm;

  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);

  // Clamp tooltip within the graph bounds (coordinates are already inside the chart <G>).
  tooltipX = Math.max(0, Math.min(tooltipX, Math.max(0, graphWidth - tooltipWidth)));
  if (tooltipY < 0) {
    tooltipY = y + theme.spacing.sm;
  }
  tooltipY = Math.max(0, Math.min(tooltipY, Math.max(0, graphHeight - tooltipHeight)));

  // More subtle shadow settings
  const shadowColor = addOpacity(theme.shadowColor, 0.35);
  const shadowOffset = 0.5; // Reduced offset for a minimalistic look

  return (
    <Tooltip x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
      <Rect
        width={tooltipWidth}
        height={tooltipHeight}
        fill={theme.white}
        stroke={theme.borderColor}
        strokeWidth={1}
        rx={8}
      />
      {/* Subtle shadow for the glucose value text */}
      <Text
        x={20 + shadowOffset}
        y={20 + shadowOffset}
        fontSize="12"
        fontFamily={theme.typography.fontFamily}
        fill={shadowColor} // Shadow with slight offset for minimalistic effect
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Glucose value text */}
      <Text
        x={20}
        y={20}
        fontSize="12"
        fontFamily={theme.typography.fontFamily}
        fill={bgColor}
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Time text without shadow */}
      <Text
        x={20}
        y={40}
        fontSize="12"
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        textAnchor="start">
        Time: {formatDateToLocaleTimeString(bgSample.date)}
      </Text>
    </Tooltip>
  );
};

export default SgvTooltip;
