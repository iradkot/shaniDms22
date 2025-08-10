// AGP (Ambulatory Glucose Profile) Types

import { BgSample } from 'app/types/day_bgs.types';

/**
 * AGP percentile data for a specific time point
 */
export interface AGPPercentilePoint {
  timeOfDay: number; // Minutes from midnight (0-1439)
  p5: number;   // 5th percentile
  p25: number;  // 25th percentile
  p50: number;  // 50th percentile (median)
  p75: number;  // 75th percentile
  p95: number;  // 95th percentile
  count: number; // Number of readings contributing to this time point
}

/**
 * Complete AGP data structure
 */
export interface AGPData {
  percentiles: AGPPercentilePoint[];
  statistics: AGPStatistics;
  rawData: BgSample[];
  dateRange: {
    start: Date;
    end: Date;
    days: number;
  };
}

/**
 * AGP Statistics matching medical standards
 */
export interface AGPStatistics {
  // Time in Range percentages
  timeInRange: {
    veryLow: number;    // <54 mg/dL
    low: number;        // 54-69 mg/dL
    target: number;     // 70-180 mg/dL
    high: number;       // 181-250 mg/dL
    veryHigh: number;   // >250 mg/dL
  };
  
  // Core metrics
  averageGlucose: number;
  gmi: number; // Glucose Management Indicator
  cv: number;  // Coefficient of Variation (glucose variability)
  
  // Additional metrics
  totalReadings: number;
  daysWithData: number;
  readingsPerDay: number;
  
  // Estimated A1C
  estimatedA1C: number;
}

/**
 * AGP glucose ranges with colors
 */
export interface AGPRanges {
  veryLow: { min: number; max: number; color: string; label: string };
  low: { min: number; max: number; color: string; label: string };
  target: { min: number; max: number; color: string; label: string };
  high: { min: number; max: number; color: string; label: string };
  veryHigh: { min: number; max: number; color: string; label: string };
}

/**
 * AGP Chart configuration
 */
export interface AGPChartConfig {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  xScale: any; // d3 scale
  yScale: any; // d3 scale
  timePoints: number[]; // Array of time points (minutes from midnight)
}

/**
 * AGP Graph component props
 */
export interface AGPGraphProps {
  bgData: BgSample[];
  width?: number;
  height?: number;
  showStatistics?: boolean;
  showLegend?: boolean;
  targetRange?: { min: number; max: number };
}

/**
 * AGP Statistics component props
 */
export interface AGPStatisticsProps {
  statistics: AGPStatistics;
  showDetailed?: boolean;
}

/**
 * AGP Legend component props
 */
export interface AGPLegendProps {
  ranges: AGPRanges;
  horizontal?: boolean;
}

/**
 * AGP processing options
 */
export interface AGPProcessingOptions {
  intervalMinutes?: number; // Time interval for percentile calculation (default: 5)
  minReadingsPerInterval?: number; // Minimum readings required (default: 3)
  smoothing?: boolean; // Apply smoothing to percentile curves
  targetRange?: { min: number; max: number }; // Custom target range
}
