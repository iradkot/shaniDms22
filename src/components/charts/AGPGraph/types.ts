import {BgSample} from 'app/types/day_bgs.types';

export type TimeOfDayMinutes = number; // 0..1440

export interface AGPPercentilePoint {
  timeOfDay: TimeOfDayMinutes;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  /** raw count for this interval; 0 when interpolated */
  count: number;
}

export interface AGPTimeInRange {
  veryLow: number;
  low: number;
  target: number;
  high: number;
  veryHigh: number;
}

export interface AGPStatistics {
  timeInRange: AGPTimeInRange;
  averageGlucose: number;
  gmi: number;
  cv: number;
  totalReadings: number;
  daysWithData: number;
  readingsPerDay: number;
  estimatedA1C: number;
}

export interface AGPDateRange {
  start: Date;
  end: Date;
  days: number;
}

export interface AGPData {
  percentiles: AGPPercentilePoint[];
  statistics: AGPStatistics;
  rawData: BgSample[];
  dateRange: AGPDateRange;
}

export interface AGPProcessingOptions {
  intervalMinutes?: number;
  minReadingsPerInterval?: number;
  smoothing?: boolean;
}
