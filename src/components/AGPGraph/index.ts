// AGP Graph Exports

export { default } from './AGPGraph';
export { default as AGPGraph } from './AGPGraph';
export { default as AGPSummary } from './components/AGPSummary';

// Components
export { default as AGPChart } from './components/AGPChart';
export { default as AGPStatistics } from './components/AGPStatistics';
export { default as AGPLegend } from './components/AGPLegend';
export { default as AGPKeyMetrics } from './components/AGPKeyMetrics';
export { default as AGPInsights } from './components/AGPInsights';

// Hooks
export { useAGPData } from './hooks/useAGPData';
export { useChartConfig } from './hooks/useChartConfig';
export { useAGPStats } from './hooks/useAGPStats';

// Types
export type {
  AGPData,
  AGPStatistics as AGPStatisticsType,
  AGPGraphProps,
  AGPPercentilePoint,
  AGPRanges,
  AGPChartConfig
} from './types/agp.types';

// Utils
export {
  calculateAGPPercentiles,
  validateGlucoseValues
} from './utils/percentile.utils';
export { 
  calculateTimeInRange,
  calculateAverageGlucose,
  calculateGMI,
  calculateCV
} from './utils/statistics.utils';
// Validation utilities now come from shared components
export { validateBgSamples } from 'app/components/shared/GlucoseChart';

// Constants
export {
  AGP_GLUCOSE_RANGES,
  AGP_PERCENTILE_COLORS,
  AGP_DEFAULT_CONFIG
} from './utils/constants';