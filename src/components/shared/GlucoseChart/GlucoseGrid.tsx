// Shared Glucose Chart Grid Component
// Consolidates grid logic from AGP ChartGrid and CGM YGridAndAxis

import React from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, GLUCOSE_GRID, withOpacity, CHART_OPACITY } from './GlucoseTheme';

interface GlucoseGridProps {
  width: number;
  height: number;
  xScale?: (value: number) => number;
  yScale: (value: number) => number;
  showLabels?: boolean;
  showMinorGrid?: boolean;
  labelOffset?: number;
}

export const GlucoseGrid: React.FC<GlucoseGridProps> = ({
  width,
  height,
  yScale,
  showLabels = true,
  showMinorGrid = true,
  labelOffset = -10
}) => {
  return (
    <G>
      {/* Major Grid Lines */}
      {GLUCOSE_GRID.major.map((glucoseValue) => {
        const y = yScale(glucoseValue);
        
        // Skip if outside chart bounds
        if (y < 0 || y > height) return null;
        
        return (
          <G key={`major-${glucoseValue}`}>
            {/* Grid Line */}            
            <Line
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke={CHART_COLORS.gridMajor}
              strokeWidth={1}
              opacity={CHART_OPACITY.strong}
            />
              {/* Label */}
            {showLabels && (
              <SvgText
                x={labelOffset}
                y={y + 4} // Slight offset for better alignment
                fontSize={11}
                fill={CHART_COLORS.textSecondary}
                textAnchor="end"
                opacity={CHART_OPACITY.strong}
              >
                {glucoseValue}
              </SvgText>
            )}
          </G>
        );
      })}
      
      {/* Minor Grid Lines */}
      {showMinorGrid && GLUCOSE_GRID.minor.map((glucoseValue) => {
        const y = yScale(glucoseValue);
        
        // Skip if outside chart bounds
        if (y < 0 || y > height) return null;
        
        return (          
        <Line
            key={`minor-${glucoseValue}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={CHART_COLORS.gridMinor}
            strokeWidth={0.5}
            opacity={CHART_OPACITY.medium}
          />
        );
      })}
    </G>
  );
};

interface TimeGridProps {
  width: number;
  height: number;
  xScale: (value: number) => number;
  timePoints: number[];
  timeLabels: string[];
  showLabels?: boolean;
  labelOffset?: number;
}

export const TimeGrid: React.FC<TimeGridProps> = ({
  width,
  height,
  xScale,
  timePoints,
  timeLabels,
  showLabels = true,
  labelOffset = 15
}) => {
  return (
    <G>
      {timePoints.map((timeMinutes, index) => {
        const x = xScale(timeMinutes);
        
        // Skip if outside chart bounds
        if (x < 0 || x > width) return null;
        
        return (
          <G key={`time-${timeMinutes}`}>
            {/* Grid Line */}            
            <Line
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke={CHART_COLORS.gridMinor}
              strokeWidth={0.5}
              opacity={CHART_OPACITY.medium}
            />
            
            {/* Label */}
            {showLabels && timeLabels[index] && (
              <SvgText
                x={x}
                y={height + labelOffset}
                fontSize={11}
                fill={CHART_COLORS.textSecondary}
                textAnchor="middle"
                opacity={CHART_OPACITY.strong}
              >
                {timeLabels[index]}
              </SvgText>
            )}
          </G>
        );
      })}
    </G>
  );
};
