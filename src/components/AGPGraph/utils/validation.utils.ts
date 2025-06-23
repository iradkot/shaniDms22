// AGP Validation Utilities

import { BgSample } from 'app/types/day_bgs.types';
import { AGPProcessingOptions } from '../types/agp.types';
import { AGP_VALIDATION } from './constants';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Validate BG samples for AGP processing
 */
export const validateBgSamples = (bgSamples: BgSample[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if data exists
  if (!bgSamples || bgSamples.length === 0) {
    errors.push('No glucose data provided');
    return {
      isValid: false,
      errors,
      warnings,
      dataQuality: 'poor'
    };
  }
  
  // Check minimum data points
  if (bgSamples.length < AGP_VALIDATION.minDataPoints) {
    errors.push(`Insufficient data points. Need at least ${AGP_VALIDATION.minDataPoints}, got ${bgSamples.length}`);
  }
  
  // Validate individual samples
  const validSamples = bgSamples.filter(sample => {
    // Check SGV value
    if (typeof sample.sgv !== 'number' || isNaN(sample.sgv)) {
      return false;
    }
    
    // Check glucose range
    if (sample.sgv < AGP_VALIDATION.minGlucose || sample.sgv > AGP_VALIDATION.maxGlucose) {
      return false;
    }
    
    // Check date
    if (typeof sample.date !== 'number' || sample.date <= 0) {
      return false;
    }
    
    return true;
  });
  
  const invalidCount = bgSamples.length - validSamples.length;
  if (invalidCount > 0) {
    warnings.push(`${invalidCount} invalid readings excluded from analysis`);
  }
  
  // Check data coverage
  const dataQuality = assessDataQuality(validSamples);
  if (dataQuality === 'poor') {
    warnings.push('Limited data coverage may affect AGP accuracy');
  }
  
  // Check time span
  const timeSpan = getTimeSpanDays(validSamples);
  if (timeSpan < AGP_VALIDATION.minDays) {
    errors.push(`Insufficient time coverage. Need at least ${AGP_VALIDATION.minDays} day(s), got ${timeSpan.toFixed(1)} day(s)`);
  }
  
  const isValid = errors.length === 0 && validSamples.length >= AGP_VALIDATION.minDataPoints;
  
  return {
    isValid,
    errors,
    warnings,
    dataQuality
  };
};

/**
 * Assess data quality based on coverage and consistency
 */
export const assessDataQuality = (bgSamples: BgSample[]): 'excellent' | 'good' | 'fair' | 'poor' => {
  if (bgSamples.length === 0) return 'poor';
  
  const timeSpan = getTimeSpanDays(bgSamples);
  const readingsPerDay = bgSamples.length / timeSpan;
  const coverage = calculateTimeCoverage(bgSamples);
  
  // Excellent: >200 readings/day with >80% coverage
  if (readingsPerDay >= 200 && coverage >= 0.8) return 'excellent';
  
  // Good: >100 readings/day with >60% coverage
  if (readingsPerDay >= 100 && coverage >= 0.6) return 'good';
  
  // Fair: >50 readings/day with >40% coverage
  if (readingsPerDay >= 50 && coverage >= 0.4) return 'fair';
  
  return 'poor';
};

/**
 * Calculate time span in days
 */
export const getTimeSpanDays = (bgSamples: BgSample[]): number => {
  if (bgSamples.length === 0) return 0;
  
  const dates = bgSamples.map(sample => sample.date).sort((a, b) => a - b);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  
  return (lastDate - firstDate) / (1000 * 60 * 60 * 24);
};

/**
 * Calculate time coverage (what percentage of time has readings)
 */
export const calculateTimeCoverage = (bgSamples: BgSample[]): number => {
  if (bgSamples.length === 0) return 0;
  
  const timeSpan = getTimeSpanDays(bgSamples);
  const totalPossibleMinutes = timeSpan * 24 * 60;
  
  // Count unique 5-minute intervals with data
  const intervalsWithData = new Set<string>();
  
  bgSamples.forEach(sample => {
    const date = new Date(sample.date);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const intervalKey = Math.floor((date.getHours() * 60 + date.getMinutes()) / 5);
    const key = `${dayKey}-${intervalKey}`;
    intervalsWithData.add(key);
  });
  
  const totalPossibleIntervals = Math.floor(totalPossibleMinutes / 5);
  return intervalsWithData.size / totalPossibleIntervals;
};

/**
 * Validate processing options
 */
export const validateProcessingOptions = (options: AGPProcessingOptions): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (options.intervalMinutes !== undefined) {
    if (options.intervalMinutes < 1 || options.intervalMinutes > 60) {
      errors.push('Interval minutes must be between 1 and 60');
    }
    if (1440 % options.intervalMinutes !== 0) {
      warnings.push('Interval minutes should divide evenly into 1440 for best results');
    }
  }
  
  if (options.minReadingsPerInterval !== undefined) {
    if (options.minReadingsPerInterval < 1) {
      errors.push('Minimum readings per interval must be at least 1');
    }
  }
  
  if (options.targetRange) {
    const { min, max } = options.targetRange;
    if (min >= max) {
      errors.push('Target range minimum must be less than maximum');
    }
    if (min < 40 || max > 400) {
      warnings.push('Unusual target range specified');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    dataQuality: 'good' // Options don't affect data quality
  };
};

/**
 * Check for data gaps that might affect AGP accuracy
 */
export const identifyDataGaps = (bgSamples: BgSample[]): Array<{ start: Date; end: Date; durationHours: number }> => {
  if (bgSamples.length < 2) return [];
  
  const sortedSamples = bgSamples.sort((a, b) => a.date - b.date);
  const gaps: Array<{ start: Date; end: Date; durationHours: number }> = [];
  
  for (let i = 1; i < sortedSamples.length; i++) {
    const timeDiff = sortedSamples[i].date - sortedSamples[i - 1].date;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    // Consider gaps longer than 2 hours as significant
    if (hoursDiff > 2) {
      gaps.push({
        start: new Date(sortedSamples[i - 1].date),
        end: new Date(sortedSamples[i].date),
        durationHours: hoursDiff
      });
    }
  }
  
  return gaps;
};

/**
 * Get data quality recommendations
 */
export const getDataQualityRecommendations = (validationResult: ValidationResult): string[] => {
  const recommendations: string[] = [];
  
  if (validationResult.dataQuality === 'poor') {
    recommendations.push('Consider collecting more continuous glucose data for better AGP accuracy');
    recommendations.push('Ensure CGM/sensor is working properly and transmitting regularly');
  }
  
  if (validationResult.dataQuality === 'fair') {
    recommendations.push('AGP is functional but more data would improve accuracy');
    recommendations.push('Try to maintain consistent sensor wear for better coverage');
  }
  
  if (validationResult.warnings.some(w => w.includes('data coverage'))) {
    recommendations.push('Fill data gaps by wearing CGM more consistently');
  }
  
  return recommendations;
};
