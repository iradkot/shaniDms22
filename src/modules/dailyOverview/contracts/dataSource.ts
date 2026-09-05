import type {TrendsGlucoseSample, TrendsPeriod} from '../../trends';

export type DailyOverviewPeriod = TrendsPeriod;

export type DailyInsulinSourceSummary =
  | {
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
    }
  | {readonly quality: 'unavailable'};

export interface DailyOverviewSourceSnapshot {
  readonly glucoseSamples: readonly TrendsGlucoseSample[];
  /** Missing insulin is explicit. Consumers must never treat it as zero. */
  readonly insulinSummary: DailyInsulinSourceSummary;
}

/** Read-only seam. The Daily Overview cannot mutate its backing source. */
export interface DailyOverviewDataSource {
  loadDailyOverview(
    period: DailyOverviewPeriod,
  ): Promise<DailyOverviewSourceSnapshot>;
}
