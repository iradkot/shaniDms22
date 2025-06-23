// Shared Glucose Validation and Scaling Utilities
// Consolidates validation logic from AGP and CGM components

import { BgSample } from 'app/types/day_bgs.types';

/**
 * Validation constants
 */
export const GLUCOSE_VALIDATION = {
  minDataPoints: 10,        // Minimum data points for meaningful charts
  minDays: 1,               // Minimum days of data
  maxGlucose: 600,          // Maximum valid glucose value (mg/dL)
  minGlucose: 20            // Minimum valid glucose value (mg/dL)
};

/**
 * Validate glucose value range
 */
export const isValidGlucoseValue = (value: number): boolean => {
  return value >= GLUCOSE_VALIDATION.minGlucose && 
         value <= GLUCOSE_VALIDATION.maxGlucose && 
         !isNaN(value);
};

/**
 * Validate BG samples array
 * Consolidates validation from AGP validation.utils.ts and CGM utils.ts
 */
export const validateBgSamples = (bgSamples: BgSample[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validSamples: BgSample[];
} => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if data exists
  if (!bgSamples || !Array.isArray(bgSamples)) {
    errors.push('No glucose data provided');
    return { isValid: false, errors, warnings, validSamples: [] };
  }
  
  if (bgSamples.length === 0) {
    errors.push('Empty glucose data array');
    return { isValid: false, errors, warnings, validSamples: [] };
  }
  
  // Filter valid samples
  const validSamples = bgSamples.filter(sample => {
    if (!sample) return false;
    if (!sample.date) return false;
    if (!isValidGlucoseValue(sample.sgv)) return false;
    return true;
  });
  
  // Check minimum data requirements
  if (validSamples.length < GLUCOSE_VALIDATION.minDataPoints) {
    errors.push(`Insufficient data: ${validSamples.length} valid samples (minimum ${GLUCOSE_VALIDATION.minDataPoints})`);
  }
  
  // Calculate data quality warnings
  const invalidCount = bgSamples.length - validSamples.length;
  if (invalidCount > 0) {
    const invalidPercentage = (invalidCount / bgSamples.length) * 100;
    if (invalidPercentage > 20) {
      warnings.push(`${invalidPercentage.toFixed(1)}% of data points are invalid`);
    }
  }
  
  // Check date range
  if (validSamples.length > 0) {
    const dates = validSamples.map(s => new Date(s.date).getTime()).sort();
    const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    
    if (spanDays < GLUCOSE_VALIDATION.minDays) {
      warnings.push(`Data span is only ${spanDays.toFixed(1)} days`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    validSamples
  };
};

/**
 * Create Y-scale function for glucose values
 * Consolidates scaling logic from both AGP and CGM
 */
export const createGlucoseYScale = (
  height: number,
  minGlucose: number = 30,
  maxGlucose: number = 350
) => {
  return (glucoseValue: number): number => {
    // Linear scale: glucose range -> height range (inverted)
    const ratio = (glucoseValue - minGlucose) / (maxGlucose - minGlucose);
    return height - (ratio * height); // Invert Y axis
  };
};

/**
 * Create inverse Y-scale function (from pixel to glucose)
 */
export const createInverseGlucoseYScale = (
  height: number,
  minGlucose: number = 30,
  maxGlucose: number = 350
) => {
  return (yPixel: number): number => {
    // Invert the Y scale logic
    const ratio = (height - yPixel) / height;
    return minGlucose + (ratio * (maxGlucose - minGlucose));
  };
};

/**
 * Find closest glucose sample to a given time
 * Consolidates findClosestBgSample logic from CGM utils.ts
 */
export const findClosestGlucoseSample = (
  targetTime: number,
  bgSamples: BgSample[]
): BgSample | null => {
  if (!bgSamples || bgSamples.length === 0) {
    return null;
  }

  let start = 0;
  let end = bgSamples.length - 1;

  // Binary search for closest time
  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const midTime = new Date(bgSamples[mid].date).getTime();

    if (midTime === targetTime) {
      return bgSamples[mid];
    } else if (midTime < targetTime) {
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }

  // Find the closest of the two candidates
  if (start > 0 && (
    start === bgSamples.length ||
    targetTime - new Date(bgSamples[start - 1].date).getTime() <
    new Date(bgSamples[start].date).getTime() - targetTime
  )) {
    return bgSamples[start - 1];
  }

  return bgSamples[start] || null;
};

/**
 * Calculate glucose statistics
 * Basic stats that both AGP and CGM might need
 */
export const calculateGlucoseStats = (bgSamples: BgSample[]) => {
  const validSamples = bgSamples.filter(s => isValidGlucoseValue(s.sgv));
  
  if (validSamples.length === 0) {
    return null;
  }
  
  const values = validSamples.map(s => s.sgv).sort((a, b) => a - b);
  
  return {
    count: values.length,
    min: values[0],
    max: values[values.length - 1],
    mean: values.reduce((sum, val) => sum + val, 0) / values.length,
    median: values[Math.floor(values.length / 2)],
    p25: values[Math.floor(values.length * 0.25)],
    p75: values[Math.floor(values.length * 0.75)]
  };
};
