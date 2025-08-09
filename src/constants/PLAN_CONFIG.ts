interface CGMStatusCodes {
  TARGET: string;
  HIGH: string;
  LOW: string;
  VERY_LOW: string;
  VERY_HIGH: string;
}
const CGM_STATUS_CODES = {
  TARGET: 'TARGET',
  HIGH: 'HIGH',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
  VERY_HIGH: 'VERY_HIGH',
};

// =============================================================================
// CONSOLIDATED GLUCOSE THRESHOLDS - Single Source of Truth
// =============================================================================

/**
 * Comprehensive glucose range definitions for the entire application.
 * All glucose-related calculations should use these values.
 * Values are in mg/dL.
 */
export const GLUCOSE_THRESHOLDS = {
  // Severe thresholds for critical alerts
  SEVERE_HYPO: 60,           // Severe hypoglycemia - immediate action required
  SEVERE_HYPER: 250,         // Severe hyperglycemia - immediate action required
  
  // Standard clinical thresholds
  HYPO: 70,                  // Hypoglycemia threshold
  HYPER: 180,                // Hyperglycemia threshold
  
  // Target ranges for different contexts
  TARGET_RANGE: {
    // Tight target range for optimal glucose management
    TIGHT: {
      min: 90,
      max: 110,
      middle: 100,             // Calculated as (90 + 110) / 2
    },
    // Standard target range for general diabetes management
    STANDARD: {
      min: 70,
      max: 140,
      middle: 105,             // Calculated as (70 + 140) / 2
    },
    // Extended range for less strict management
    EXTENDED: {
      min: 70,
      max: 180,
      middle: 125,             // Calculated as (70 + 180) / 2
    }
  },
  
} as const;

interface CgmRange {
  TARGET: {
    min: number;
    max: number;
  };
  [x: string]: number | {min: number; max: number};
}

export const cgmRange: CgmRange = {
  TARGET: {
    min: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min,
    max: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.max,
  },
  [CGM_STATUS_CODES.VERY_LOW]: GLUCOSE_THRESHOLDS.SEVERE_HYPO,
  [CGM_STATUS_CODES.VERY_HIGH]: GLUCOSE_THRESHOLDS.SEVERE_HYPO,
};

/**
 * Helper functions for glucose threshold calculations
 */
export const GLUCOSE_UTILS = {
  /**
   * Check if glucose value is in severe hypoglycemia range
   */
  isSevereHypo: (value: number): boolean => value < GLUCOSE_THRESHOLDS.SEVERE_HYPO,
  
  /**
   * Check if glucose value is in hypoglycemia range
   */
  isHypo: (value: number): boolean => value < GLUCOSE_THRESHOLDS.HYPO,
  
  /**
   * Check if glucose value is in hyperglycemia range
   */
  isHyper: (value: number): boolean => value > GLUCOSE_THRESHOLDS.HYPER,
  
  /**
   * Check if glucose value is in severe hyperglycemia range
   */
  isSevereHyper: (value: number): boolean => value > GLUCOSE_THRESHOLDS.SEVERE_HYPER,
  
  /**
   * Check if glucose value is in target range (defaults to STANDARD)
   */
  isInTargetRange: (value: number, range: 'TIGHT' | 'STANDARD' | 'EXTENDED' = 'STANDARD'): boolean => {
    const targetRange = GLUCOSE_THRESHOLDS.TARGET_RANGE[range];
    return value >= targetRange.min && value <= targetRange.max;
  },
  
  /**
   * Get target range object by name
   */
  getTargetRange: (range: 'TIGHT' | 'STANDARD' | 'EXTENDED' = 'STANDARD') => {
    return GLUCOSE_THRESHOLDS.TARGET_RANGE[range];
  }
};

// Backward compatibility exports (maintain existing PLAN_CONFIG interface)
export { CGM_STATUS_CODES };
