import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {fetchBgDataForDateRange} from 'app/api/apiRequests';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {BgSample} from 'app/types/day_bgs.types';
import {TrendDirectionString} from 'app/types/notifications';

import {loadOracleCache, OracleCacheSyncProgress, syncOracleCache} from 'app/services/oracle/oracleCache';
import {
  computeOracleInsights,
  computeOracleInsightsProgressive,
  OracleComputeProgress,
  findLoadAtTs,
  slopeAtLeastSquares,
  trendBucket,
} from 'app/services/oracle/oracleMatching';
import {
  ORACLE_HOUR_MS,
  ORACLE_MINUTE_MS,
  ORACLE_RECENT_WINDOW_HOURS,
} from 'app/services/oracle/oracleConstants';
import {
  OracleCachedBgEntry,
  OracleCachedDeviceStatus,
  OracleCachedTreatment,
  OracleInsights,
  OracleInvestigateEvent,
} from 'app/services/oracle/oracleTypes';

type OracleInsightsStatus =
  | {state: 'idle'}
  | {state: 'loading'; message: string}
  | {state: 'syncing'; message: string; hasHistory: boolean}
  | {state: 'computing'; message: string}
  | {state: 'ready'}
  | {state: 'error'; message: string};

const ORACLE_DIRECTION_NOT_COMPUTABLE: TrendDirectionString = 'NOT COMPUTABLE';

const BEST_EFFORT_SLOPE_LOOKBACK_MINUTES = 30;
const BEST_EFFORT_SLOPE_MIN_GAP_MINUTES = 5;

const RECENT_EVENTS_MAX = 10;
const RECENT_EVENTS_MIN_SPACING_MINUTES = 20;

function toSlim(entries: BgSample[]): OracleCachedBgEntry[] {
  return (entries ?? [])
    .filter(e => typeof e?.date === 'number' && typeof e?.sgv === 'number')
    .map(e => ({date: e.date, sgv: e.sgv}))
    .sort((a, b) => a.date - b.date);
}

function buildRecentEvents(params: {
  recentSlim: OracleCachedBgEntry[];
  maxEvents: number;
  minSpacingMinutes: number;
  slopePointCount?: number;
}): OracleInvestigateEvent[] {
  const {recentSlim, maxEvents, minSpacingMinutes, slopePointCount} = params;
  const events: OracleInvestigateEvent[] = [];
  const spacingMs = minSpacingMinutes * ORACLE_MINUTE_MS;

  // Walk from newest to oldest; keep a few spaced-out anchors to avoid spam.
  for (let i = recentSlim.length - 1; i >= 0; i--) {
    const e = recentSlim[i];
    const slope = slopeAtLeastSquares(recentSlim, e.date, {sampleCount: slopePointCount});
    if (slope == null) continue;

    const shouldKeep =
      events.length === 0 || Math.abs(events[events.length - 1].date - e.date) >= spacingMs;
    if (!shouldKeep) continue;

    events.push({
      date: e.date,
      sgv: e.sgv,
      slope,
      kind: trendBucket(slope),
    });

    if (events.length >= maxEvents) break;
  }

  return events;
}

function bestEffortSlopeAt(
  entries: OracleCachedBgEntry[],
  anchorTs: number,
  slopePointCount?: number,
): number | null {
  const strict = slopeAtLeastSquares(entries, anchorTs, {sampleCount: slopePointCount});
  if (strict != null) return strict;

  // Fallback for sparse or gappy data: use the nearest earlier point within a short window.
  // This keeps the event picker from going empty due to a single missing interpolation sample.
  if (entries.length < 2) return null;

  const maxLookbackMs = BEST_EFFORT_SLOPE_LOOKBACK_MINUTES * ORACLE_MINUTE_MS;
  const targetStart = anchorTs - maxLookbackMs;

  // Find a previous point within the lookback window.
  for (let i = entries.length - 1; i >= 1; i--) {
    const cur = entries[i];
    if (cur.date !== anchorTs) continue;
    // Find the closest previous point.
    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j];
      const dt = cur.date - prev.date;
      if (dt <= 0) continue;
      if (prev.date < targetStart) break;
      const minutes = dt / ORACLE_MINUTE_MS;
      if (minutes < BEST_EFFORT_SLOPE_MIN_GAP_MINUTES) continue;
      return (cur.sgv - prev.sgv) / minutes;
    }
  }

  return null;
}

/**
 * Hook that powers the Investigate Events (Oracle) screen.
 *
 * Responsibilities:
 * - Sync a 90-day local cache of BG + treatments + device status.
 * - Fetch (or derive) a recent window for building event candidates.
 * - Compute insights/matches for the selected event.
 */
export function useOracleInsights(params?: {
  /** Timestamp (ms) of the event the user wants to investigate. */
  selectedEventTs?: number | null;
  /** When true, require similar IOB/COB at the anchor (when available). */
  includeLoadInMatching?: boolean;
  /** Number of sample points ("dots") for slope regression. */
  slopePointCount?: number;
  /** History window (days) to keep in the local cache, used when running a sync. */
  cacheDays?: number;
  /** When true, Execute will re-sync cache before analyzing. */
  refreshCacheOnExecute?: boolean;
}): {
  insights: OracleInsights | null;
  events: OracleInvestigateEvent[];
  selectedEvent: OracleInvestigateEvent | null;
  isLoading: boolean;
  /** True while (re)computing matches/insights on the JS thread. */
  isComputingInsights: boolean;
  /** Progress for scanning the local history cache (if available). */
  computeProgress: OracleComputeProgress | null;
  /** Progress for syncing the local history cache from the network. */
  syncProgress: OracleCacheSyncProgress | null;
  /** Tracks the last compute duration (ms) for UI/debug. */
  lastComputeMs: number | null;
  /** Current slope point count after debouncing. */
  effectiveSlopePointCount: number | undefined;
  /** Whether the user has run Execute at least once in this session. */
  hasExecuted: boolean;
  /** The exact config used for the last execution (stable even if UI settings change). */
  lastRunConfig: {
    cacheDays: number;
    includeLoadInMatching: boolean;
    slopePointCount: number | undefined;
    refreshCacheOnExecute: boolean;
    selectedEventTs: number | null;
  } | null;
  error: unknown;
  lastSyncedMs: number | null;
  /** Number of BG entries currently available in the 90-day local cache. */
  historyCount: number;
  /** True while the 90-day cache sync is running. */
  isSyncing: boolean;
  /** High-level status intended for UI display. */
  status: OracleInsightsStatus;
  /** Starts cache collection (optional) + analysis using the current UI settings. */
  execute: () => void;
} {
  const selectedEventTs = params?.selectedEventTs ?? null;
  const includeLoadInMatching = params?.includeLoadInMatching !== false;
  const slopePointCount = params?.slopePointCount;
  const cacheDays = typeof params?.cacheDays === 'number' && Number.isFinite(params.cacheDays)
    ? Math.max(1, Math.round(params.cacheDays))
    : 90;
  const refreshCacheOnExecute = params?.refreshCacheOnExecute !== false;

  // Debounce the slope-point count. Users tend to tap +/- quickly; this avoids
  // repeated heavy recomputes while still updating the control immediately.
  const [effectiveSlopePointCount, setEffectiveSlopePointCount] = useState<number | undefined>(
    slopePointCount,
  );
  useEffect(() => {
    const t = setTimeout(() => setEffectiveSlopePointCount(slopePointCount), 250);
    return () => clearTimeout(t);
  }, [slopePointCount]);

  const {snapshot, isLoading: snapshotLoading, error: snapshotError} =
    useLatestNightscoutSnapshot({pollingEnabled: true});

  const [history, setHistory] = useState<OracleCachedBgEntry[]>([]);
  const [treatments, setTreatments] = useState<OracleCachedTreatment[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<OracleCachedDeviceStatus[]>([]);
  const [lastSyncedMs, setLastSyncedMs] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<OracleCacheSyncProgress | null>(null);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [didFullSync, setDidFullSync] = useState<boolean>(false);

  const [recentBg, setRecentBg] = useState<BgSample[]>([]);
  const [recentError, setRecentError] = useState<unknown>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Load whatever cache we have on disk. This is fast and does not hit the network.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cached = await loadOracleCache();
        if (!active) return;
        setHistory(cached.entries);
        setTreatments(cached.treatments);
        setDeviceStatus(cached.deviceStatus);
        setLastSyncedMs(cached.meta?.lastSyncedMs ?? null);
      } catch (e) {
        // Best-effort; keep screen usable.
        if (!active) return;
        setSyncError(e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const anchorNow = useMemo(() => {
    // Prefer live snapshot when available.
    if (
      typeof snapshot?.bg?.date === 'number' &&
      Number.isFinite(snapshot.bg.date) &&
      typeof snapshot.bg.sgv === 'number' &&
      Number.isFinite(snapshot.bg.sgv)
    ) {
      return snapshot.bg;
    }

    // Offline fallback: use last cached BG point as a best-effort "now".
    if (history.length) {
      const last = history[history.length - 1];
      return {
        sgv: last.sgv,
        date: last.date,
        dateString: new Date(last.date).toISOString(),
        trend: 0,
        direction: ORACLE_DIRECTION_NOT_COMPUTABLE,
        device: 'oracle-cache',
        type: 'sgv',
      } as BgSample;
    }

    return null;
  }, [history, snapshot?.bg]);

  // 2) Fetch recent window for the user's current line; fallback to cache when offline.
  useEffect(() => {
    const now = anchorNow;
    if (!now) return;

    let active = true;

    (async () => {
      setIsLoadingRecent(true);
      setRecentError(null);
      try {
        const windowMs = ORACLE_RECENT_WINDOW_HOURS * ORACLE_HOUR_MS;
        const start = new Date(now.date - windowMs);
        const end = new Date(now.date);

        // If we don't have a live snapshot, assume offline and derive from cache.
        if (!snapshot?.bg) {
          const derived = history
            .filter(h => h.date >= now.date - windowMs && h.date <= now.date)
            .map(h => ({
              sgv: h.sgv,
              date: h.date,
              dateString: new Date(h.date).toISOString(),
              trend: 0,
              direction: ORACLE_DIRECTION_NOT_COMPUTABLE,
              device: 'oracle-cache',
              type: 'sgv',
            })) as BgSample[];

          if (!active) return;
          setRecentBg(derived);
          return;
        }

        const data = await fetchBgDataForDateRange(start, end);
        if (!active) return;
        setRecentBg(data);
      } catch (e) {
        if (!active) return;
        setRecentError(e);

        // Offline fallback: derive recent from cached history (best-effort).
        const windowMs = ORACLE_RECENT_WINDOW_HOURS * ORACLE_HOUR_MS;
        const derived = history
          .filter(h => h.date >= now.date - windowMs && h.date <= now.date)
          .map(h => ({
            sgv: h.sgv,
            date: h.date,
            dateString: new Date(h.date).toISOString(),
            trend: 0,
            direction: ORACLE_DIRECTION_NOT_COMPUTABLE,
            device: 'oracle-cache',
            type: 'sgv',
          })) as BgSample[];

        setRecentBg(derived);
      } finally {
        if (active) setIsLoadingRecent(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [anchorNow, history, snapshot?.bg]);

  const events = useMemo(() => {
    const base = toSlim(recentBg);
    if (!base.length) return [];

    const sortedDeviceStatus = [...(deviceStatus ?? [])].sort((a, b) => a.ts - b.ts);

    // Enrich with a best-effort slope to avoid empty lists on sparse data.
    const raw = buildRecentEvents({
      recentSlim: base,
      maxEvents: RECENT_EVENTS_MAX,
      minSpacingMinutes: RECENT_EVENTS_MIN_SPACING_MINUTES,
      slopePointCount,
    });
    if (raw.length) {
      return raw.map(e => {
        const load = findLoadAtTs(sortedDeviceStatus, e.date);
        return {...e, iob: load.iob, cob: load.cob};
      });
    }

    const fallbackEvents: OracleInvestigateEvent[] = [];
    const spacingMs = RECENT_EVENTS_MIN_SPACING_MINUTES * ORACLE_MINUTE_MS;
    for (let i = base.length - 1; i >= 0; i--) {
      const e = base[i];
      const slope = bestEffortSlopeAt(base, e.date, slopePointCount);
      if (slope == null) continue;
      const shouldKeep =
        fallbackEvents.length === 0 ||
        Math.abs(fallbackEvents[fallbackEvents.length - 1].date - e.date) >= spacingMs;
      if (!shouldKeep) continue;
      const load = findLoadAtTs(sortedDeviceStatus, e.date);
      fallbackEvents.push({
        date: e.date,
        sgv: e.sgv,
        slope,
        kind: trendBucket(slope),
        iob: load.iob,
        cob: load.cob,
      });
      if (fallbackEvents.length >= RECENT_EVENTS_MAX) break;
    }

    return fallbackEvents;
  }, [deviceStatus, recentBg, slopePointCount]);

  const selectedEvent = useMemo(() => {
    if (!events.length) return null;
    if (typeof selectedEventTs === 'number') {
      const found = events.find(e => e.date === selectedEventTs);
      if (found) return found;
    }
    return events[0];
  }, [events, selectedEventTs]);

  const [insights, setInsights] = useState<OracleInsights | null>(null);
  const [computeError, setComputeError] = useState<unknown>(null);
  const [isComputingInsights, setIsComputingInsights] = useState(false);
  const [lastComputeMs, setLastComputeMs] = useState<number | null>(null);
  const [computeProgress, setComputeProgress] = useState<OracleComputeProgress | null>(null);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [lastRunConfig, setLastRunConfig] = useState<{
    cacheDays: number;
    includeLoadInMatching: boolean;
    slopePointCount: number | undefined;
    refreshCacheOnExecute: boolean;
    selectedEventTs: number | null;
  } | null>(null);

  const [runNonce, setRunNonce] = useState(0);
  const runIdRef = useRef(0);
  const runConfigRef = useRef<{
    cacheDays: number;
    includeLoadInMatching: boolean;
    slopePointCount: number | undefined;
    refreshCacheOnExecute: boolean;
    selectedEventTs: number | null;
  } | null>(null);

  // Refs to keep the Execute pipeline independent from render-driven dependencies.
  // This avoids accidentally re-running analysis when background state updates.
  const historyRef = useRef(history);
  const treatmentsRef = useRef(treatments);
  const deviceStatusRef = useRef(deviceStatus);
  const recentBgRef = useRef(recentBg);
  const eventsRef = useRef(events);
  const selectedEventRef = useRef(selectedEvent);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    treatmentsRef.current = treatments;
  }, [treatments]);
  useEffect(() => {
    deviceStatusRef.current = deviceStatus;
  }, [deviceStatus]);
  useEffect(() => {
    recentBgRef.current = recentBg;
  }, [recentBg]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    selectedEventRef.current = selectedEvent;
  }, [selectedEvent]);

  const execute = useCallback(() => {
    // Snapshot config + the currently selected event.
    runConfigRef.current = {
      cacheDays,
      includeLoadInMatching,
      slopePointCount: effectiveSlopePointCount,
      refreshCacheOnExecute,
      selectedEventTs: selectedEvent?.date ?? null,
    };
    setLastRunConfig(runConfigRef.current);
    setHasExecuted(true);
    runIdRef.current += 1;
    setRunNonce(n => n + 1);
  }, [
    cacheDays,
    effectiveSlopePointCount,
    includeLoadInMatching,
    refreshCacheOnExecute,
    selectedEvent?.date,
  ]);

  // Main execution pipeline: (optional) cache sync -> compute insights.
  useEffect(() => {
    const runId = runIdRef.current;
    const cfg = runConfigRef.current;
    if (!cfg) return;

    let active = true;

    (async () => {
      setSyncError(null);
      setComputeError(null);
      setSyncProgress(null);
      setComputeProgress(null);
      setLastComputeMs(null);

      const selectedTs = cfg.selectedEventTs;
      if (typeof selectedTs !== 'number') {
        setInsights(null);
        setComputeError(new Error('Pick an event before executing'));
        return;
      }

      // 1) Optionally sync cache.
      let nextHistory = historyRef.current;
      let nextTreatments = treatmentsRef.current;
      let nextDeviceStatus = deviceStatusRef.current;

      if (cfg.refreshCacheOnExecute) {
        setIsSyncing(true);
        try {
          const res = await syncOracleCache({
            days: cfg.cacheDays,
            chunkDays: 14,
            onProgress: p => {
              if (!active) return;
              // Ignore stale runs.
              if (runIdRef.current !== runId) return;
              setSyncProgress(p);
            },
            shouldAbort: () => !active || runIdRef.current !== runId,
          });

          if (!active || runIdRef.current !== runId) return;
          nextHistory = res.entries;
          nextTreatments = res.treatments;
          nextDeviceStatus = res.deviceStatus;
          setHistory(res.entries);
          setTreatments(res.treatments);
          setDeviceStatus(res.deviceStatus);
          setLastSyncedMs(res.meta.lastSyncedMs);
          setDidFullSync(!!res.didFullSync);
        } catch (e) {
          if (!active || runIdRef.current !== runId) return;
          setSyncError(e);
        } finally {
          if (!active || runIdRef.current !== runId) return;
          setIsSyncing(false);
        }
      }

      // 2) Compute insights.
      setIsComputingInsights(true);
      try {
        const selected = eventsRef.current.find(e => e.date === selectedTs) ?? null;
        const anchorEvent = selected ?? selectedEventRef.current;
        if (!anchorEvent) {
          throw new Error('Unable to resolve selected event for analysis');
        }

        const anchor: BgSample = {
          sgv: anchorEvent.sgv,
          date: anchorEvent.date,
          dateString: new Date(anchorEvent.date).toISOString(),
          trend: 0,
          direction: ORACLE_DIRECTION_NOT_COMPUTABLE,
          device: 'oracle-anchor',
          type: 'sgv',
        } as BgSample;

        const startMs = Date.now();
        const useProgressive = Array.isArray(nextHistory) && nextHistory.length >= 2000;

        if (useProgressive) {
          const res = await computeOracleInsightsProgressive(
            {
              anchor,
              recentBg: recentBgRef.current,
              history: nextHistory,
              treatments: nextTreatments,
              deviceStatus: nextDeviceStatus,
              includeLoadInMatching: cfg.includeLoadInMatching,
              slopePointCount: cfg.slopePointCount,
            },
            {
              onProgress: p => {
                if (!active || runIdRef.current !== runId) return;
                setComputeProgress(p);
              },
              onPartialInsights: partial => {
                if (!active || runIdRef.current !== runId) return;
                setInsights(partial);
              },
              shouldAbort: () => !active || runIdRef.current !== runId,
            },
          );

          if (!active || runIdRef.current !== runId) return;
          setInsights(res);
          setLastComputeMs(Date.now() - startMs);
          return;
        }

        const res = computeOracleInsights({
          anchor,
          recentBg: recentBgRef.current,
          history: nextHistory,
          treatments: nextTreatments,
          deviceStatus: nextDeviceStatus,
          includeLoadInMatching: cfg.includeLoadInMatching,
          slopePointCount: cfg.slopePointCount,
        });

        if (!active || runIdRef.current !== runId) return;
        setInsights(res);
        setLastComputeMs(Date.now() - startMs);
      } catch (e) {
        if (!active || runIdRef.current !== runId) return;
        setInsights(null);
        setComputeError(e);
      } finally {
        if (!active || runIdRef.current !== runId) return;
        setIsComputingInsights(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [runNonce]);

  const error = snapshotError ?? syncError ?? recentError ?? computeError;
  const isLoading = snapshotLoading || isSyncing || isLoadingRecent;

  const status: OracleInsightsStatus = useMemo(() => {
    if (!hasExecuted) {
      return {state: 'idle'};
    }

    if (snapshotLoading && history.length === 0) {
      return {state: 'loading', message: 'Loading recent data…'};
    }

    if (isSyncing) {
      const hasHistory = history.length > 0;
      const message =
        syncProgress?.message ??
        (hasHistory
          ? 'Updating history cache…'
          : didFullSync
            ? 'Building your history cache…'
            : 'Syncing history cache…');
      return {state: 'syncing', message, hasHistory};
    }

    if (error && history.length === 0 && recentBg.length === 0) {
      return {state: 'error', message: 'Unable to load data. Check your connection and try again.'};
    }

    if (!events.length && !isLoading && history.length > 0) {
      return {state: 'error', message: 'Not enough recent data to pick an event yet. Try again in a minute.'};
    }

    if (!anchorNow && history.length === 0) {
      return {state: 'loading', message: 'Waiting for data…'};
    }

    if (isComputingInsights) {
      const msg =
        computeProgress?.stage === 'scanning'
          ? 'Scanning history for similar events…'
          : computeProgress?.stage === 'finalizing'
            ? 'Finalizing insights…'
            : 'Analyzing similar events…';
      return {state: 'computing', message: msg};
    }

    return {state: 'ready'};
  }, [
    anchorNow,
    computeProgress?.stage,
    didFullSync,
    error,
    events.length,
    hasExecuted,
    history.length,
    isComputingInsights,
    isLoading,
    isSyncing,
    recentBg.length,
    snapshotLoading,
    syncProgress?.message,
  ]);

  return {
    insights,
    events,
    selectedEvent,
    isLoading,
    isComputingInsights,
    computeProgress,
    syncProgress,
    lastComputeMs,
    effectiveSlopePointCount,
    hasExecuted,
    lastRunConfig,
    error,
    lastSyncedMs,
    historyCount: history.length,
    isSyncing,
    status,
    execute,
  };
}
