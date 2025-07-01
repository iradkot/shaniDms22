// Hook for AGP Chart Configuration (No D3 dependencies)

import { useMemo } from 'react';
import { AGPChartConfig, AGPData } from '../types/agp.types';
import { AGP_DEFAULT_CONFIG, AGP_TIME_CONFIG, AGP_GLUCOSE_GRID } from '../utils/constants';

interface UseChartConfigProps {
  width?: number;
  height?: number;
  agpData: AGPData | null;
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

// Simple linear scale function
const createLinearScale = (domain: [number, number], range: [number, number]) => {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  
  const scale = (value: number) => {
    const ratio = (value - domainMin) / (domainMax - domainMin);
    return rangeMin + ratio * (rangeMax - rangeMin);
  };
  
  // Add domain and range properties for compatibility
  scale.domain = () => domain;
  scale.range = () => range;
  
  return scale;
};

// Generate smooth SVG path for line
const generateLinePath = (
  points: Array<{ timeOfDay: number; value: number }>,
  xScale: (value: number) => number,
  yScale: (value: number) => number
): string => {
  if (points.length === 0) return '';
  
  let path = `M ${xScale(points[0].timeOfDay)} ${yScale(points[0].value)}`;
  
  for (let i = 1; i < points.length; i++) {
    const x = xScale(points[i].timeOfDay);
    const y = yScale(points[i].value);
    path += ` L ${x} ${y}`;
  }
  
  return path;
};

// Generate smooth SVG path for area
const generateAreaPath = (
  points: Array<{ timeOfDay: number; lower: number; upper: number }>,
  xScale: (value: number) => number,
  yScale: (value: number) => number
): string => {
  if (points.length === 0) return '';
  
  // Start at first point upper
  let path = `M ${xScale(points[0].timeOfDay)} ${yScale(points[0].upper)}`;
  
  // Draw upper line
  for (let i = 1; i < points.length; i++) {
    const x = xScale(points[i].timeOfDay);
    const y = yScale(points[i].upper);
    path += ` L ${x} ${y}`;
  }
  
  // Draw lower line in reverse
  for (let i = points.length - 1; i >= 0; i--) {
    const x = xScale(points[i].timeOfDay);
    const y = yScale(points[i].lower);
    path += ` L ${x} ${y}`;
  }
  
  path += ' Z'; // Close path
  return path;
};

/**
 * Hook to generate chart configuration for AGP graph
 */
export const useChartConfig = ({
  width = AGP_DEFAULT_CONFIG.defaultWidth,
  height = AGP_DEFAULT_CONFIG.defaultHeight,
  agpData,
  margin = AGP_DEFAULT_CONFIG.margin
}: UseChartConfigProps): AGPChartConfig | null => {
  
  const chartConfig = useMemo(() => {
    if (!agpData || agpData.percentiles.length === 0) {
      return null;
    }
    
    // Calculate inner dimensions
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Time scale (0 to 1440 minutes = 24 hours)
    const xScale = createLinearScale([0, AGP_TIME_CONFIG.totalMinutes], [0, innerWidth]);
    
    // Glucose scale - find min/max from data with some padding
    const allValues: number[] = [];
    agpData.percentiles.forEach(p => {
      allValues.push(p.p5, p.p25, p.p50, p.p75, p.p95);
    });
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    
    // Use sensible bounds with padding
    const yMin = Math.max(AGP_GLUCOSE_GRID.yAxisMin, Math.floor(dataMin / 10) * 10 - 20);
    const yMax = Math.min(AGP_GLUCOSE_GRID.yAxisMax, Math.ceil(dataMax / 10) * 10 + 20);
    
    const yScale = createLinearScale([yMax, yMin], [0, innerHeight]); // Inverted for SVG coordinates
    
    // Generate time points for x-axis
    const timePoints: number[] = [];
    for (let minutes = 0; minutes <= AGP_TIME_CONFIG.totalMinutes; minutes += AGP_TIME_CONFIG.tickInterval) {
      timePoints.push(minutes);
    }
    
    return {
      width,
      height,
      margin,
      xScale,
      yScale,
      timePoints
    };
  }, [width, height, agpData, margin]);
  
  return chartConfig;
};

/**
 * Hook to generate time axis labels
 */
export const useTimeAxisLabels = (chartConfig: AGPChartConfig | null) => {
  return useMemo(() => {
    if (!chartConfig) return [];
    
    return chartConfig.timePoints.map(minutes => {
      const hours = Math.floor(minutes / 60);
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const period = hours >= 12 ? 'PM' : 'AM';
      
      // For midnight and noon, show full labels
      if (hours === 0) return '12 AM';
      if (hours === 12) return '12 PM';
      
      return `${displayHours} ${period}`;
    });
  }, [chartConfig]);
};

/**
 * Hook to generate glucose grid lines
 */
export const useGlucoseGridLines = (chartConfig: AGPChartConfig | null) => {
  return useMemo(() => {
    if (!chartConfig) return { major: [], minor: [] };
    
    const [yMin, yMax] = chartConfig.yScale.domain();
    
    const majorLines = AGP_GLUCOSE_GRID.major.filter(value => 
      value >= yMin && value <= yMax
    );
    
    const minorLines = AGP_GLUCOSE_GRID.minor.filter(value => 
      value >= yMin && value <= yMax && !majorLines.includes(value)
    );
    
    return { major: majorLines, minor: minorLines };
  }, [chartConfig]);
};

/**
 * Hook to generate line paths for percentile curves
 */
export const usePercentileLines = (chartConfig: AGPChartConfig | null, agpData: AGPData | null) => {
  return useMemo(() => {
    if (!chartConfig || !agpData) return null;
    
    // Generate path data for each percentile
    const paths = {
      p5: generateLinePath(
        agpData.percentiles.map(p => ({ timeOfDay: p.timeOfDay, value: p.p5 })),
        chartConfig.xScale,
        chartConfig.yScale
      ),
      p25: generateLinePath(
        agpData.percentiles.map(p => ({ timeOfDay: p.timeOfDay, value: p.p25 })),
        chartConfig.xScale,
        chartConfig.yScale
      ),
      p50: generateLinePath(
        agpData.percentiles.map(p => ({ timeOfDay: p.timeOfDay, value: p.p50 })),
        chartConfig.xScale,
        chartConfig.yScale
      ),
      p75: generateLinePath(
        agpData.percentiles.map(p => ({ timeOfDay: p.timeOfDay, value: p.p75 })),
        chartConfig.xScale,
        chartConfig.yScale
      ),
      p95: generateLinePath(
        agpData.percentiles.map(p => ({ timeOfDay: p.timeOfDay, value: p.p95 })),
        chartConfig.xScale,
        chartConfig.yScale
      )
    };
    
    return paths;
  }, [chartConfig, agpData]);
};

/**
 * Hook to generate area paths for percentile bands
 */
export const usePercentileBands = (chartConfig: AGPChartConfig | null, agpData: AGPData | null) => {
  return useMemo(() => {
    if (!chartConfig || !agpData) return null;
    
    // Generate area data for percentile bands
    const bands = {
      p5_p95: generateAreaPath(
        agpData.percentiles.map(p => ({
          timeOfDay: p.timeOfDay,
          lower: p.p5,
          upper: p.p95
        })),
        chartConfig.xScale,
        chartConfig.yScale
      ),
      p25_p75: generateAreaPath(
        agpData.percentiles.map(p => ({
          timeOfDay: p.timeOfDay,
          lower: p.p25,
          upper: p.p75
        })),
        chartConfig.xScale,
        chartConfig.yScale
      )
    };
    
    return bands;
  }, [chartConfig, agpData]);
};

/**
 * Hook to generate target range area
 */
export const useTargetRangeArea = (
  chartConfig: AGPChartConfig | null, 
  targetRange: { min: number; max: number } = { min: 70, max: 180 }
) => {
  return useMemo(() => {
    if (!chartConfig) return null;
    
    const timePoints = [
      { timeOfDay: 0, lower: targetRange.min, upper: targetRange.max },
      { timeOfDay: AGP_TIME_CONFIG.totalMinutes, lower: targetRange.min, upper: targetRange.max }
    ];
    
    return generateAreaPath(timePoints, chartConfig.xScale, chartConfig.yScale);
  }, [chartConfig, targetRange]);
};
