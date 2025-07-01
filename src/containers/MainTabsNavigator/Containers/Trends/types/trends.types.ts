// Types for Trends functionality

export type MetricType = 'tir' | 'hypos' | 'hypers';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ComparisonState {
  showComparison: boolean;
  comparing: boolean;
  comparisonOffset: number;
  comparisonDateRange: DateRange | null;
}

export interface TrendsState {
  rangeDays: number;
  selectedMetric: MetricType;
  comparison: ComparisonState;
}
