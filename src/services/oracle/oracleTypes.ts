import {BgSample} from 'app/types/day_bgs.types';

export type OracleCachedBgEntry = Pick<BgSample, 'date' | 'sgv'>;

export type OracleCachedTreatment = {
  /** Timestamp (ms) of the treatment event. */
  ts: number;
  eventType?: string;
  insulin?: number;
  carbs?: number;
};

export type OracleCachedDeviceStatus = {
  /** Timestamp (ms) of the computed load values. */
  ts: number;
  iob?: number;
  iobBolus?: number;
  iobBasal?: number;
  cob?: number;
};

export type OracleCacheMeta = {
  version: 2;
  /** Timestamp (ms) the cache was last synced up to. */
  lastSyncedMs: number;
};

export type OracleSeriesPoint = {
  /** Minutes relative to "now" (0 = now). */
  tMin: number;
  sgv: number;
};

export type OracleEventKind = 'rising' | 'falling' | 'stable';

export type OracleInvestigateEvent = {
  /** Timestamp (ms) of the event anchor. */
  date: number;
  sgv: number;
  /** Slope at t=0 (mg/dL/min), computed over a ~15m window. */
  slope: number;
  kind: OracleEventKind;
  /** Best-effort IOB at this timestamp (units). */
  iob?: number | null;
  /** Best-effort COB at this timestamp (grams). */
  cob?: number | null;
};

export type OracleMatchTrace = {
  /** Timestamp (ms) of the matching "t=0" point in history. */
  anchorTs: number;
  /** BG value at the anchor point (best-effort). */
  anchorSgv: number;
  /** Resampled points across [-120..+240] minutes. */
  points: OracleSeriesPoint[];
  /** Slope at t=0 (mg/dL/min), computed over a ~15m window. */
  slope: number;
  /** Best-effort IOB at the matching anchor time (units). */
  iob?: number | null;
  /** Best-effort COB at the matching anchor time (grams). */
  cob?: number | null;

  /**
   * Optional load series around the match anchor.
   *
   * Intended for UI charts like Active insulin / COB in the match details view.
   * Values are best-effort and may be sparse depending on device-status availability.
   */
  loadPoints?: Array<{
    tMin: number;
    iob?: number | null;
    iobBolus?: number | null;
    iobBasal?: number | null;
    cob?: number | null;
  }>;
  /**
   * Raw treatment events observed shortly after the historical anchor.
   *
   * This is intended for future "open match" details views where we want
   * to render insulin/carbs amounts on top of a richer graph (e.g. `CgmGraph`).
   *
   * Today we still summarize these into `actions30m` / `actionCounts30m` and
   * `actionMarkers` for the ghost graph.
   */
  treatments30m?: OracleCachedTreatment[];
  /** Treatment summary in first 30 minutes. */
  actions30m?: {
    insulin: number;
    carbs: number;
  };
  /** Counts of treatment events in first 30 minutes. */
  actionCounts30m?: {
    boluses: number;
    carbs: number;
  };
  /** Time-in-range for 0..2h (0..1). */
  tir2h?: number | null;
  /** Treatment markers to render on the chart. */
  actionMarkers?: Array<{tMin: number; kind: 'insulin' | 'carbs'}>;
};

export type OracleStrategyCard = {
  key: string;
  title: string;
  /** Human readable action summary. */
  actionSummary: string;
  count: number;
  /** Average BG at +2h across this cluster (mg/dL). */
  avgBg2h: number | null;
  /** Success rate at +2h within target range (0..1). */
  successRate: number | null;
  isBest?: boolean;
};

export type OracleInsights = {
  matchCount: number;
  matches: OracleMatchTrace[];
  /** Best-effort IOB at the investigated anchor time (units). */
  anchorIob: number | null;
  /** Best-effort COB at the investigated anchor time (grams). */
  anchorCob: number | null;
  /** Whether IOB/COB matching was enabled for this computation. */
  usedLoadInMatching: boolean;
  /** Current series for the user's own recent BG (t<=0). */
  currentSeries: OracleSeriesPoint[];
  /** Median trajectory for future window (0..+240). */
  medianSeries: OracleSeriesPoint[];
  /** Strategy cards summarizing what worked historically. */
  strategies: OracleStrategyCard[];
  /** Safety disclaimer shown in UI. */
  disclaimerText: string;
};
