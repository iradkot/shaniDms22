import React, {useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import Svg, {Line, Path, Rect, Text as SvgText, G, Circle} from 'react-native-svg';

import {ThemeType} from 'app/types/theme';
import {PeriodStats} from 'app/types/loopAnalysis.types';
import {addOpacity} from 'app/style/styling.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PADDING_LEFT = 40;
const PADDING_RIGHT = 16;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;
const Y_MIN = 40;
const Y_MAX = 300;
const TARGET_LOW = 70;
const TARGET_HIGH = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Container = styled.View<{theme: ThemeType}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const LegendRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  justify-content: center;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const LegendItem = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const LegendDot = styled.View<{theme: ThemeType; $color: string}>`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${(p: {$color: string}) => p.$color};
  margin-right: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const LegendText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.7)};
`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GhostChartProps {
  beforeStats: PeriodStats;
  afterStats: PeriodStats;
  height?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateHourlyDistribution(stats: PeriodStats): Array<{hour: number; mean: number; p10: number; p90: number}> {
  // Generate synthetic data based on overall stats
  // This creates a reasonable approximation using the period's stats
  const hourlyData: Array<{hour: number; mean: number; p10: number; p90: number}> = [];
  const avgBg = stats.averageBg ?? 140;
  const stdDev = stats.stdDev ?? 30;
  const baseVariation = stdDev * 0.3;

  for (let hour = 0; hour < 24; hour++) {
    // Dawn phenomenon simulation (higher values around 4-8 AM)
    let hourlyOffset = 0;
    if (hour >= 4 && hour <= 8) {
      hourlyOffset = baseVariation * 0.5;
    } else if (hour >= 22 || hour <= 2) {
      hourlyOffset = -baseVariation * 0.3;
    }

    const mean = avgBg + hourlyOffset + (Math.sin(hour / 24 * Math.PI * 2) * baseVariation * 0.2);
    const spread = stdDev * 0.8;

    hourlyData.push({
      hour,
      mean: Math.max(Y_MIN, Math.min(Y_MAX, mean)),
      p10: Math.max(Y_MIN, Math.min(Y_MAX, mean - spread)),
      p90: Math.max(Y_MIN, Math.min(Y_MAX, mean + spread)),
    });
  }

  return hourlyData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const GhostChart: React.FC<GhostChartProps> = ({
  beforeStats,
  afterStats,
  height = 200,
}) => {
  const theme = useTheme() as ThemeType;
  const {width: screenWidth} = useWindowDimensions();
  const chartWidth = screenWidth - 48; // Account for container padding and margins

  const beforeColor = '#FF9500'; // Orange for "before"
  const afterColor = theme.accentColor; // Accent color for "after"
  const targetRangeColor = addOpacity('#34C759', 0.15);

  const plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

  // Generate hourly data
  const beforeHourly = useMemo(() => generateHourlyDistribution(beforeStats), [beforeStats]);
  const afterHourly = useMemo(() => generateHourlyDistribution(afterStats), [afterStats]);

  // Scale functions
  const xScale = (hour: number) => PADDING_LEFT + (hour / 23) * plotWidth;
  const yScale = (value: number) => {
    const normalized = (value - Y_MIN) / (Y_MAX - Y_MIN);
    return PADDING_TOP + plotHeight * (1 - normalized);
  };

  // Generate paths
  const generateMeanPath = (data: typeof beforeHourly): string => {
    return data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.hour)} ${yScale(d.mean)}`)
      .join(' ');
  };

  const generateBandPath = (data: typeof beforeHourly): string => {
    const upper = data.map((d) => `${xScale(d.hour)} ${yScale(d.p90)}`).join(' L ');
    const lower = data
      .slice()
      .reverse()
      .map((d) => `${xScale(d.hour)} ${yScale(d.p10)}`)
      .join(' L ');
    return `M ${upper} L ${lower} Z`;
  };

  const beforeMeanPath = useMemo(() => generateMeanPath(beforeHourly), [beforeHourly]);
  const afterMeanPath = useMemo(() => generateMeanPath(afterHourly), [afterHourly]);
  const beforeBandPath = useMemo(() => generateBandPath(beforeHourly), [beforeHourly]);
  const afterBandPath = useMemo(() => generateBandPath(afterHourly), [afterHourly]);

  // Y-axis labels
  const yLabels = [Y_MIN, 100, 150, 200, 250, Y_MAX];

  return (
    <Container>
      <Svg width={chartWidth} height={height}>
        {/* Target range background */}
        <Rect
          x={PADDING_LEFT}
          y={yScale(TARGET_HIGH)}
          width={plotWidth}
          height={yScale(TARGET_LOW) - yScale(TARGET_HIGH)}
          fill={targetRangeColor}
        />

        {/* Y-axis */}
        <Line
          x1={PADDING_LEFT}
          y1={PADDING_TOP}
          x2={PADDING_LEFT}
          y2={PADDING_TOP + plotHeight}
          stroke={addOpacity(theme.textColor, 0.2)}
          strokeWidth={1}
        />

        {/* Y-axis labels and grid lines */}
        {yLabels.map((label) => (
          <G key={label}>
            <Line
              x1={PADDING_LEFT}
              y1={yScale(label)}
              x2={PADDING_LEFT + plotWidth}
              y2={yScale(label)}
              stroke={addOpacity(theme.textColor, 0.1)}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <SvgText
              x={PADDING_LEFT - 8}
              y={yScale(label) + 4}
              fontSize={10}
              fill={addOpacity(theme.textColor, 0.5)}
              textAnchor="end"
            >
              {label}
            </SvgText>
          </G>
        ))}

        {/* X-axis labels */}
        {[0, 6, 12, 18, 23].map((hour) => (
          <SvgText
            key={hour}
            x={xScale(hour)}
            y={height - 8}
            fontSize={10}
            fill={addOpacity(theme.textColor, 0.5)}
            textAnchor="middle"
          >
            {hour === 0 ? '12a' : hour === 6 ? '6a' : hour === 12 ? '12p' : hour === 18 ? '6p' : '11p'}
          </SvgText>
        ))}

        {/* Before band (ghosted) */}
        <Path d={beforeBandPath} fill={addOpacity(beforeColor, 0.15)} />

        {/* After band */}
        <Path d={afterBandPath} fill={addOpacity(afterColor, 0.2)} />

        {/* Before mean line */}
        <Path
          d={beforeMeanPath}
          stroke={beforeColor}
          strokeWidth={2}
          strokeOpacity={0.6}
          fill="none"
          strokeDasharray="6,4"
        />

        {/* After mean line */}
        <Path
          d={afterMeanPath}
          stroke={afterColor}
          strokeWidth={2.5}
          fill="none"
        />

        {/* Target range lines */}
        <Line
          x1={PADDING_LEFT}
          y1={yScale(TARGET_LOW)}
          x2={PADDING_LEFT + plotWidth}
          y2={yScale(TARGET_LOW)}
          stroke="#34C759"
          strokeWidth={1}
          strokeOpacity={0.5}
        />
        <Line
          x1={PADDING_LEFT}
          y1={yScale(TARGET_HIGH)}
          x2={PADDING_LEFT + plotWidth}
          y2={yScale(TARGET_HIGH)}
          stroke="#34C759"
          strokeWidth={1}
          strokeOpacity={0.5}
        />
      </Svg>

      <LegendRow>
        <LegendItem>
          <LegendDot $color={beforeColor} />
          <LegendText>Before</LegendText>
        </LegendItem>
        <LegendItem>
          <LegendDot $color={afterColor} />
          <LegendText>After</LegendText>
        </LegendItem>
      </LegendRow>
    </Container>
  );
};
