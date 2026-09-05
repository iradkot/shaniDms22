import type {TrendsGlucoseSample, TrendsPeriod} from '../../trends';

export type PreviousDaySummaryPeriod = TrendsPeriod;

export type PreviousDaySummaryInsulinSource =
  | {
      /** The source explicitly guarantees complete totals for the requested period. */
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
    }
  | {readonly quality: 'unavailable'};

export type PreviousDaySummaryEventKind =
  | 'meal'
  | 'activity'
  | 'alert'
  | 'treatment'
  | 'other';

/**
 * A display-safe event reference. Medical payloads stay behind the source
 * seam; a product host can use the stable kind/id pair for contextual routing.
 */
export interface PreviousDaySummaryEvent {
  readonly id: string;
  readonly kind: PreviousDaySummaryEventKind;
  readonly timestampMs: number;
  readonly title: string;
  readonly detail?: string;
}

export interface PreviousDaySummarySourceSnapshot {
  readonly glucoseSamples: readonly TrendsGlucoseSample[];
  /** Missing or uncertain insulin totals must be reported as unavailable. */
  readonly insulinSummary: PreviousDaySummaryInsulinSource;
  readonly events: readonly PreviousDaySummaryEvent[];
}

/** Read-only source seam. This module cannot mutate Nightscout or the Journal. */
export interface PreviousDaySummaryDataSource {
  loadPreviousDaySummary(
    period: PreviousDaySummaryPeriod,
  ): Promise<PreviousDaySummarySourceSnapshot>;
}
