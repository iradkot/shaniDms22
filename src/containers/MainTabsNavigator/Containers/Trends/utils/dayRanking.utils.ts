// Utility functions for ranking days by different metrics

import { DayDetail } from '../utils/trendsCalculations';
import { MetricType } from '../types/trends.types';

/**
 * Ranks days based on the selected metric
 * @param dailyDetails Array of day details
 * @param metric The metric to use for ranking
 * @returns Object with best and worst day details
 */
export function rankDaysByMetric(
  dailyDetails: DayDetail[], 
  metric: MetricType
): { bestDayDetail: DayDetail | undefined; worstDayDetail: DayDetail | undefined } {
  if (dailyDetails.length === 0) {
    return { bestDayDetail: undefined, worstDayDetail: undefined };
  }

  let sortedDays: DayDetail[];

  switch (metric) {
    case 'tir':
      // Higher TIR is better
      sortedDays = [...dailyDetails].sort((a, b) => b.tir - a.tir);
      break;
    case 'hypos':
      // Fewer serious hypos is better
      sortedDays = [...dailyDetails].sort((a, b) => a.seriousHypos - b.seriousHypos);
      break;
    case 'hypers':
      // Fewer serious hypers is better
      sortedDays = [...dailyDetails].sort((a, b) => a.seriousHypers - b.seriousHypers);
      break;
    default:
      sortedDays = dailyDetails;
  }

  return {
    bestDayDetail: sortedDays[0],
    worstDayDetail: sortedDays[sortedDays.length - 1]
  };
}

/**
 * Gets display strings for best and worst days
 */
export function getBestWorstDayStrings(
  bestDayDetail: DayDetail | undefined,
  worstDayDetail: DayDetail | undefined
): { bestDay: string; worstDay: string } {
  return {
    bestDay: bestDayDetail?.dateString || '',
    worstDay: worstDayDetail?.dateString || ''
  };
}
