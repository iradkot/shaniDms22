import React from 'react';
import {Rect, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import Tooltip from 'app/components/CgmGraph/components/Tooltips/Tooltip';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {AGPPercentilePoint} from '../types';
import {minutesToTimeLabel} from '../utils/percentiles';
import {formatGlucose} from '../utils/statistics';
import {getClampedTooltipPosition} from 'app/components/CgmGraph/components/Tooltips/tooltipPosition';

interface AGPTooltipProps {
  x: number; // point x within chart <G>
  y: number; // point y within chart <G>
  point: AGPPercentilePoint;
  chartWidth: number;
  chartHeight: number;
}

const AGPTooltip: React.FC<AGPTooltipProps> = ({x, y, point, chartWidth, chartHeight}) => {
  const theme = useTheme() as ThemeType;

  const tooltipWidth = 190;
  const tooltipHeight = 86;

  const {x: tooltipX, y: tooltipY} = getClampedTooltipPosition({
    pointX: x,
    pointY: y,
    tooltipWidth,
    tooltipHeight,
    containerWidth: chartWidth,
    containerHeight: chartHeight,
    offset: theme.spacing.sm,
  });

  const titleColor = theme.textColor;
  const subtle = addOpacity(theme.textColor, 0.75);
  const medianColor = theme.accentColor;

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

      <Text
        x={20}
        y={18}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={titleColor}
      >
        {minutesToTimeLabel(point.timeOfDay)}
      </Text>

      <Text
        x={20}
        y={38}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={medianColor}
      >
        Median: {formatGlucose(point.p50)}
      </Text>

      <Text
        x={20}
        y={56}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={subtle}
      >
        25–75%: {formatGlucose(point.p25)} – {formatGlucose(point.p75)}
      </Text>

      <Text
        x={20}
        y={74}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={subtle}
      >
        5–95%: {formatGlucose(point.p5)} – {formatGlucose(point.p95)}
      </Text>
    </Tooltip>
  );
};

export default AGPTooltip;
