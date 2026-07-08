export type LoopMode = 'open' | 'closed' | 'unknown';
export type BasalMode = 'temp' | 'suspended' | 'planned' | 'other' | 'unknown';

export type LoopModeEvent = {
  timestamp: number;
  mode: LoopMode;
  basalMode?: BasalMode;
  basalDurationMinutes?: number | null;
  modeDurationMinutes?: number | null;
};

export const LOOP_STATUS_CARRY_FORWARD_MINUTES = 20;
export const LOOP_CONTEXT_LOOKBACK_MINUTES = 180;
export const LOOP_TREATMENT_LOOKBACK_MINUTES = 180;
export const LOOP_DATA_FETCH_CHUNK_DAYS = 7;
export const MIN_LOOP_KNOWN_COVERAGE_PCT = 70;
export const MIN_BG_SAMPLES_PER_LOOP_MODE = 3;

export type LoopHourlyModeProfile = {
  hour: number;
  openMinutes: number;
  closedMinutes: number;
  unknownMinutes: number;
  totalMinutes: number;
  openPct: number;
  closedPct: number;
  unknownPct: number;
  dominantMode: LoopMode;
};

export interface LoopModeStats {
  openMinutes: number;
  closedMinutes: number;
  unknownMinutes: number;
  openPct: number;
  closedPct: number;
  openAvgBg: number | null;
  closedAvgBg: number | null;
  openTirPct: number | null;
  closedTirPct: number | null;
  tempBasalMinutes: number;
  suspendedMinutes: number;
  plannedBasalMinutes: number;
  unknownBasalMinutes: number;
  tempBasalPct: number;
  suspendedPct: number;
  plannedBasalPct: number;
  unknownBasalPct: number;
  knownMinutes: number;
  knownCoveragePct: number;
  unknownPct: number;
  hasEnoughLoopCoverage: boolean;
  openMetricsReliable: boolean;
  closedMetricsReliable: boolean;
  canCompareOpenClosed: boolean;
  hourlyModeProfile: LoopHourlyModeProfile[];
  diagnostics: {
    eventsFetched: number;
    eventsClassified: number;
    openSamples: number;
    closedSamples: number;
    basalEvents: number;
  };
}

export type LoopDataFetchRange = {
  start: Date;
  end: Date;
};
