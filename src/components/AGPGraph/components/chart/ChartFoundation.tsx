// Consolidated Chart Foundation Component
// Combines ChartBackground, ChartBorder, ChartGradients, and ChartGrid

import React from 'react';
import { G, Rect, Line, Defs, LinearGradient, Stop, Text } from 'react-native-svg';
import { CHART_COLORS, PERCENTILE_COLORS } from 'app/components/shared/GlucoseChart';

interface ChartFoundationProps {
  width: number;
  height: number;
  gridLines: {
    major: number[];
    minor: number[];
  };
  timePoints: number[];
  timeLabels: string[];
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  showGrid?: boolean;
}

export const ChartFoundation: React.FC<ChartFoundationProps> = ({
  width,
  height,
  gridLines,
  timePoints,
  timeLabels,
  xScale,
  yScale,
  showGrid = true
}) => {
  return (
    <>
      {/* SVG Gradients for percentile bands */}
      <Defs>
        <LinearGradient id="p5p95Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={PERCENTILE_COLORS.p5_p95} />
          <Stop offset="100%" stopColor={PERCENTILE_COLORS.p5_p95} />
        </LinearGradient>
        <LinearGradient id="p25p75Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={PERCENTILE_COLORS.p25_p75} />
          <Stop offset="100%" stopColor={PERCENTILE_COLORS.p25_p75} />
        </LinearGradient>
      </Defs>

      {/* Chart Background */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={CHART_COLORS.background}
        stroke={CHART_COLORS.border}
        strokeWidth={1}
      />

      {/* Grid Lines */}
      {showGrid && (
        <G>
          {/* Horizontal grid lines - Major glucose levels */}
          {gridLines.major.map(glucose => (
            <Line
              key={`major-${glucose}`}
              x1={0}
              y1={yScale(glucose)}
              x2={width}
              y2={yScale(glucose)}
              stroke={CHART_COLORS.gridMajor}
              strokeWidth={1}
              opacity={0.8}
            />
          ))}
          
          {/* Horizontal grid lines - Minor glucose levels */}
          {gridLines.minor.map(glucose => (
            <Line
              key={`minor-${glucose}`}
              x1={0}
              y1={yScale(glucose)}
              x2={width}
              y2={yScale(glucose)}
              stroke={CHART_COLORS.gridMinor}
              strokeWidth={0.5}
              opacity={0.4}
            />
          ))}
          
          {/* Vertical grid lines - Time points */}
          {timePoints.map(timeMinutes => (
            <Line
              key={`time-${timeMinutes}`}
              x1={xScale(timeMinutes)}
              y1={0}
              x2={xScale(timeMinutes)}
              y2={height}
              stroke={CHART_COLORS.gridMinor}
              strokeWidth={0.5}
              opacity={0.3}
            />
          ))}
        </G>
      )}      
      {/* Chart Border (on top of everything) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="none"
        stroke={CHART_COLORS.border}
        strokeWidth={1}
      />

      {/* Axis Labels */}
      <G>
        {/* Y-axis labels (glucose values) */}
        {gridLines.major.map(glucose => (
          <Text
            key={`y-label-${glucose}`}
            x={-10}
            y={yScale(glucose) + 4}
            fontSize="10"
            fontFamily="Arial, sans-serif"
            fill={CHART_COLORS.textSecondary}
            textAnchor="end">
            {glucose}
          </Text>
        ))}
        
        {/* X-axis labels (time) */}
        {timePoints.map((timeMinutes, index) => (
          <Text
            key={`x-label-${timeMinutes}`}
            x={xScale(timeMinutes)}
            y={height + 15}
            fontSize="10"
            fontFamily="Arial, sans-serif"
            fill={CHART_COLORS.textSecondary}
            textAnchor="middle">
            {timeLabels[index]}
          </Text>
        ))}
      </G>
    </>
  );
};

export default ChartFoundation;
