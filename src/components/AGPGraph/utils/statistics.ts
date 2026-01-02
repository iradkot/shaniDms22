import {BgSample} from 'app/types/day_bgs.types';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {AGPStatistics, AGPTimeInRange} from '../types';

const VERY_LOW_MAX = cgmRange[CGM_STATUS_CODES.VERY_LOW] as number;
const LOW_MAX = cgmRange.TARGET.min;
const TARGET_MAX = cgmRange.TARGET.max;
const HIGH_MAX = cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number;

export const calculateTimeInRange = (bgSamples: BgSample[]): AGPTimeInRange => {
  if (bgSamples.length === 0) {
    return {veryLow: 0, low: 0, target: 0, high: 0, veryHigh: 0};
  }

  let veryLow = 0;
  let low = 0;
  let target = 0;
  let high = 0;
  let veryHigh = 0;

  bgSamples.forEach(sample => {
    const sgv = sample.sgv;

    if (sgv <= VERY_LOW_MAX) {
      veryLow++;
    } else if (sgv <= LOW_MAX) {
      low++;
    } else if (sgv <= TARGET_MAX) {
      target++;
    } else if (sgv <= HIGH_MAX) {
      high++;
    } else {
      veryHigh++;
    }
  });

  const total = bgSamples.length;

  return {
    veryLow: (veryLow / total) * 100,
    low: (low / total) * 100,
    target: (target / total) * 100,
    high: (high / total) * 100,
    veryHigh: (veryHigh / total) * 100,
  };
};

export const calculateAverageGlucose = (bgSamples: BgSample[]): number => {
  if (bgSamples.length === 0) return 0;
  return bgSamples.reduce((sum, sample) => sum + sample.sgv, 0) / bgSamples.length;
};

export const calculateGMI = (averageGlucose: number): number => {
  return 3.31 + 0.02392 * averageGlucose;
};

export const calculateCV = (bgSamples: BgSample[]): number => {
  if (bgSamples.length < 2) return 0;

  const mean = calculateAverageGlucose(bgSamples);
  if (mean === 0) return 0;

  const values = bgSamples.map(sample => sample.sgv);
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);

  const stdDev = Math.sqrt(variance);
  return (stdDev / mean) * 100;
};

export const estimateA1C = (averageGlucose: number): number => {
  return (averageGlucose + 46.7) / 28.7;
};

export const countDaysWithData = (bgSamples: BgSample[]): number => {
  const uniqueDays = new Set<string>();

  bgSamples.forEach(sample => {
    const date = new Date(sample.date);
    uniqueDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
  });

  return uniqueDays.size;
};

export const calculateAGPStatistics = (bgSamples: BgSample[]): AGPStatistics => {
  const validSamples = bgSamples.filter(s => s.sgv > 20 && s.sgv < 600 && !Number.isNaN(s.sgv));

  const totalReadings = validSamples.length;
  if (totalReadings === 0) {
    return {
      timeInRange: {veryLow: 0, low: 0, target: 0, high: 0, veryHigh: 0},
      averageGlucose: 0,
      gmi: 0,
      cv: 0,
      totalReadings: 0,
      daysWithData: 0,
      readingsPerDay: 0,
      estimatedA1C: 0,
    };
  }

  const timeInRange = calculateTimeInRange(validSamples);
  const avg = calculateAverageGlucose(validSamples);
  const gmi = calculateGMI(avg);
  const cv = calculateCV(validSamples);
  const daysWithData = countDaysWithData(validSamples);
  const readingsPerDay = daysWithData > 0 ? totalReadings / daysWithData : 0;
  const estimatedA1C = estimateA1C(avg);

  return {
    timeInRange,
    averageGlucose: Math.round(avg),
    gmi: Math.round(gmi * 10) / 10,
    cv: Math.round(cv * 10) / 10,
    totalReadings,
    daysWithData,
    readingsPerDay: Math.round(readingsPerDay * 10) / 10,
    estimatedA1C: Math.round(estimatedA1C * 10) / 10,
  };
};

export const formatPercentage = (value: number, decimals = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

export const formatGlucose = (value: number): string => {
  return `${Math.round(value)} mg/dL`;
};
