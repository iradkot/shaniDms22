// Hook for AGP Data Processing

import { useMemo } from 'react';
import { BgSample } from 'app/types/day_bgs.types';
import { AGPData, AGPProcessingOptions } from '../types/agp.types';
import { 
  calculateAGPPercentiles, 
  smoothPercentiles,
  interpolateMissingIntervals,
  validateGlucoseValues,
  getDateRange
} from '../utils/percentile.utils';
import { calculateAGPStatistics } from '../utils/statistics.utils';
import { validateBgSamples } from '../utils/validation.utils';
import { AGP_DEFAULT_CONFIG } from '../utils/constants';

/**
 * Hook to process BG samples into AGP data
 */
export const useAGPData = (
  bgSamples: BgSample[],
  options: AGPProcessingOptions = {}
): {
  agpData: AGPData | null;
  isLoading: boolean;
  error: string | null;
  warnings: string[];
  dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
} => {
  const processedData = useMemo(() => {
    // Validate input data
    const validation = validateBgSamples(bgSamples);
    
    if (!validation.isValid) {
      return {
        agpData: null,
        isLoading: false,
        error: validation.errors.join(', '),
        warnings: validation.warnings,
        dataQuality: validation.dataQuality
      };
    }
    
    try {
      // Clean and validate glucose values
      const validSamples = validateGlucoseValues(bgSamples);
      
      if (validSamples.length === 0) {
        return {
          agpData: null,
          isLoading: false,
          error: 'No valid glucose readings found',
          warnings: validation.warnings,
          dataQuality: 'poor' as const
        };
      }
      
      // Get processing options with defaults
      const processingOptions = {
        ...AGP_DEFAULT_CONFIG,
        ...options
      };
      
      // Calculate percentiles
      let percentiles = calculateAGPPercentiles(validSamples, processingOptions);
      
      // Apply smoothing if enabled
      if (processingOptions.smoothing && percentiles.length > 5) {
        percentiles = smoothPercentiles(percentiles);
      }
      
      // Interpolate missing intervals for smoother visualization
      percentiles = interpolateMissingIntervals(percentiles, processingOptions.intervalMinutes);
      
      // Calculate statistics
      const statistics = calculateAGPStatistics(validSamples);
      
      // Get date range
      const dateRange = getDateRange(validSamples);
      
      const agpData: AGPData = {
        percentiles,
        statistics,
        rawData: validSamples,
        dateRange
      };
      
      return {
        agpData,
        isLoading: false,
        error: null,
        warnings: validation.warnings,
        dataQuality: validation.dataQuality
      };
      
    } catch (error) {
      return {
        agpData: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error processing AGP data',
        warnings: validation.warnings,
        dataQuality: 'poor' as const
      };
    }
  }, [bgSamples, options]);
  
  return processedData;
};

/**
 * Hook to get AGP data with caching for performance
 */
export const useAGPDataCached = (
  bgSamples: BgSample[],
  options: AGPProcessingOptions = {}
) => {
  // Create cache key from samples and options
  const cacheKey = useMemo(() => {
    const sampleHash = bgSamples.length > 0 
      ? `${bgSamples.length}-${bgSamples[0]?.date}-${bgSamples[bgSamples.length - 1]?.date}`
      : 'empty';
    const optionsHash = JSON.stringify(options);
    return `${sampleHash}-${optionsHash}`;
  }, [bgSamples, options]);
  
  return useAGPData(bgSamples, options);
};
