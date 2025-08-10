// Time-based zoom configuration for X-axis temporal analysis
import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';

/**
 * Time-based zoom configuration for medical glucose charts
 * Focuses on temporal analysis rather than visual scaling
 */
export const ZOOM_CONFIG = {
  // Time window zoom levels (hours shown)
  TIME_WINDOWS: {
    FULL_DAY: 24,      // Default: 24 hours
    HALF_DAY: 12,      // Zoom level 1: 12 hours  
    QUARTER_DAY: 6,    // Zoom level 2: 6 hours
    THREE_HOURS: 3,    // Zoom level 3: 3 hours (maximum detail)
  },
  
  // Zoom levels (multipliers of time window)
  MIN_ZOOM: 1,         // 1x = full 24 hours
  MAX_ZOOM: 8,         // 8x = 3 hours window (24/8 = 3)
  
  // Medical bounds (mg/dL) - Y-axis stays constant
  MEDICAL_BOUNDS: {
    MIN_GLUCOSE: 40,   // Below severe hypoglycemia for emergency analysis
    MAX_GLUCOSE: 400,  // Above severe hyperglycemia for complete range
  },
  
  // Pan configuration for horizontal scrolling when zoomed
  PAN_STEP_HOURS: 0.5,  // Hours to pan per scroll step
  MIN_PAN_POSITION: 0,  // Start of data (relative position)
  MAX_PAN_POSITION: 1,  // End of data (relative position)
  
  // Zoom controls
  ZOOM_STEP: 2,         // 2x zoom increment (24h -> 12h -> 6h -> 3h)
  
  // Animation
  ZOOM_ANIMATION_DURATION: 200, // ms for smooth time window transitions
  PAN_ANIMATION_DURATION: 150,  // ms for horizontal scroll animations
  RESET_ANIMATION_DURATION: 300, // ms for reset to full day view
  
  // Medical validation - ensure sufficient data visibility
  MIN_DATA_POINTS_PER_HOUR: 2,  // Minimum glucose readings per hour for analysis
  
  // Critical glucose ranges remain visible at all zoom levels
  CRITICAL_GLUCOSE_RANGES: {
    HYPO: GLUCOSE_THRESHOLDS.HYPO,           // ≤70 mg/dL
    SEVERE_HYPO: GLUCOSE_THRESHOLDS.SEVERE_HYPO,  // ≤54 mg/dL  
    HYPER: GLUCOSE_THRESHOLDS.HYPER,         // ≥180 mg/dL
    SEVERE_HYPER: GLUCOSE_THRESHOLDS.SEVERE_HYPER, // ≥250 mg/dL
  },
} as const;

/**
 * Zoom control button configuration
 */
export const ZOOM_CONTROLS_CONFIG = {
  BUTTON_SIZE: 44,        // Minimum touch target size (accessibility)
  ICON_SIZE: 24,          // Icon size within buttons
  SPACING: 8,             // Space between buttons
  BORDER_RADIUS: 22,      // Half of button size for circular buttons
  
  // Position relative to chart
  POSITION: {
    RIGHT_MARGIN: 16,     // Distance from right edge
    BOTTOM_MARGIN: 16,    // Distance from bottom edge
  },
  
  // Haptic feedback (iOS/Android)
  HAPTIC_ENABLED: true,
  HAPTIC_TYPE: 'light' as const,
} as const;

/**
 * Medical validation thresholds for time-based zoom operations
 */
export const MEDICAL_ZOOM_VALIDATION = {
  // Ensure sufficient data visibility for medical analysis
  MIN_VISIBLE_HOURS: 1,   // Minimum time window (1 hour) for meaningful analysis
  
  // Data density validation (readings per hour)
  MIN_READINGS_PER_HOUR: 2,    // Minimum BG samples per hour for analysis
  OPTIMAL_READINGS_PER_HOUR: 12, // Optimal readings per hour (5-minute intervals)
  
  // Glucose range validation - Y-axis stays constant
  GLUCOSE_RANGE: {
    MIN: 40,   // Minimum glucose visible (mg/dL)
    MAX: 400,  // Maximum glucose visible (mg/dL)
  },
} as const;

/**
 * Time-based zoom state for X-axis temporal analysis
 */
export type ZoomState = {
  timeWindowHours: number;  // Hours shown in current view (24, 12, 6, 3)
  panPosition: number;      // Horizontal pan position (0-1, where 0=start, 1=end)
  zoomLevel: number;        // Zoom multiplier (1=24h, 2=12h, 4=6h, 8=3h)
  isZoomed: boolean;        // Whether currently zoomed from default view
};

/**
 * Time window boundaries for data filtering
 */
export type TimeWindow = {
  startTime: number;        // Start timestamp (ms)
  endTime: number;          // End timestamp (ms)
  durationHours: number;    // Duration in hours
};

/**
 * Zoom bounds for validation and limits
 */
export type ZoomBounds = {
  minZoom: number;          // Minimum zoom level (1 = full day)
  maxZoom: number;          // Maximum zoom level (8 = 3 hours)
  minPan: number;           // Minimum pan position (0)
  maxPan: number;           // Maximum pan position (1)
  timeWindow: TimeWindow;   // Current visible time window
};
