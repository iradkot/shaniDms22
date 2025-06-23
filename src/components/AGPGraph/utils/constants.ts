// AGP Constants and Configuration

import { AGPRanges } from '../types/agp.types';

/**
 * Standard AGP glucose ranges (mg/dL) following medical guidelines
 */
export const AGP_GLUCOSE_RANGES: AGPRanges = {
  veryLow: {
    min: 0,
    max: 54,
    color: '#8B0000', // Dark red
    label: 'Very Low (<54)'
  },
  low: {
    min: 54,
    max: 69,
    color: '#FF4444', // Red
    label: 'Low (54-69)'
  },
  target: {
    min: 70,
    max: 180,
    color: '#4CAF50', // Green
    label: 'Target (70-180)'
  },
  high: {
    min: 181,
    max: 250,
    color: '#FFA726', // Orange
    label: 'High (181-250)'
  },
  veryHigh: {
    min: 251,
    max: 999,
    color: '#FF5722', // Deep orange/red
    label: 'Very High (>250)'
  }
};

/**
 * AGP Percentile colors with opacity
 */
export const AGP_PERCENTILE_COLORS = {
  p5_p95: 'rgba(158, 158, 158, 0.3)',   // Light gray with transparency
  p25_p75: 'rgba(78, 78, 78, 0.4)',     // Darker gray with transparency
  median: '#2196F3',                     // Blue for median line
  target: 'rgba(76, 175, 80, 0.2)'      // Light green for target range
};

/**
 * Default AGP processing configuration
 */
export const AGP_DEFAULT_CONFIG = {
  intervalMinutes: 5,           // 5-minute intervals
  minReadingsPerInterval: 3,    // Minimum 3 readings per interval
  smoothing: true,              // Apply smoothing
  targetRange: { min: 70, max: 180 }, // Standard target range  // Chart dimensions - optimized for better width utilization
  defaultWidth: 350,
  defaultHeight: 250,
  margin: {
    top: 20,
    right: 15,   // Reduced from 20
    bottom: 50,  // More space for X-axis labels
    left: 50     // Reduced from 70 for better width utilization
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
 * Y-axis glucose levels for grid lines
 */
export const AGP_GLUCOSE_GRID = {
  major: [40, 70, 100, 140, 180, 250, 300], // Major grid lines
  minor: [60, 80, 120, 160, 200, 220],      // Minor grid lines
  yAxisMax: 350,                             // Maximum Y value
  yAxisMin: 30                               // Minimum Y value
};

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
 * Colors for different elements
 */
export const AGP_COLORS = {
  background: '#FFFFFF',
  gridMajor: '#D0D0D0',
  gridMinor: '#E8E8E8',
  text: '#333333',
  textSecondary: '#666666',
  border: '#BBBBBB'
};

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
