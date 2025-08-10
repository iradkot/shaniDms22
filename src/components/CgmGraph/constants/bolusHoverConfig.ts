/**
 * Configuration constants for bolus hover detection and tooltips
 * These values can be adjusted to improve user experience
 */

export const BOLUS_HOVER_CONFIG = {
  // Time window for detecting bolus events (in minutes)
  // Any bolus events within this time range from touch point will be included
  DETECTION_WINDOW_MINUTES: 5,
  
  // Spatial detection radius (in pixels)
  // Touch area around bolus markers for easier tapping
  SPATIAL_DETECTION_RADIUS: 40,
  
  // Maximum number of bolus events to show in one tooltip
  MAX_BOLUS_EVENTS_IN_TOOLTIP: 5,
  
  // Combined tooltip threshold (BG + bolus within this time)
  BG_BOLUS_COMBINATION_MINUTES: 1,
} as const;

// Convert minutes to milliseconds for calculations
export const DETECTION_WINDOW_MS = BOLUS_HOVER_CONFIG.DETECTION_WINDOW_MINUTES * 60 * 1000;
export const BG_COMBINATION_WINDOW_MS = BOLUS_HOVER_CONFIG.BG_BOLUS_COMBINATION_MINUTES * 60 * 1000;
