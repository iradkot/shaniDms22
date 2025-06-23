// AGP Statistics Calculation Utilities

import { BgSample } from 'app/types/day_bgs.types';
import { AGPStatistics } from '../types/agp.types';
import { AGP_GLUCOSE_RANGES } from './constants';

/**
 * Calculate Time in Range percentages
 */
export const calculateTimeInRange = (bgSamples: BgSample[]) => {
  if (bgSamples.length === 0) {
    return {
      veryLow: 0,
      low: 0,
      target: 0,
      high: 0,
      veryHigh: 0
    };
  }
  
  const counts = {
    veryLow: 0,
    low: 0,
    target: 0,
    high: 0,
    veryHigh: 0
  };
  
  bgSamples.forEach(sample => {
    const sgv = sample.sgv;
    
    if (sgv <= AGP_GLUCOSE_RANGES.veryLow.max) {
      counts.veryLow++;
    } else if (sgv <= AGP_GLUCOSE_RANGES.low.max) {
      counts.low++;
    } else if (sgv <= AGP_GLUCOSE_RANGES.target.max) {
      counts.target++;
    } else if (sgv <= AGP_GLUCOSE_RANGES.high.max) {
      counts.high++;
    } else {
      counts.veryHigh++;
    }
  });
  
  const total = bgSamples.length;
  
  return {
    veryLow: (counts.veryLow / total) * 100,
    low: (counts.low / total) * 100,
    target: (counts.target / total) * 100,
    high: (counts.high / total) * 100,
    veryHigh: (counts.veryHigh / total) * 100
  };
};

/**
 * Calculate average glucose
 */
export const calculateAverageGlucose = (bgSamples: BgSample[]): number => {
  if (bgSamples.length === 0) return 0;
  
  const sum = bgSamples.reduce((acc, sample) => acc + sample.sgv, 0);
  return sum / bgSamples.length;
};

/**
 * Calculate Glucose Management Indicator (GMI)
 * Formula: GMI = 3.31 + (0.02392 × mean glucose in mg/dL)
 */
export const calculateGMI = (averageGlucose: number): number => {
  return 3.31 + (0.02392 * averageGlucose);
};

/**
 * Calculate Coefficient of Variation (CV) - glucose variability
 */
export const calculateCV = (bgSamples: BgSample[]): number => {
  if (bgSamples.length < 2) return 0;
  
  const values = bgSamples.map(sample => sample.sgv);
  const mean = calculateAverageGlucose(bgSamples);
  
  const variance = values.reduce((acc, value) => {
    return acc + Math.pow(value - mean, 2);
  }, 0) / (values.length - 1);
  
  const standardDeviation = Math.sqrt(variance);
  
  return (standardDeviation / mean) * 100;
};

/**
 * Estimate A1C from average glucose
 * Formula: A1C = (mean glucose + 46.7) / 28.7
 */
export const estimateA1C = (averageGlucose: number): number => {
  return (averageGlucose + 46.7) / 28.7;
};

/**
 * Count unique days with data
 */
export const countDaysWithData = (bgSamples: BgSample[]): number => {
  if (bgSamples.length === 0) return 0;
  
  const uniqueDays = new Set<string>();
  
  bgSamples.forEach(sample => {
    const date = new Date(sample.date);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    uniqueDays.add(dayKey);
  });
  
  return uniqueDays.size;
};

/**
 * Calculate readings per day average
 */
export const calculateReadingsPerDay = (totalReadings: number, daysWithData: number): number => {
  if (daysWithData === 0) return 0;
  return totalReadings / daysWithData;
};

/**
 * Calculate comprehensive AGP statistics
 */
export const calculateAGPStatistics = (bgSamples: BgSample[]): AGPStatistics => {
  const validSamples = bgSamples.filter(sample => 
    sample.sgv > 20 && sample.sgv < 600 && !isNaN(sample.sgv)
  );
  
  if (validSamples.length === 0) {
    return {
      timeInRange: {
        veryLow: 0,
        low: 0,
        target: 0,
        high: 0,
        veryHigh: 0
      },
      averageGlucose: 0,
      gmi: 0,
      cv: 0,
      totalReadings: 0,
      daysWithData: 0,
      readingsPerDay: 0,
      estimatedA1C: 0
    };
  }
  
  const timeInRange = calculateTimeInRange(validSamples);
  const averageGlucose = calculateAverageGlucose(validSamples);
  const gmi = calculateGMI(averageGlucose);
  const cv = calculateCV(validSamples);
  const totalReadings = validSamples.length;
  const daysWithData = countDaysWithData(validSamples);
  const readingsPerDay = calculateReadingsPerDay(totalReadings, daysWithData);
  const estimatedA1C = estimateA1C(averageGlucose);
  
  return {
    timeInRange,
    averageGlucose: Math.round(averageGlucose),
    gmi: Math.round(gmi * 10) / 10,
    cv: Math.round(cv * 10) / 10,
    totalReadings,
    daysWithData,
    readingsPerDay: Math.round(readingsPerDay * 10) / 10,
    estimatedA1C: Math.round(estimatedA1C * 10) / 10
  };
};

/**
 * Format percentage for display
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Format glucose value for display
 */
export const formatGlucose = (value: number): string => {
  return `${Math.round(value)} mg/dL`;
};

/**
 * Get risk assessment based on statistics
 */
export interface RiskAssessment {
  timeInTarget: 'excellent' | 'good' | 'fair' | 'poor';
  hypoglycemiaRisk: 'low' | 'moderate' | 'high';
  hyperglycemiaRisk: 'low' | 'moderate' | 'high';
  variabilityRisk: 'low' | 'moderate' | 'high';
}

export const assessRisk = (statistics: AGPStatistics): RiskAssessment => {
  const { timeInRange, cv } = statistics;
  
  // Time in Target assessment
  let timeInTarget: RiskAssessment['timeInTarget'];
  if (timeInRange.target >= 70) timeInTarget = 'excellent';
  else if (timeInRange.target >= 50) timeInTarget = 'good';
  else if (timeInRange.target >= 30) timeInTarget = 'fair';
  else timeInTarget = 'poor';
  
  // Hypoglycemia risk
  const lowTotal = timeInRange.veryLow + timeInRange.low;
  let hypoglycemiaRisk: RiskAssessment['hypoglycemiaRisk'];
  if (lowTotal < 4) hypoglycemiaRisk = 'low';
  else if (lowTotal < 10) hypoglycemiaRisk = 'moderate';
  else hypoglycemiaRisk = 'high';
  
  // Hyperglycemia risk
  const highTotal = timeInRange.high + timeInRange.veryHigh;
  let hyperglycemiaRisk: RiskAssessment['hyperglycemiaRisk'];
  if (highTotal < 25) hyperglycemiaRisk = 'low';
  else if (highTotal < 50) hyperglycemiaRisk = 'moderate';
  else hyperglycemiaRisk = 'high';
  
  // Variability risk (CV)
  let variabilityRisk: RiskAssessment['variabilityRisk'];
  if (cv < 36) variabilityRisk = 'low';
  else if (cv < 50) variabilityRisk = 'moderate';
  else variabilityRisk = 'high';
  
  return {
    timeInTarget,
    hypoglycemiaRisk,
    hyperglycemiaRisk,
    variabilityRisk
  };
};
