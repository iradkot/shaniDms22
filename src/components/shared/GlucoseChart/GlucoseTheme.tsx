// Unified Glucose Chart Theme Colors
// Replaces hardcoded colors in both AGP and CGM components

import { colors } from 'app/style/colors';

/**
 * Standard glucose ranges with theme-based colors
 * Replaces AGP_GLUCOSE_RANGES hardcoded colors
 */
export const GLUCOSE_RANGES = {
  veryLow: {
    min: 0,
    max: 54,
    color: colors.darkRed[700],    // Was: '#8B0000' 
    label: 'Very Low (<54)'
  },
  low: {
    min: 54,
    max: 69,
    color: colors.red[500],        // Was: '#FF4444'
    label: 'Low (54-69)'
  },
  target: {
    min: 70,
    max: 180,
    color: colors.green[500],      // Was: '#4CAF50'
    label: 'Target (70-180)'
  },
  high: {
    min: 181,
    max: 250,
    color: colors.orange[500],     // Was: '#FFA726'
    label: 'High (181-250)'
  },
  veryHigh: {
    min: 251,
    max: 999,
    color: colors.deepOrange[600], // Was: '#FF5722'
    label: 'Very High (>250)'
  }
};

/**
 * Chart colors using theme palette
 * Replaces AGP_COLORS and hardcoded CGM colors
 */
export const CHART_COLORS = {
  // Background & Surface
  background: colors.white,           // Was: '#FFFFFF'
  surface: colors.gray[50],
  
  // Grid & Borders  
  gridMajor: colors.gray[600],        // Was: '#D0D0D0'
  gridMinor: colors.gray[400],        // Was: '#E8E8E8' 
  border: colors.gray[400],           // Was: '#BBBBBB'
  
  // Text
  text: colors.gray[800],             // Was: '#333333', 'black'
  textSecondary: colors.gray[600],    // Was: '#666666', 'grey'
  textLight: colors.gray[500],
  
  // Interactive Elements
  active: colors.blue[500],
  hover: colors.blue[100],
  disabled: colors.gray[300]
};

/**
 * Percentile colors for AGP charts using theme
 * Replaces AGP_PERCENTILE_COLORS
 */
export const PERCENTILE_COLORS = {
  p5_p95: `${colors.gray[400]}66`,    // Was: 'rgba(158, 158, 158, 0.3)' - 40% opacity
  p25_p75: `${colors.gray[600]}99`,   // Was: 'rgba(78, 78, 78, 0.4)' - 60% opacity
  median: colors.blue[500],           // Was: '#2196F3'
  target: `${colors.green[500]}33`    // Was: 'rgba(76, 175, 80, 0.2)' - 20% opacity
};

/**
 * Opacity values for consistent transparency
 */
export const CHART_OPACITY = {
  subtle: 0.1,      // For background elements
  light: 0.2,       // For target ranges  
  medium: 0.4,      // For secondary elements
  strong: 0.6,      // For primary elements
  solid: 1.0        // For text and borders
};

/**
 * Helper function to get color with opacity
 * Replaces hardcoded rgba() values
 */
export const withOpacity = (color: string, opacity: number): string => {
  // Convert opacity to hex (0-1 to 00-FF)
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return `${color}${alpha}`;
};

/**
 * Get glucose range color based on value
 */
export const getGlucoseRangeColor = (glucoseValue: number): string => {
  if (glucoseValue < GLUCOSE_RANGES.veryLow.max) return GLUCOSE_RANGES.veryLow.color;
  if (glucoseValue < GLUCOSE_RANGES.low.max) return GLUCOSE_RANGES.low.color;
  if (glucoseValue <= GLUCOSE_RANGES.target.max) return GLUCOSE_RANGES.target.color;
  if (glucoseValue <= GLUCOSE_RANGES.high.max) return GLUCOSE_RANGES.high.color;
  return GLUCOSE_RANGES.veryHigh.color;
};

/**
 * Standard glucose grid values
 * Used by both AGP and CGM components
 */
export const GLUCOSE_GRID = {
  major: [50, 100, 150, 200, 250, 300],     // Major grid lines (gaps of 50)
  minor: [75, 125, 175, 225, 275],          // Minor grid lines (halfway between majors)
  yAxisMax: 350,                             // Maximum Y value
  yAxisMin: 30                               // Minimum Y value
};
