import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {G, Rect, Line, Path, Text as SvgText} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import {AGPData, AGPPercentilePoint} from '../types';
import {minutesToTimeLabel} from '../utils/percentiles';

type LinearScale = ((value: number) => number) & {
  domain: () => [number, number];
  range: () => [number, number];
};

const createLinearScale = (
  domain: [number, number],
  range: [number, number],
): LinearScale => {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;

  const scale = ((value: number) => {
    const ratio = (value - domainMin) / (domainMax - domainMin);
    return rangeMin + ratio * (rangeMax - rangeMin);
  }) as LinearScale;

  scale.domain = () => domain;
  scale.range = () => range;

  return scale;
};

const generateLinePath = (
  points: Array<{timeOfDay: number; value: number}>,
  xScale: (value: number) => number,
  yScale: (value: number) => number,
): string => {
  if (points.length === 0) return '';

  let path = `M ${xScale(points[0].timeOfDay)} ${yScale(points[0].value)}`;

  for (let i = 1; i < points.length; i++) {
    path += ` L ${xScale(points[i].timeOfDay)} ${yScale(points[i].value)}`;
  }

  return path;
};

const generateAreaPath = (
  points: Array<{timeOfDay: number; lower: number; upper: number}>,
  xScale: (value: number) => number,
  yScale: (value: number) => number,
): string => {
  if (points.length === 0) return '';

  let path = `M ${xScale(points[0].timeOfDay)} ${yScale(points[0].upper)}`;

  for (let i = 1; i < points.length; i++) {
    path += ` L ${xScale(points[i].timeOfDay)} ${yScale(points[i].upper)}`;
  }

  for (let i = points.length - 1; i >= 0; i--) {
    path += ` L ${xScale(points[i].timeOfDay)} ${yScale(points[i].lower)}`;
  }

  path += ' Z';
  return path;
};

const buildYTicks = (yDomain: [number, number]) => {
  const [min, max] = [Math.min(...yDomain), Math.max(...yDomain)];
  const step = 50;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(v);
  return ticks;
};

interface AGPChartProps {
  agpData: AGPData;
  width: number;
  height: number;
  targetRange?: {min: number; max: number};
}

const AGPChart: React.FC<AGPChartProps> = ({
  agpData,
  width,
  height,
  targetRange = cgmRange.TARGET,
}) => {
  const theme = useTheme();

  const margin = useMemo(
    () => ({
      top: theme.spacing.md,
      right: theme.spacing.lg,
      bottom: theme.spacing.xl + theme.spacing.sm,
      left: theme.spacing.xl + theme.spacing.lg,
    }),
    [theme.spacing],
  );

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const chartConfig = useMemo(() => {
    if (!agpData || agpData.percentiles.length === 0) return null;

    const xScale = createLinearScale([0, 1440], [0, innerWidth]);

    const allValues: number[] = [];
    agpData.percentiles.forEach(p => {
      allValues.push(p.p5, p.p25, p.p50, p.p75, p.p95);
    });

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);

    // AGP typically reads best with a familiar glucose range; keep a baseline
    // around 40–250 and expand if data exceeds it.
    const paddedMin = Math.floor(dataMin / 10) * 10 - 20;
    const paddedMax = Math.ceil(dataMax / 10) * 10 + 20;
    const baselineMin = 40;
    const baselineMax = 250;

    const yMin = Math.max(20, Math.min(baselineMin, paddedMin));
    const yMax = Math.min(400, Math.max(baselineMax, paddedMax));

    const yScale = createLinearScale([yMax, yMin], [0, innerHeight]);

    return {xScale, yScale, yMin, yMax};
  }, [agpData, innerWidth, innerHeight]);

  if (!chartConfig) {
    return (
      <View style={{width, height, justifyContent: 'center', alignItems: 'center'}} />
    );
  }

  const {xScale, yScale, yMin, yMax} = chartConfig;

  const timePoints = [0, 240, 480, 720, 960, 1200, 1440];
  const yTicks = buildYTicks([yMin, yMax]);

  const p5p95Area = generateAreaPath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, lower: p.p5, upper: p.p95})),
    xScale,
    yScale,
  );
  const p25p75Area = generateAreaPath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, lower: p.p25, upper: p.p75})),
    xScale,
    yScale,
  );

  const p50Line = generateLinePath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, value: p.p50})),
    xScale,
    yScale,
  );

  const p25Line = generateLinePath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, value: p.p25})),
    xScale,
    yScale,
  );

  const p75Line = generateLinePath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, value: p.p75})),
    xScale,
    yScale,
  );

  const p5Line = generateLinePath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, value: p.p5})),
    xScale,
    yScale,
  );

  const p95Line = generateLinePath(
    agpData.percentiles.map(p => ({timeOfDay: p.timeOfDay, value: p.p95})),
    xScale,
    yScale,
  );

  const targetArea = generateAreaPath(
    [
      {timeOfDay: 0, lower: targetRange.min, upper: targetRange.max},
      {timeOfDay: 1440, lower: targetRange.min, upper: targetRange.max},
    ],
    xScale,
    yScale,
  );

  const gridColor = addOpacity(theme.borderColor, 0.55);
  const labelColor = addOpacity(theme.textColor, 0.75);

  // Use textColor-derived neutrals so it's readable in light/dark themes.
  const bandOuterFill = addOpacity(theme.textColor, 0.08);
  const bandInnerFill = addOpacity(theme.textColor, 0.14);
  const targetFill = addOpacity(theme.inRangeColor, 0.16);

  const outerLine = addOpacity(theme.textColor, 0.35);
  const innerLine = addOpacity(theme.textColor, 0.55);
  const medianLine = theme.accentColor;

  return (
    <Svg width={width} height={height}>
      <G transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Background + border */}
        <Rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill={theme.white}
          stroke={theme.borderColor}
          strokeWidth={1}
        />

        {/* Grid: Y */}
        {yTicks.map(v => (
          <G key={`y-${v}`}>
            <Line
              x1={0}
              y1={yScale(v)}
              x2={innerWidth}
              y2={yScale(v)}
              stroke={gridColor}
              strokeWidth={1}
            />
            <SvgText
              x={-theme.spacing.sm}
              y={yScale(v) + 4}
              fontSize={theme.typography.size.xs}
              fontFamily={theme.typography.fontFamily}
              fill={labelColor}
              textAnchor="end"
            >
              {v}
            </SvgText>
          </G>
        ))}

        {/* Grid: X */}
        {timePoints.map(minutes => (
          <G key={`x-${minutes}`}>
            <Line
              x1={xScale(minutes)}
              y1={0}
              x2={xScale(minutes)}
              y2={innerHeight}
              stroke={gridColor}
              strokeWidth={1}
            />
            <SvgText
              x={xScale(minutes)}
              y={innerHeight + theme.spacing.lg}
              fontSize={theme.typography.size.xs}
              fontFamily={theme.typography.fontFamily}
              fill={labelColor}
              textAnchor="middle"
            >
              {minutes === 1440 ? '12 AM' : minutesToTimeLabel(minutes)}
            </SvgText>
          </G>
        ))}

        {/* Target range */}
        {!!targetArea && (
          <Path d={targetArea} fill={targetFill} />
        )}

        {/* Percentile bands */}
        {!!p5p95Area && <Path d={p5p95Area} fill={bandOuterFill} />}
        {!!p25p75Area && <Path d={p25p75Area} fill={bandInnerFill} />}

        {/* Percentile lines */}
        {!!p5Line && (
          <Path
            d={p5Line}
            stroke={outerLine}
            strokeWidth={1}
            fill="none"
            strokeDasharray="4,4"
          />
        )}
        {!!p95Line && (
          <Path
            d={p95Line}
            stroke={outerLine}
            strokeWidth={1}
            fill="none"
            strokeDasharray="4,4"
          />
        )}
        {!!p25Line && (
          <Path d={p25Line} stroke={innerLine} strokeWidth={1.25} fill="none" />
        )}
        {!!p75Line && (
          <Path d={p75Line} stroke={innerLine} strokeWidth={1.25} fill="none" />
        )}
        {!!p50Line && (
          <Path d={p50Line} stroke={medianLine} strokeWidth={2} fill="none" />
        )}

        {/* Target range borders */}
        <Line
          x1={0}
          y1={yScale(targetRange.min)}
          x2={innerWidth}
          y2={yScale(targetRange.min)}
          stroke={addOpacity(theme.inRangeColor, 0.7)}
          strokeWidth={1.5}
          strokeDasharray="6,6"
        />
        <Line
          x1={0}
          y1={yScale(targetRange.max)}
          x2={innerWidth}
          y2={yScale(targetRange.max)}
          stroke={addOpacity(theme.inRangeColor, 0.7)}
          strokeWidth={1.5}
          strokeDasharray="6,6"
        />
      </G>
    </Svg>
  );
};

export default AGPChart;
