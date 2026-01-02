import React from 'react';
import {Rect, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import Tooltip from 'app/components/CgmGraph/components/Tooltips/Tooltip';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {AGPPercentilePoint} from '../types';
import {minutesToTimeLabel} from '../utils/percentiles';
import {formatGlucose} from '../utils/statistics';

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

  let tooltipX = x - tooltipWidth / 2;
  let tooltipY = y - tooltipHeight - theme.spacing.sm;

  tooltipX = Math.max(0, Math.min(tooltipX, Math.max(0, chartWidth - tooltipWidth)));
  if (tooltipY < 0) tooltipY = y + theme.spacing.sm;
  tooltipY = Math.max(0, Math.min(tooltipY, Math.max(0, chartHeight - tooltipHeight)));

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
        x={12}
        y={18}
        fontSize={theme.typography.size.xs}
        fontFamily={theme.typography.fontFamily}
        fill={titleColor}
      >
        {minutesToTimeLabel(point.timeOfDay)}
      </Text>

      <Text
        x={12}
        y={38}
        fontSize={theme.typography.size.xs}
        fontFamily={theme.typography.fontFamily}
        fill={medianColor}
      >
        Median: {formatGlucose(point.p50)}
      </Text>

      <Text
        x={12}
        y={56}
        fontSize={theme.typography.size.xs}
        fontFamily={theme.typography.fontFamily}
        fill={subtle}
      >
        25–75%: {formatGlucose(point.p25)} – {formatGlucose(point.p75)}
      </Text>

      <Text
        x={12}
        y={74}
        fontSize={theme.typography.size.xs}
        fontFamily={theme.typography.fontFamily}
        fill={subtle}
      >
        5–95%: {formatGlucose(point.p5)} – {formatGlucose(point.p95)}
      </Text>
    </Tooltip>
  );
};

export default AGPTooltip;
