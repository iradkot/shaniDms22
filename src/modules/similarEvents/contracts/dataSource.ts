import type {TrendsGlucoseSample, TrendsPeriod} from '../../trends';

/**
 * Read-only glucose boundary for Similar Events. A source receives bounded
 * half-open periods and an abort signal; it cannot write to Nightscout.
 */
export interface SimilarEventsDataSource {
  readonly loadGlucoseSamples: (
    period: TrendsPeriod,
    signal: AbortSignal,
  ) => Promise<readonly TrendsGlucoseSample[]>;
}
