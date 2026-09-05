import type {
  TherapyContextSnapshot,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../domain';

/** Read-only source Seam. Product analytics cannot mutate Nightscout data. */
export interface TrendsDataSource {
  loadGlucoseSamples(
    period: TrendsPeriod,
  ): Promise<readonly TrendsGlucoseSample[]>;
}

/** Optional read-only source seam for quality-gated Therapy Context. */
export interface TherapyContextDataSource {
  loadTherapyContext(period: TrendsPeriod): Promise<TherapyContextSnapshot>;
}
