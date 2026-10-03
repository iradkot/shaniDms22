import type {BgSample} from '../../types/day_bgs.types';

export interface CurrentObservation {
  readonly status: 'fresh' | 'stale' | 'unavailable';
  /** A stale value is retained for an explicitly stale display, never current advice. */
  readonly value: number | null;
  readonly sourceTimestampMs: number | null;
  readonly fetchedAtMs: number | null;
  readonly ageMs: number | null;
  readonly reason: string | null;
}

/** The result of reading a bounded latest endpoint; it makes no history-coverage claim. */
export interface CurrentReadResult {
  readonly records: readonly unknown[];
  readonly freshness: {
    readonly kind: 'fresh' | 'stale';
    readonly fetchedAtMs: number;
  };
}

export interface CurrentDataSnapshot {
  readonly observedAtMs: number;
  readonly glucose: CurrentObservation;
  readonly iob: CurrentObservation;
  readonly cob: CurrentObservation;
  readonly glucoseReading: BgSample | null;
  /** Selected independently for an existing Loop prediction; not the IOB/COB clock. */
  readonly deviceStatus: Record<string, unknown> | null;
}

export interface CurrentDataSource {
  loadCurrent(input?: {
    readonly signal?: AbortSignal;
    readonly forceRefresh?: boolean;
  }): Promise<CurrentDataSnapshot>;
}

export interface CurrentDataSourceDependencies {
  readonly readGlucose: () => Promise<CurrentReadResult>;
  readonly readDeviceStatus: () => Promise<CurrentReadResult>;
  /** Must include a monotonic configuration revision, including an A -> B -> A switch. */
  readonly getScopeKey: () => string;
  readonly now?: () => number;
}
