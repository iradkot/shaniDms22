import type {
  TherapyContextSnapshot,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../domain';

export type TrendsGlucoseFreshness =
  | {readonly kind: 'fresh' | 'stale'; readonly fetchedAtMs: number}
  | {readonly kind: 'unknown'};

export interface TrendsGlucoseSnapshot {
  readonly samples: readonly TrendsGlucoseSample[];
  /** Transport fetch time, never the screen refresh time or last CGM reading. */
  readonly freshness: TrendsGlucoseFreshness;
}

/** Read-only source Seam. Product analytics cannot mutate Nightscout data. */
export interface TrendsDataSource {
  loadGlucoseSamples(
    period: TrendsPeriod,
  ): Promise<readonly TrendsGlucoseSample[]>;
  /** Prefer this when presenting source freshness; array-only adapters prove no freshness. */
  loadGlucoseSnapshot?(period: TrendsPeriod): Promise<TrendsGlucoseSnapshot>;
}

/** Optional read-only source seam for quality-gated Therapy Context. */
export interface TherapyContextDataSource {
  loadTherapyContext(period: TrendsPeriod): Promise<TherapyContextSnapshot>;
}
