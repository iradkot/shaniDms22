import {BgSample} from 'app/types/day_bgs.types';
import {AGPPercentilePoint, AGPProcessingOptions} from '../types';

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_MIN_READINGS_PER_INTERVAL = 3;

export const timeToMinutes = (date: Date): number => {
  return date.getHours() * 60 + date.getMinutes();
};

export const minutesToTimeLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  if (mins === 0) return `${displayHours} ${period}`;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

export const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);

  if (Number.isInteger(index)) {
    return sorted[index];
  }

  const lower = sorted[Math.floor(index)];
  const upper = sorted[Math.ceil(index)];
  const weight = index - Math.floor(index);

  return lower + (upper - lower) * weight;
};

const groupByTimeOfDay = (
  bgSamples: BgSample[],
  intervalMinutes: number,
): Map<number, number[]> => {
  const timeGroups = new Map<number, number[]>();

  for (let minutes = 0; minutes < 1440; minutes += intervalMinutes) {
    timeGroups.set(minutes, []);
  }

  bgSamples.forEach(sample => {
    const timeOfDay = timeToMinutes(new Date(sample.date));
    const intervalStart = Math.floor(timeOfDay / intervalMinutes) * intervalMinutes;
    const arr = timeGroups.get(intervalStart);
    if (arr) arr.push(sample.sgv);
  });

  return timeGroups;
};

export const calculateAGPPercentiles = (
  bgSamples: BgSample[],
  options: AGPProcessingOptions = {},
): AGPPercentilePoint[] => {
  const intervalMinutes = options.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
  const minReadingsPerInterval =
    options.minReadingsPerInterval ?? DEFAULT_MIN_READINGS_PER_INTERVAL;

  const groups = groupByTimeOfDay(bgSamples, intervalMinutes);
  const points: AGPPercentilePoint[] = [];

  groups.forEach((values, timeOfDay) => {
    if (values.length >= minReadingsPerInterval) {
      points.push({
        timeOfDay,
        p5: calculatePercentile(values, 5),
        p25: calculatePercentile(values, 25),
        p50: calculatePercentile(values, 50),
        p75: calculatePercentile(values, 75),
        p95: calculatePercentile(values, 95),
        count: values.length,
      });
    }
  });

  return points.sort((a, b) => a.timeOfDay - b.timeOfDay);
};

export const smoothPercentiles = (
  percentiles: AGPPercentilePoint[],
  windowSize = 3,
): AGPPercentilePoint[] => {
  if (percentiles.length <= windowSize) return percentiles;

  const smoothed: AGPPercentilePoint[] = [];
  const half = Math.floor(windowSize / 2);

  percentiles.forEach((point, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(percentiles.length - 1, index + half);
    const window = percentiles.slice(start, end + 1);

    smoothed.push({
      timeOfDay: point.timeOfDay,
      p5: window.reduce((sum, p) => sum + p.p5, 0) / window.length,
      p25: window.reduce((sum, p) => sum + p.p25, 0) / window.length,
      p50: window.reduce((sum, p) => sum + p.p50, 0) / window.length,
      p75: window.reduce((sum, p) => sum + p.p75, 0) / window.length,
      p95: window.reduce((sum, p) => sum + p.p95, 0) / window.length,
      count: point.count,
    });
  });

  return smoothed;
};

export const interpolateMissingIntervals = (
  percentiles: AGPPercentilePoint[],
  intervalMinutes: number,
): AGPPercentilePoint[] => {
  if (percentiles.length < 2) return percentiles;

  const complete: AGPPercentilePoint[] = [];

  for (let minutes = 0; minutes < 1440; minutes += intervalMinutes) {
    const existing = percentiles.find(p => p.timeOfDay === minutes);
    if (existing) {
      complete.push(existing);
      continue;
    }

    const before = percentiles.filter(p => p.timeOfDay < minutes).pop();
    const after = percentiles.find(p => p.timeOfDay > minutes);

    if (!before || !after) continue;

    const ratio = (minutes - before.timeOfDay) / (after.timeOfDay - before.timeOfDay);

    complete.push({
      timeOfDay: minutes,
      p5: before.p5 + (after.p5 - before.p5) * ratio,
      p25: before.p25 + (after.p25 - before.p25) * ratio,
      p50: before.p50 + (after.p50 - before.p50) * ratio,
      p75: before.p75 + (after.p75 - before.p75) * ratio,
      p95: before.p95 + (after.p95 - before.p95) * ratio,
      count: 0,
    });
  }

  return complete;
};

export const validateGlucoseValues = (bgSamples: BgSample[]): BgSample[] => {
  return bgSamples.filter(
    sample =>
      sample.sgv > 20 && sample.sgv < 600 && !Number.isNaN(sample.sgv) && sample.date > 0,
  );
};

export const getDateRange = (bgSamples: BgSample[]) => {
  if (bgSamples.length === 0) {
    const now = new Date();
    return {start: now, end: now, days: 0};
  }

  const timestamps = bgSamples.map(sample => sample.date).sort((a, b) => a - b);
  const start = new Date(timestamps[0]);
  const end = new Date(timestamps[timestamps.length - 1]);

  const uniqueDays = new Set(
    bgSamples.map(s => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  return {start, end, days: uniqueDays.size};
};
