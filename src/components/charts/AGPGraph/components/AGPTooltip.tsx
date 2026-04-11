import React from 'react';
import {Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import Tooltip from 'app/components/charts/CgmGraph/components/Tooltips/Tooltip';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {AGPPercentilePoint} from '../types';
import {minutesToTimeLabel} from '../utils/percentiles';
import {formatGlucose} from '../utils/statistics';
import {getClampedTooltipPosition} from 'app/components/charts/tooltipPosition';
import {getSvgTooltipTextLayout} from 'app/components/charts/svgTooltipLayout';
import SvgTooltipBox from 'app/components/charts/SvgTooltipBox';

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

  const fontSize = theme.typography.size.xs;
  const paddingX = theme.spacing.md;
  const paddingY = theme.spacing.sm;
  const {textX, rowYs, height: tooltipHeight} = getSvgTooltipTextLayout({
    rows: 4,
    fontSize,
    lineHeightMultiplier: theme.typography.lineHeight.normal,
    paddingX,
    paddingY,
  });

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
      <SvgTooltipBox width={tooltipWidth} height={tooltipHeight} />

      <Text
        x={textX}
        y={rowYs[0]}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={titleColor}
      >
        {minutesToTimeLabel(point.timeOfDay)}
      </Text>

      <Text
        x={textX}
        y={rowYs[1]}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={medianColor}
      >
        Median: {formatGlucose(point.p50)}
      </Text>

      <Text
        x={textX}
        y={rowYs[2]}
        fontSize={String(theme.typography.size.xs)}
        fontFamily={theme.typography.fontFamily}
        fill={subtle}
      >
        25–75%: {formatGlucose(point.p25)} – {formatGlucose(point.p75)}
      </Text>

      <Text
        x={textX}
        y={rowYs[3]}
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
