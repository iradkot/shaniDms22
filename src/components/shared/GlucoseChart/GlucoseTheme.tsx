// Unified Glucose Chart Theme Colors
// Replaces hardcoded colors in both AGP and CGM components

import { colors } from 'app/style/colors';
import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';

/**
 * Standard glucose ranges with theme-based colors
 * Uses PLAN_CONFIG.ts as single source of truth - NO HARDCODED VALUES
 */
export const GLUCOSE_RANGES = {
  veryLow: {
    min: 0,
    max: GLUCOSE_THRESHOLDS.SEVERE_HYPO,  // 55 from PLAN_CONFIG
    color: colors.darkRed[700],
    label: `Very Low (<${GLUCOSE_THRESHOLDS.SEVERE_HYPO})`
  },
  low: {
    min: GLUCOSE_THRESHOLDS.SEVERE_HYPO,  // 55 from PLAN_CONFIG
    max: GLUCOSE_THRESHOLDS.HYPO - 1,     // 69 (70-1) from PLAN_CONFIG
    color: colors.red[500],
    label: `Low (${GLUCOSE_THRESHOLDS.SEVERE_HYPO}-${GLUCOSE_THRESHOLDS.HYPO - 1})`
  },
  target: {
    min: GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.min,  // 70 from PLAN_CONFIG
    max: GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max,  // 180 from PLAN_CONFIG
    color: colors.green[500],
    label: `Target (${GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.min}-${GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max})`
  },
  high: {
    min: GLUCOSE_THRESHOLDS.HYPER + 1,    // 181 (180+1) from PLAN_CONFIG
    max: GLUCOSE_THRESHOLDS.SEVERE_HYPER, // 250 from PLAN_CONFIG
    color: colors.orange[500],
    label: `High (${GLUCOSE_THRESHOLDS.HYPER + 1}-${GLUCOSE_THRESHOLDS.SEVERE_HYPER})`
  },
  veryHigh: {
    min: GLUCOSE_THRESHOLDS.SEVERE_HYPER + 1,  // 251 (250+1) from PLAN_CONFIG
    max: 999,  // Keep high max for extreme values
    color: colors.deepOrange[600],
    label: `Very High (>${GLUCOSE_THRESHOLDS.SEVERE_HYPER})`
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
 * Uses PLAN_CONFIG thresholds for consistency
 */
export const getGlucoseRangeColor = (glucoseValue: number): string => {
  if (glucoseValue < GLUCOSE_THRESHOLDS.SEVERE_HYPO) return GLUCOSE_RANGES.veryLow.color;
  if (glucoseValue < GLUCOSE_THRESHOLDS.HYPO) return GLUCOSE_RANGES.low.color;
  if (glucoseValue <= GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max) return GLUCOSE_RANGES.target.color;
  if (glucoseValue <= GLUCOSE_THRESHOLDS.SEVERE_HYPER) return GLUCOSE_RANGES.high.color;
  return GLUCOSE_RANGES.veryHigh.color;
};

/**
 * Standard glucose grid values
 * Used by both AGP and CGM components
 * Based on PLAN_CONFIG thresholds for consistency
 */
export const GLUCOSE_GRID = {
  major: [50, 100, 150, 200, 250, 300],     // Major grid lines (gaps of 50)
  minor: [75, 125, 175, 225, 275],          // Minor grid lines (halfway between majors)
  yAxisMax: 350,                             // Maximum Y value
  yAxisMin: 30,                              // Minimum Y value
  // Add threshold lines for visual reference
  thresholds: {
    severeHypo: GLUCOSE_THRESHOLDS.SEVERE_HYPO,
    hypo: GLUCOSE_THRESHOLDS.HYPO,
    hyper: GLUCOSE_THRESHOLDS.HYPER,
    severeHyper: GLUCOSE_THRESHOLDS.SEVERE_HYPER,
  }
};

/**
 * Tooltip styling for glucose charts
 * Used by AGP and CGM tooltips
 */
export const TOOLTIP_STYLES = {
  backgroundColor: colors.gray[900],          // Dark background
  borderColor: colors.gray[700],              // Subtle border
  textColor: colors.white,                    // White text
  shadowColor: colors.black,                  // Drop shadow
  borderRadius: 8,                            // Rounded corners
  padding: 12,                                // Internal spacing
  maxWidth: 220,                              // Maximum width
  fontSize: 12,                               // Text size
  lineHeight: 16,                             // Line spacing
  backdropOpacity: 0.3                       // Background overlay
};
