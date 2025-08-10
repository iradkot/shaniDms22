// Hook for AGP Statistics Processing

import { useMemo } from 'react';
import { AGPStatistics } from '../types/agp.types';
import { 
  formatPercentage, 
  formatGlucose, 
  assessRisk,
  RiskAssessment 
} from '../utils/statistics.utils';
import {GLUCOSE_THRESHOLDS} from "app/constants/PLAN_CONFIG.ts";
;

interface FormattedStatistics extends AGPStatistics {
  formatted: {
    timeInRange: {
      veryLow: string;
      low: string;
      target: string;
      high: string;
      veryHigh: string;
    };
    averageGlucose: string;
    gmi: string;
    cv: string;
    estimatedA1C: string;
    readingsPerDay: string;
  };
  riskAssessment: RiskAssessment;
  insights: string[];
}

/**
 * Hook to process and format AGP statistics
 */
export const useAGPStats = (statistics: AGPStatistics | null): FormattedStatistics | null => {
  return useMemo(() => {
    if (!statistics) return null;
    
    // Format all statistics for display
    const formatted = {
      timeInRange: {
        veryLow: formatPercentage(statistics.timeInRange.veryLow),
        low: formatPercentage(statistics.timeInRange.low),
        target: formatPercentage(statistics.timeInRange.target),
        high: formatPercentage(statistics.timeInRange.high),
        veryHigh: formatPercentage(statistics.timeInRange.veryHigh)
      },
      averageGlucose: formatGlucose(statistics.averageGlucose),
      gmi: `${statistics.gmi.toFixed(1)}%`,
      cv: `${statistics.cv.toFixed(1)}%`,
      estimatedA1C: `${statistics.estimatedA1C.toFixed(1)}%`,
      readingsPerDay: statistics.readingsPerDay.toFixed(1)
    };
    
    // Get risk assessment
    const riskAssessment = assessRisk(statistics);
    
    // Generate insights based on the data
    const insights = generateInsights(statistics, riskAssessment);
    
    return {
      ...statistics,
      formatted,
      riskAssessment,
      insights
    };
  }, [statistics]);
};

/**
 * Generate clinical insights from AGP statistics
 */
const generateInsights = (statistics: AGPStatistics, riskAssessment: RiskAssessment): string[] => {
  const insights: string[] = [];
  const { timeInRange, cv, averageGlucose } = statistics;

  // Time in Range insights
  if (timeInRange.target >= GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min) {
    insights.push('🎯 Excellent glucose control - time in range >70%');
  } else if (timeInRange.target >= GLUCOSE_THRESHOLDS.SEVERE_HYPO) {
    insights.push('👍 Good glucose control - room for improvement');
  } else {
    insights.push('⚠️ Time in range below target - discuss with healthcare provider');
  }

  // Hypoglycemia insights
  const lowTotal = timeInRange.veryLow + timeInRange.low;
  if (lowTotal < 4) {
    insights.push('✅ Low hypoglycemia risk');
  } else if (lowTotal < 10) {
    insights.push('⚠️ Moderate hypoglycemia risk - monitor patterns');
  } else {
    insights.push('🚨 High hypoglycemia risk - urgent review needed');
  }

  // Variability insights
  if (cv < 36) {
    insights.push('📊 Good glucose stability (CV <36%)');
  } else if (cv < 50) {
    insights.push('📊 Moderate glucose variability - consider patterns');
  } else {
    insights.push('📊 High glucose variability - review management plan');
  }
  
  // Hyperglycemia insights
  const highTotal = timeInRange.high + timeInRange.veryHigh;
  if (highTotal > 50) {
    insights.push('📈 High glucose levels frequent - review therapy');
  } else if (highTotal > 25) {
    insights.push('📈 Some high glucose episodes - optimize timing');
  }
  
  // GMI insights
  if (statistics.gmi < 7.0) {
    insights.push('🎯 GMI indicates good overall control');
  } else if (statistics.gmi < 8.0) {
    insights.push('⚠️ GMI suggests room for improvement');
  } else {
    insights.push('🚨 GMI indicates need for therapy optimization');
  }
  
  return insights;
};

/**
 * Hook to get key AGP metrics for quick display
 */
export const useKeyMetrics = (statistics: AGPStatistics | null) => {
  return useMemo(() => {
    if (!statistics) return null;
    
    return {
      timeInTarget: {
        value: statistics.timeInRange.target,
        formatted: formatPercentage(statistics.timeInRange.target),
        target: GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.middle,
        status: statistics.timeInRange.target >= GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.min ? 'good' :
                statistics.timeInRange.target >= GLUCOSE_THRESHOLDS.SEVERE_HYPO ? 'fair' : 'poor'
      },
      averageGlucose: {
        value: statistics.averageGlucose,
        formatted: formatGlucose(statistics.averageGlucose),
        target: { min: GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.min, max: GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.max },
        status: statistics.averageGlucose >= GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.max && statistics.averageGlucose <= GLUCOSE_THRESHOLDS.HYPER ? 'good' :
                statistics.averageGlucose < GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.middle || statistics.averageGlucose > GLUCOSE_THRESHOLDS.HYPER ? 'poor' : 'fair'
      },
      gmi: {
        value: statistics.gmi,
        formatted: `${statistics.gmi.toFixed(1)}%`,
        target: 7.0,
        status: statistics.gmi < 7.0 ? 'good' : 
                statistics.gmi < 8.0 ? 'fair' : 'poor'
      },
      variability: {
        value: statistics.cv,
        formatted: `${statistics.cv.toFixed(1)}%`,
        target: 36,
        status: statistics.cv < 36 ? 'good' : 
                statistics.cv < 50 ? 'fair' : 'poor'
      }
    };
  }, [statistics]);
};

/**
 * Hook to compare AGP statistics between periods
 */
export const useAGPComparison = (
  currentStats: AGPStatistics | null,
  previousStats: AGPStatistics | null
) => {
  return useMemo(() => {
    if (!currentStats || !previousStats) return null;
    
    const comparisons = {
      timeInTarget: {
        current: currentStats.timeInRange.target,
        previous: previousStats.timeInRange.target,
        change: currentStats.timeInRange.target - previousStats.timeInRange.target,
        percentChange: ((currentStats.timeInRange.target - previousStats.timeInRange.target) / previousStats.timeInRange.target) * 100
      },
      averageGlucose: {
        current: currentStats.averageGlucose,
        previous: previousStats.averageGlucose,
        change: currentStats.averageGlucose - previousStats.averageGlucose,
        percentChange: ((currentStats.averageGlucose - previousStats.averageGlucose) / previousStats.averageGlucose) * 100
      },
      gmi: {
        current: currentStats.gmi,
        previous: previousStats.gmi,
        change: currentStats.gmi - previousStats.gmi,
        percentChange: ((currentStats.gmi - previousStats.gmi) / previousStats.gmi) * 100
      },
      cv: {
        current: currentStats.cv,
        previous: previousStats.cv,
        change: currentStats.cv - previousStats.cv,
        percentChange: ((currentStats.cv - previousStats.cv) / previousStats.cv) * 100
      }
    };
    
    // Generate comparison insights
    const insights: string[] = [];
    
    if (Math.abs(comparisons.timeInTarget.change) > 5) {
      const direction = comparisons.timeInTarget.change > 0 ? 'improved' : 'decreased';
      insights.push(`Time in range ${direction} by ${Math.abs(comparisons.timeInTarget.change).toFixed(1)}%`);
    }
    
    if (Math.abs(comparisons.averageGlucose.change) > 10) {
      const direction = comparisons.averageGlucose.change > 0 ? 'increased' : 'decreased';
      insights.push(`Average glucose ${direction} by ${Math.abs(comparisons.averageGlucose.change).toFixed(0)} mg/dL`);
    }
    
    if (Math.abs(comparisons.cv.change) > 5) {
      const direction = comparisons.cv.change > 0 ? 'increased' : 'improved';
      insights.push(`Glucose variability ${direction} by ${Math.abs(comparisons.cv.change).toFixed(1)}%`);
    }
    
    return {
      comparisons,
      insights,
      overallTrend: determineOverallTrend(comparisons)
    };
  }, [currentStats, previousStats]);
};

/**
 * Determine overall trend from comparisons
 */
const determineOverallTrend = (comparisons: any): 'improving' | 'stable' | 'declining' => {
  let score = 0;
  
  // Time in target improvement is positive
  if (comparisons.timeInTarget.change > 5) score += 2;
  else if (comparisons.timeInTarget.change > 0) score += 1;
  else if (comparisons.timeInTarget.change < -5) score -= 2;
  else if (comparisons.timeInTarget.change < 0) score -= 1;
  
  // CV decrease is positive
  if (comparisons.cv.change < -5) score += 1;
  else if (comparisons.cv.change > 5) score -= 1;
  
  // GMI decrease is positive
  if (comparisons.gmi.change < -0.5) score += 1;
  else if (comparisons.gmi.change > 0.5) score -= 1;
  
  if (score > 1) return 'improving';
  if (score < -1) return 'declining';
  return 'stable';
};
