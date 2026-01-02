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
import {getClampedTooltipPosition} from './tooltipPosition';

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
  const {x: tooltipX, y: tooltipY} = getClampedTooltipPosition({
    pointX: x,
    pointY: y,
    tooltipWidth,
    tooltipHeight,
    containerWidth: graphWidth,
    containerHeight: graphHeight,
    offset: theme.spacing.sm,
  });

  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);

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
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={shadowColor} // Shadow with slight offset for minimalistic effect
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Glucose value text */}
      <Text
        x={20}
        y={20}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={bgColor}
        textAnchor="start">
        BG: {`${bgSample.sgv} mg/dL`}
      </Text>
      {/* Time text without shadow */}
      <Text
        x={20}
        y={40}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        textAnchor="start">
        Time: {formatDateToLocaleTimeString(bgSample.date)}
      </Text>
    </Tooltip>
  );
};

export default SgvTooltip;
