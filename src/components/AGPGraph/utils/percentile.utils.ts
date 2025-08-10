// AGP Percentile Calculation Utilities

import { BgSample } from 'app/types/day_bgs.types';
import { AGPPercentilePoint, AGPProcessingOptions } from '../types/agp.types';
import { AGP_DEFAULT_CONFIG, AGP_PERCENTILES } from './constants';

/**
 * Convert time to minutes from midnight
 */
export const timeToMinutes = (date: Date): number => {
  return date.getHours() * 60 + date.getMinutes();
};

/**
 * Convert minutes from midnight to time string
 */
export const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

/**
 * Calculate percentile from array of numbers
 */
export const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  
  if (index === Math.floor(index)) {
    return sorted[index];
  }
  
  const lower = sorted[Math.floor(index)];
  const upper = sorted[Math.ceil(index)];
  const weight = index - Math.floor(index);
  
  return lower + (upper - lower) * weight;
};

/**
 * Group BG samples by time of day intervals
 */
export const groupByTimeOfDay = (
  bgSamples: BgSample[],
  intervalMinutes: number = AGP_DEFAULT_CONFIG.intervalMinutes
): Map<number, number[]> => {
  const timeGroups = new Map<number, number[]>();
  
  // Initialize all time intervals
  for (let minutes = 0; minutes < 1440; minutes += intervalMinutes) {
    timeGroups.set(minutes, []);
  }
  
  // Group samples by time interval
  bgSamples.forEach(sample => {
    const sampleDate = new Date(sample.date);
    const timeOfDay = timeToMinutes(sampleDate);
    
    // Find the appropriate interval
    const intervalStart = Math.floor(timeOfDay / intervalMinutes) * intervalMinutes;
    
    if (timeGroups.has(intervalStart)) {
      timeGroups.get(intervalStart)!.push(sample.sgv);
    }
  });
  
  return timeGroups;
};

/**
 * Calculate AGP percentiles for all time intervals
 */
export const calculateAGPPercentiles = (
  bgSamples: BgSample[],
  options: AGPProcessingOptions = {}
): AGPPercentilePoint[] => {
  const {
    intervalMinutes = AGP_DEFAULT_CONFIG.intervalMinutes,
    minReadingsPerInterval = AGP_DEFAULT_CONFIG.minReadingsPerInterval
  } = options;
  
  const timeGroups = groupByTimeOfDay(bgSamples, intervalMinutes);
  const percentilePoints: AGPPercentilePoint[] = [];
  
  timeGroups.forEach((values, timeOfDay) => {
    if (values.length >= minReadingsPerInterval) {
      const point: AGPPercentilePoint = {
        timeOfDay,
        p5: calculatePercentile(values, 5),
        p25: calculatePercentile(values, 25),
        p50: calculatePercentile(values, 50),
        p75: calculatePercentile(values, 75),
        p95: calculatePercentile(values, 95),
        count: values.length
      };
      
      percentilePoints.push(point);
    }
  });
  
  return percentilePoints.sort((a, b) => a.timeOfDay - b.timeOfDay);
};

/**
 * Smooth percentile data using moving average
 */
export const smoothPercentiles = (
  percentiles: AGPPercentilePoint[],
  windowSize: number = 3
): AGPPercentilePoint[] => {
  if (percentiles.length <= windowSize) return percentiles;
  
  const smoothed: AGPPercentilePoint[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  percentiles.forEach((point, index) => {
    const start = Math.max(0, index - halfWindow);
    const end = Math.min(percentiles.length - 1, index + halfWindow);
    const window = percentiles.slice(start, end + 1);
    
    const smoothedPoint: AGPPercentilePoint = {
      timeOfDay: point.timeOfDay,
      p5: window.reduce((sum, p) => sum + p.p5, 0) / window.length,
      p25: window.reduce((sum, p) => sum + p.p25, 0) / window.length,
      p50: window.reduce((sum, p) => sum + p.p50, 0) / window.length,
      p75: window.reduce((sum, p) => sum + p.p75, 0) / window.length,
      p95: window.reduce((sum, p) => sum + p.p95, 0) / window.length,
      count: point.count
    };
    
    smoothed.push(smoothedPoint);
  });
  
  return smoothed;
};

/**
 * Fill missing time intervals with interpolated values
 */
export const interpolateMissingIntervals = (
  percentiles: AGPPercentilePoint[],
  intervalMinutes: number = AGP_DEFAULT_CONFIG.intervalMinutes
): AGPPercentilePoint[] => {
  if (percentiles.length < 2) return percentiles;
  
  const complete: AGPPercentilePoint[] = [];
  
  for (let minutes = 0; minutes < 1440; minutes += intervalMinutes) {
    const existing = percentiles.find(p => p.timeOfDay === minutes);
    
    if (existing) {
      complete.push(existing);
    } else {
      // Find surrounding points for interpolation
      const before = percentiles.filter(p => p.timeOfDay < minutes).pop();
      const after = percentiles.find(p => p.timeOfDay > minutes);
      
      if (before && after) {
        const ratio = (minutes - before.timeOfDay) / (after.timeOfDay - before.timeOfDay);
        
        const interpolated: AGPPercentilePoint = {
          timeOfDay: minutes,
          p5: before.p5 + (after.p5 - before.p5) * ratio,
          p25: before.p25 + (after.p25 - before.p25) * ratio,
          p50: before.p50 + (after.p50 - before.p50) * ratio,
          p75: before.p75 + (after.p75 - before.p75) * ratio,
          p95: before.p95 + (after.p95 - before.p95) * ratio,
          count: 0 // Mark as interpolated
        };
        
        complete.push(interpolated);
      }
    }
  }
  
  return complete;
};

/**
 * Validate and filter glucose values
 */
export const validateGlucoseValues = (bgSamples: BgSample[]): BgSample[] => {
  return bgSamples.filter(sample => 
    sample.sgv > 20 && 
    sample.sgv < 600 && 
    !isNaN(sample.sgv) &&
    sample.date > 0
  );
};

/**
 * Get date range from BG samples
 */
export const getDateRange = (bgSamples: BgSample[]) => {
  if (bgSamples.length === 0) {
    const now = new Date();
    return {
      start: now,
      end: now,
      days: 0
    };
  }
  
  const dates = bgSamples.map(sample => sample.date).sort((a, b) => a - b);
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  
  // Calculate days spanning based on unique calendar days
  const uniqueDays = new Set(bgSamples.map(s => {
    const d = new Date(s.date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  
  const days = uniqueDays.size;
  
  // Add debugging for date range calculation
  console.log('[getDateRange] Date calculation:', {
    sampleCount: bgSamples.length,
    firstTimestamp: dates[0],
    lastTimestamp: dates[dates.length - 1],
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    timeDiffMs: end.getTime() - start.getTime(),
    timeDiffDays: (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    uniqueCalendarDays: days,
    uniqueDaysList: Array.from(uniqueDays).sort()
  });
  
  return { start, end, days };
};
