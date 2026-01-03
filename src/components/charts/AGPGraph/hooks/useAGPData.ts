import {useMemo} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {AGPData, AGPProcessingOptions} from '../types';
import {
  calculateAGPPercentiles,
  smoothPercentiles,
  interpolateMissingIntervals,
  validateGlucoseValues,
  getDateRange,
} from '../utils/percentiles';
import {calculateAGPStatistics} from '../utils/statistics';

const DEFAULT_INTERVAL_MINUTES = 5;

const validateInput = (bgSamples: BgSample[]) => {
  const errors: string[] = [];

  if (!Array.isArray(bgSamples)) {
    errors.push('Invalid glucose samples');
  } else if (bgSamples.length === 0) {
    errors.push('No glucose samples');
  }

  return {isValid: errors.length === 0, errors};
};

export const useAGPData = (
  bgSamples: BgSample[],
  options: AGPProcessingOptions = {},
): {
  agpData: AGPData | null;
  isLoading: boolean;
  error: string | null;
} => {
  return useMemo(() => {
    const validation = validateInput(bgSamples);

    if (!validation.isValid) {
      return {
        agpData: null,
        isLoading: false,
        error: validation.errors.join(', '),
      };
    }

    try {
      const validSamples = validateGlucoseValues(bgSamples);
      if (validSamples.length === 0) {
        return {agpData: null, isLoading: false, error: 'No valid glucose readings'};
      }

      const intervalMinutes = options.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
      const smoothing = options.smoothing ?? true;

      let percentiles = calculateAGPPercentiles(validSamples, options);
      if (smoothing && percentiles.length > 5) {
        percentiles = smoothPercentiles(percentiles);
      }

      percentiles = interpolateMissingIntervals(percentiles, intervalMinutes);

      const statistics = calculateAGPStatistics(validSamples);
      const dateRange = getDateRange(validSamples);

      const agpData: AGPData = {
        percentiles,
        statistics,
        rawData: validSamples,
        dateRange,
      };

      return {agpData, isLoading: false, error: null};
    } catch (e) {
      return {
        agpData: null,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to process AGP data',
      };
    }
  }, [bgSamples, options]);
};
