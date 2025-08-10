// AGP Constants and Configuration
// Updated to use shared glucose chart theme

import { AGPRanges } from '../types/agp.types';
import { 
  GLUCOSE_RANGES, 
  CHART_COLORS, 
  PERCENTILE_COLORS,
  GLUCOSE_GRID as SHARED_GLUCOSE_GRID 
} from 'app/components/shared/GlucoseChart';

/**
 * Standard AGP glucose ranges - now using shared theme colors
 */
export const AGP_GLUCOSE_RANGES: AGPRanges = GLUCOSE_RANGES;

/**
 * AGP Percentile colors - now using shared theme
 */
export const AGP_PERCENTILE_COLORS = PERCENTILE_COLORS;

/**
 * Default AGP processing configuration
 */
export const AGP_DEFAULT_CONFIG = {
  intervalMinutes: 5,           // 5-minute intervals
  minReadingsPerInterval: 3,    // Minimum 3 readings per interval
  smoothing: true,              // Apply smoothing
  targetRange: { min: 70, max: 180 }, // Standard target range  // Chart dimensions - optimized for better width utilization
  defaultWidth: 350,
  defaultHeight: 250,  margin: {
    top: 20,
    right: 35,   // Increased to balance with left margin
    bottom: 50,  // More space for X-axis labels
    left: 65     // Slightly reduced while maintaining Y-axis label space
  }
};

/**
 * Time axis configuration (24-hour format)
 */
export const AGP_TIME_CONFIG = {
  tickInterval: 240,        // Major ticks every 4 hours (240 minutes) for cleaner display
  minorTickInterval: 120,   // Minor ticks every 2 hours
  timeLabels: [
    '12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'
  ],
  totalMinutes: 1440        // 24 hours = 1440 minutes
};

/**
 * Y-axis glucose levels for grid lines - now using shared grid
 */
export const AGP_GLUCOSE_GRID = SHARED_GLUCOSE_GRID;

/**
 * Colors for different elements - now using shared theme
 */
export const AGP_COLORS = CHART_COLORS;

/**
 * AGP Statistics formatting
 */
export const AGP_STATS_FORMAT = {
  percentage: { decimals: 1, suffix: '%' },
  glucose: { decimals: 0, suffix: ' mg/dL' },
  gmi: { decimals: 1, suffix: '%' },
  cv: { decimals: 1, suffix: '%' },
  a1c: { decimals: 1, suffix: '%' }
};

/**
 * Percentiles to calculate and display
 */
export const AGP_PERCENTILES = [5, 25, 50, 75, 95] as const;

/**
 * Animation configuration
 */
export const AGP_ANIMATION = {
  duration: 300,
  easing: 'ease-in-out'
};

/**
 * Validation constants
 */
export const AGP_VALIDATION = {
  minDataPoints: 10,        // Minimum data points to generate AGP
  minDays: 1,               // Minimum days of data
  maxGlucose: 600,          // Maximum valid glucose value
  minGlucose: 20            // Minimum valid glucose value
};
