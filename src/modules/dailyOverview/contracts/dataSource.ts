import type {
  TrendsGlucoseFreshness,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../../trends';

export type DailyOverviewPeriod = TrendsPeriod;

export interface DailyInsulinEstimate {
  /** Profile-based estimate, separate from the recorded basal subtotal. */
  readonly estimatedBasalUnits?: number;
  readonly estimatedTotalUnits?: number;
}

export type DailyInsulinSourceSummary = DailyInsulinEstimate &
  (
    | {
        readonly quality: 'available';
        readonly basalUnits: number;
        readonly bolusUnits: number;
        readonly basalEstimated?: boolean;
        readonly basalEvidence?: 'recorded';
        readonly basalCoveredMs?: number;
        readonly basalCoveragePercent?: number;
      }
    | {
        readonly quality: 'partial';
        /** Recorded subtotal only; gaps are unknown, never filled from a profile. */
        readonly basalUnits?: number;
        readonly bolusUnits?: number;
        readonly basalEvidence?: 'recorded';
        readonly basalCoveredMs: number;
        readonly basalCoveragePercent: number;
      }
    | {readonly quality: 'unavailable'}
  );

export interface DailyOverviewSourceSnapshot {
  readonly glucoseSamples: readonly TrendsGlucoseSample[];
  readonly glucoseFreshness?: TrendsGlucoseFreshness;
  /** Missing insulin is explicit. Consumers must never treat it as zero. */
  readonly insulinSummary: DailyInsulinSourceSummary;
}

export interface DailyInsulinComparisonTotals extends DailyInsulinEstimate {
  readonly quality: 'available' | 'partial';
  readonly basalUnits?: number;
  readonly bolusUnits?: number;
  readonly totalUnits?: number;
  readonly basalEstimated?: boolean;
  readonly basalCoveragePercent?: number;
  readonly basalCoveredMs?: number;
  readonly basalEvidence?: 'recorded';
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
