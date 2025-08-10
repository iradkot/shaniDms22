import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';

/**
 * Predefined glucose range presets for quick selection
 */
export const GLUCOSE_RANGE_PRESETS = {
  // Tight control ranges
  VERY_TIGHT: { min: 80, max: 120, label: 'Very Tight Control' },
  TIGHT: { min: 70, max: 140, label: 'Tight Control' },
  
  // Standard clinical ranges
  STANDARD: { 
    min: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min, 
    max: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.max, 
    label: 'Standard Target' 
  },
  EXTENDED: { 
    min: GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.min, 
    max: GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max, 
    label: 'Extended Target' 
  },
  
  // Custom analysis ranges
  HYPOGLYCEMIA: { min: 0, max: GLUCOSE_THRESHOLDS.HYPO, label: 'Hypoglycemia Risk' },
  HYPERGLYCEMIA: { min: GLUCOSE_THRESHOLDS.HYPER, max: 400, label: 'Hyperglycemia Risk' },
  
  // Time periods analysis
  OVERNIGHT_SAFE: { min: 80, max: 160, label: 'Safe Overnight Range' },
  POST_MEAL_ACCEPTABLE: { min: 70, max: 200, label: 'Post-Meal Acceptable' },
  
  // Exercise ranges
  EXERCISE_SAFE: { min: 100, max: 250, label: 'Safe for Exercise' },
  
  // Special conditions
  PREGNANCY: { min: 60, max: 120, label: 'Pregnancy Target' },
  ELDERLY: { min: 80, max: 180, label: 'Elderly Target' },
} as const;

/**
 * Get a list of all preset range options
 */
export const getGlucoseRangePresets = () => {
  return Object.entries(GLUCOSE_RANGE_PRESETS).map(([key, preset]) => ({
    key,
    ...preset,
  }));
};

/**
 * Get a preset by key
 */
export const getGlucoseRangePreset = (key: keyof typeof GLUCOSE_RANGE_PRESETS) => {
  return GLUCOSE_RANGE_PRESETS[key];
};

/**
 * Validate if a glucose range is medically reasonable
 */
export const validateGlucoseRange = (min: number, max: number): { isValid: boolean; message?: string } => {
  if (min >= max) {
    return { isValid: false, message: 'Minimum value must be less than maximum value' };
  }
  
  if (min < 30) {
    return { isValid: false, message: 'Minimum value is dangerously low (< 30 mg/dL)' };
  }
  
  if (max > 500) {
    return { isValid: false, message: 'Maximum value is extremely high (> 500 mg/dL)' };
  }
  
  if (max - min < 20) {
    return { isValid: false, message: 'Range is too narrow (< 20 mg/dL spread)' };
  }
  
  return { isValid: true };
};

/**
 * Get medically appropriate glucose values for slider selection
 * Provides more granular options in critical ranges and broader steps in extreme ranges
 */
export const getGlucoseValueOptions = (minLimit = 30, maxLimit = 500) => {
  const values: number[] = [];
  
  // Very low range (30-60): every 5 mg/dL
  for (let i = Math.max(30, minLimit); i <= 60 && i <= maxLimit; i += 5) {
    values.push(i);
  }
  
  // Low-normal range (65-100): every 5 mg/dL  
  for (let i = Math.max(65, minLimit); i <= 100 && i <= maxLimit; i += 5) {
    if (!values.includes(i)) values.push(i);
  }
  
  // Normal-high range (105-200): every 10 mg/dL
  for (let i = Math.max(105, minLimit); i <= 200 && i <= maxLimit; i += 10) {
    if (!values.includes(i)) values.push(i);
  }
  
  // High range (210-300): every 20 mg/dL
  for (let i = Math.max(210, minLimit); i <= 300 && i <= maxLimit; i += 20) {
    if (!values.includes(i)) values.push(i);
  }
  
  // Very high range (320-500): every 30 mg/dL
  for (let i = Math.max(320, minLimit); i <= Math.min(500, maxLimit); i += 30) {
    if (!values.includes(i)) values.push(i);
  }
  
  return values.sort((a, b) => a - b);
};

/**
 * Format glucose range for display
 */
export const formatGlucoseRange = (min: number, max: number, unit = 'mg/dL') => {
  return `${min}-${max} ${unit}`;
};

/**
 * Get clinical interpretation of a glucose range
 */
export const getGlucoseRangeInterpretation = (min: number, max: number): string => {
  const { HYPO, HYPER, SEVERE_HYPO, SEVERE_HYPER, TARGET_RANGE } = GLUCOSE_THRESHOLDS;
  
  if (max <= SEVERE_HYPO) {
    return 'Severe hypoglycemia range - Dangerous';
  }
  
  if (max <= HYPO) {
    return 'Hypoglycemia range - Requires immediate attention';
  }
  
  if (min >= TARGET_RANGE.STANDARD.min && max <= TARGET_RANGE.STANDARD.max) {
    return 'Target range - Excellent glucose control';
  }
  
  if (min >= TARGET_RANGE.STANDARD.min && max <= HYPER) {
    return 'Good control with some elevated readings';
  }
  
  if (min <= TARGET_RANGE.STANDARD.max && max >= HYPER) {
    return 'Mixed range - Both low and high readings included';
  }
  
  if (min >= HYPER && max <= SEVERE_HYPER) {
    return 'Hyperglycemia range - Needs improvement';
  }
  
  if (min >= SEVERE_HYPER) {
    return 'Severe hyperglycemia range - Urgent medical attention needed';
  }
  
  return 'Custom range - Review with healthcare provider';
};
