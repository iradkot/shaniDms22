// Main exports for Trends functionality

export { default } from './Trends';

// Export components for potential reuse
export { default as TrendsMainContent } from './components/TrendsMainContent';
export { default as MetricSelector } from './components/MetricSelector';
export { DataFetchStatus } from './components/DataFetchStatus';
export { DateRangeSelector } from './components/DateRangeSelector';
export { CompareSection } from './components/CompareSection';

// Export hooks for external use
export { useTrendsData } from './hooks/useTrendsData';
export { useComparison } from './hooks/useComparison';
export { useBestWorstDays } from './hooks/useBestWorstDays';

// Export utilities
export { calculateTrendsMetrics } from './utils/trendsCalculations';
export { rankDaysByMetric, getBestWorstDayStrings } from './utils/dayRanking.utils';

// Export types
export type { 
  MetricType, 
  DateRange, 
  ComparisonState, 
  TrendsState 
} from './types/trends.types';
export type { DayDetail } from './utils/trendsCalculations';
