// AGP Graph Exports

export { default } from './AGPGraph';
export { default as AGPGraph } from './AGPGraph';
export { default as EnhancedAGPGraph } from './EnhancedAGPGraph';

// Components
export { default as AGPChart } from './components/AGPChart';
export { default as AGPStatistics } from './components/AGPStatistics';
export { default as AGPLegend } from './components/AGPLegend';

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
  calculateAGPStatistics,
  validateGlucoseValues
} from './utils/percentile.utils';
export { 
  calculateTimeInRange,
  calculateAverageGlucose,
  calculateGMI,
  calculateCV
} from './utils/statistics.utils';
export { validateBgSamples } from './utils/validation.utils';

// Constants
export {
  AGP_GLUCOSE_RANGES,
  AGP_PERCENTILE_COLORS,
  AGP_DEFAULT_CONFIG
} from './utils/constants';