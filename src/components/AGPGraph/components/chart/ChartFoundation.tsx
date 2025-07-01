// Consolidated Chart Foundation Component
// Combines ChartBackground, ChartBorder, ChartGradients, and ChartGrid

import React from 'react';
import { G, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { CHART_COLORS, PERCENTILE_COLORS, GlucoseGrid, TimeGrid } from 'app/components/shared/GlucoseChart';

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
      {/* Grid Lines using shared components */}
      {showGrid && (
        <G>
          <GlucoseGrid
            width={width}
            height={height}
            yScale={yScale}
            showLabels={true}
            showMinorGrid={true}
            labelOffset={-10}
          />
          <TimeGrid
            width={width}
            height={height}
            xScale={xScale}
            timePoints={timePoints}
            timeLabels={timeLabels}
            showLabels={true}
            labelOffset={15}
          />
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
    </>
  );
};

export default ChartFoundation;
