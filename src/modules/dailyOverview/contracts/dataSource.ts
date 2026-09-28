import type {TrendsGlucoseSample, TrendsPeriod} from '../../trends';

export type DailyOverviewPeriod = TrendsPeriod;

export type DailyInsulinSourceSummary =
  | {
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
      readonly basalEstimated?: boolean;
    }
  | {readonly quality: 'unavailable'};

export interface DailyOverviewSourceSnapshot {
  readonly glucoseSamples: readonly TrendsGlucoseSample[];
  /** Missing insulin is explicit. Consumers must never treat it as zero. */
  readonly insulinSummary: DailyInsulinSourceSummary;
}

export interface DailyInsulinComparisonTotals {
  readonly basalUnits: number;
  readonly bolusUnits: number;
  readonly totalUnits: number;
  readonly basalEstimated?: boolean;
}

export interface DailyInsulinComparisonPresentation {
  readonly status: 'loading' | 'available' | 'unavailable';
  readonly yesterday?: DailyInsulinComparisonTotals;
  readonly weekAverage?: DailyInsulinComparisonTotals;
  readonly weekDays: number;
  readonly cutoffTimestampMs: number;
  readonly isPartialDay: boolean;
}

export interface DailyInsulinComparisonRequest {
  readonly period: DailyOverviewPeriod;
  /** One clock reading shared by the current summary and historical comparisons. */
  readonly asOfMs: number;
}

/** Read-only seam. The Daily Overview cannot mutate its backing source. */
export interface DailyOverviewDataSource {
  loadDailyOverview(
    period: DailyOverviewPeriod,
    options?: {readonly asOfMs: number},
  ): Promise<DailyOverviewSourceSnapshot>;
  loadDailyInsulinComparison?(
    request: DailyInsulinComparisonRequest,
  ): Promise<DailyInsulinComparisonPresentation>;
}
