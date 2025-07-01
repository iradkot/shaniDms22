// Consolidated Chart Data Component
// Combines TargetRange, PercentileBands, and PercentileLines

import React from 'react';
import { G, Path, Line } from 'react-native-svg';
import { CHART_COLORS, PERCENTILE_COLORS, GLUCOSE_RANGES } from 'app/components/shared/GlucoseChart';
import { AGPData } from '../../types/agp.types';

interface ChartDataProps {
  // Target Range
  targetRangeArea: string | null;
  targetRange: { min: number; max: number };
  
  // Percentile Lines
  percentileLines: {
    p5: string;
    p25: string;
    p50: string;
    p75: string;
    p95: string;
  } | null;
  
  // Percentile Bands  
  percentileBands: {
    p5_p95: string;
    p25_p75: string;
  } | null;
  
  // Chart dimensions
  yScale: (value: number) => number;
  chartWidth: number;
  
  // Data for color determination
  agpData?: AGPData | null;
  
  // Display options
  showTargetRange?: boolean;
  showPercentileBands?: boolean;
  showPercentileLines?: boolean;
}

export const ChartData: React.FC<ChartDataProps> = ({
  targetRangeArea,
  targetRange,
  percentileLines,
  percentileBands,
  yScale,
  chartWidth,
  agpData,
  showTargetRange = true,
  showPercentileBands = true,
  showPercentileLines = true
}) => {
  return (
    <G>
      {/* Target Range Area */}
      {showTargetRange && targetRangeArea && (
        <Path
          d={targetRangeArea}
          fill={PERCENTILE_COLORS.target}
          opacity={0.3}
        />
      )}
      
      {/* Percentile Bands (shaded areas) */}
      {showPercentileBands && percentileBands && (
        <>
          {/* 5th-95th percentile band */}
          {percentileBands.p5_p95 && (
            <Path
              d={percentileBands.p5_p95}
              fill="url(#p5p95Gradient)"
              opacity={0.4}
            />
          )}
          
          {/* 25th-75th percentile band */}
          {percentileBands.p25_p75 && (
            <Path
              d={percentileBands.p25_p75}
              fill="url(#p25p75Gradient)"
              opacity={0.6}
            />
          )}
        </>
      )}
      
      {/* Percentile Lines */}
      {showPercentileLines && percentileLines && (
        <>
          {/* 5th percentile line */}
          {percentileLines.p5 && (
            <Path
              d={percentileLines.p5}
              stroke={CHART_COLORS.textSecondary}
              strokeWidth={1}
              fill="none"
              strokeDasharray="2,2"
              opacity={0.7}
            />
          )}
          
          {/* 25th percentile line */}
          {percentileLines.p25 && (
            <Path
              d={percentileLines.p25}
              stroke={CHART_COLORS.textSecondary}
              strokeWidth={1.5}
              fill="none"
              opacity={0.8}
            />
          )}
          
          {/* 50th percentile (median) line */}
          {percentileLines.p50 && (
            <Path
              d={percentileLines.p50}
              stroke={PERCENTILE_COLORS.median}
              strokeWidth={2}
              fill="none"
            />
          )}
          
          {/* 75th percentile line */}
          {percentileLines.p75 && (
            <Path
              d={percentileLines.p75}
              stroke={CHART_COLORS.textSecondary}
              strokeWidth={1.5}
              fill="none"
              opacity={0.8}
            />
          )}
          
          {/* 95th percentile line */}
          {percentileLines.p95 && (
            <Path
              d={percentileLines.p95}
              stroke={CHART_COLORS.textSecondary}
              strokeWidth={1}
              fill="none"
              strokeDasharray="2,2"
              opacity={0.7}
            />
          )}
        </>
      )}
      
      {/* Target Range Border Lines */}
      {showTargetRange && (
        <>
          <Line
            x1={0}
            y1={yScale(targetRange.min)}
            x2={chartWidth}
            y2={yScale(targetRange.min)}
            stroke={GLUCOSE_RANGES.target.color}
            strokeWidth={2}
            strokeDasharray="5,5"
            opacity={0.8}
          />
          <Line
            x1={0}
            y1={yScale(targetRange.max)}
            x2={chartWidth}
            y2={yScale(targetRange.max)}
            stroke={GLUCOSE_RANGES.target.color}
            strokeWidth={2}
            strokeDasharray="5,5"
            opacity={0.8}
          />
        </>
      )}
    </G>
  );
};

export default ChartData;
