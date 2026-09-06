export interface DayGraphRecordIdentity {
  /** Stable, non-secret source namespace. It must not contain a URL or token. */
  readonly sourceId: string;
  /** The stable record ID assigned by that source. */
  readonly recordId: string;
}

export interface DayGraphPeriod {
  /** Inclusive local-day boundary. */
  readonly dayStartMs: number;
  /** Exclusive next-local-day boundary. This can differ from 24 hours at DST. */
  readonly dayEndMs: number;
}

export interface DayGraphGlucoseSample {
  readonly identity: DayGraphRecordIdentity;
  readonly timestampMs: number;
  readonly valueMgDl: number;
  /** Optional Nightscout display facts retained for the rich chart adapter. */
  readonly direction?: string;
  readonly device?: string;
  /** Signed IOB is valid when basal delivery is below the scheduled profile. */
  readonly iobUnits?: number;
  readonly bolusIobUnits?: number;
  readonly basalIobUnits?: number;
  readonly cobGrams?: number;
}

/** A time-aligned Loop/OpenAPS load reading before it is matched to CGM. */
export interface DayGraphActiveLoadSample {
  readonly timestampMs: number;
  readonly iobUnits?: number;
  readonly bolusIobUnits?: number;
  readonly basalIobUnits?: number;
  readonly cobGrams?: number;
}

export type DayGraphSourceAvailability = 'available' | 'stale' | 'unavailable';

/** Source read outcomes are distinct from successfully loaded empty history. */
export interface DayGraphDataAvailability {
  readonly treatments: DayGraphSourceAvailability;
  readonly deviceStatus: DayGraphSourceAvailability;
  readonly profile: DayGraphSourceAvailability;
}

export type DayGraphInsulinEvent =
  | {
      readonly kind: 'bolus';
      readonly timestampMs: number;
      readonly units: number;
    }
  | {
      readonly kind: 'temp-basal';
      readonly startMs: number;
      readonly endMs: number;
      readonly rateUnitsPerHour: number;
    }
  | {
      readonly kind: 'suspend';
      readonly startMs: number;
      readonly endMs?: number;
    };

export interface DayGraphBasalScheduleEntry {
  readonly secondsFromMidnight: number;
  readonly rateUnitsPerHour: number;
}

interface DayGraphTimelineItemBase {
  readonly identity: DayGraphRecordIdentity;
  readonly sourceLabel: string;
  readonly timestampMs: number;
  readonly title: string;
  readonly detail?: string;
}

export interface DayGraphTreatmentItem extends DayGraphTimelineItemBase {
  readonly kind: 'treatment';
}

export interface DayGraphExternalCarbItem extends DayGraphTimelineItemBase {
  readonly kind: 'external-carb';
  readonly carbohydratesGrams?: number;
}

export interface DayGraphJournalMealItem extends DayGraphTimelineItemBase {
  readonly kind: 'journal-meal';
  readonly carbohydratesGrams?: number;
}

export interface DayGraphJournalActivityItem extends DayGraphTimelineItemBase {
  readonly kind: 'journal-activity';
  readonly endTimestampMs?: number;
}

export type DayGraphTimelineItem =
  | DayGraphTreatmentItem
  | DayGraphExternalCarbItem
  | DayGraphJournalMealItem
  | DayGraphJournalActivityItem;

export type DayGraphFreshness =
  | {readonly kind: 'fresh'; readonly fetchedAtMs: number}
  | {
      readonly kind: 'stale';
      readonly fetchedAtMs: number;
      /** Optional safe display text supplied by the platform adapter. */
      readonly reason?: string;
    };

export interface DayGraphSnapshot {
  readonly glucoseSamples: readonly DayGraphGlucoseSample[];
  readonly timelineItems: readonly DayGraphTimelineItem[];
  /** Optional facts enrich the chart but never gate glucose or timeline data. */
  readonly activeLoadSamples?: readonly DayGraphActiveLoadSample[];
  readonly insulinEvents?: readonly DayGraphInsulinEvent[];
  readonly basalSchedule?: readonly DayGraphBasalScheduleEntry[];
  readonly dataAvailability?: DayGraphDataAvailability;
  readonly freshness: DayGraphFreshness;
}

/** Read-only host boundary. Implementations may combine Nightscout and Journal data. */
export interface DayGraphDataSource {
  readonly loadDayGraph: (
    period: DayGraphPeriod,
    options?: {readonly forceRefresh?: boolean},
  ) => Promise<DayGraphSnapshot>;
}
