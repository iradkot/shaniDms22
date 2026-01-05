import {useCallback, useEffect, useMemo, useState} from 'react';

import {fetchBgDataForDateRange} from 'app/api/apiRequests';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {BgSample} from 'app/types/day_bgs.types';
import {TrendDirectionString} from 'app/types/notifications';

import {syncOracleCache} from 'app/services/oracle/oracleCache';
import {
  computeOracleInsights,
  findLoadAtTs,
  slopeAt,
  trendBucket,
} from 'app/services/oracle/oracleMatching';
import {
  ORACLE_CACHE_DAYS,
  ORACLE_HOUR_MS,
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
  | {state: 'ready'}
  | {state: 'error'; message: string};

const ORACLE_DIRECTION_NOT_COMPUTABLE: TrendDirectionString = 'NOT COMPUTABLE';

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
}): OracleInvestigateEvent[] {
  const {recentSlim, maxEvents, minSpacingMinutes} = params;
  const events: OracleInvestigateEvent[] = [];
  const spacingMs = minSpacingMinutes * 60 * 1000;

  // Walk from newest to oldest; keep a few spaced-out anchors to avoid spam.
  for (let i = recentSlim.length - 1; i >= 0; i--) {
    const e = recentSlim[i];
    const slope = slopeAt(recentSlim, e.date);
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

function bestEffortSlopeAt(entries: OracleCachedBgEntry[], anchorTs: number): number | null {
  const strict = slopeAt(entries, anchorTs);
  if (strict != null) return strict;

  // Fallback for sparse or gappy data: use the nearest earlier point within a short window.
  // This keeps the event picker from going empty due to a single missing interpolation sample.
  if (entries.length < 2) return null;

  const maxLookbackMs = 30 * 60 * 1000;
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
      const minutes = dt / (60 * 1000);
      if (minutes < 5) continue;
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
}): {
  insights: OracleInsights | null;
  events: OracleInvestigateEvent[];
  selectedEvent: OracleInvestigateEvent | null;
  isLoading: boolean;
  error: unknown;
  lastSyncedMs: number | null;
  /** Number of BG entries currently available in the 90-day local cache. */
  historyCount: number;
  /** True while the 90-day cache sync is running. */
  isSyncing: boolean;
  /** High-level status intended for UI display. */
  status: OracleInsightsStatus;
  /** Re-runs cache sync and refreshes recent BG window. */
  retry: () => void;
} {
  const selectedEventTs = params?.selectedEventTs ?? null;
  const includeLoadInMatching = params?.includeLoadInMatching !== false;

  const {snapshot, isLoading: snapshotLoading, error: snapshotError} =
    useLatestNightscoutSnapshot({pollingEnabled: true});

  const [history, setHistory] = useState<OracleCachedBgEntry[]>([]);
  const [treatments, setTreatments] = useState<OracleCachedTreatment[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<OracleCachedDeviceStatus[]>([]);
  const [lastSyncedMs, setLastSyncedMs] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [didFullSync, setDidFullSync] = useState<boolean>(false);
  const [syncNonce, setSyncNonce] = useState(0);

  const [recentBg, setRecentBg] = useState<BgSample[]>([]);
  const [recentError, setRecentError] = useState<unknown>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  const retry = useCallback(() => {
    setSyncNonce(n => n + 1);
  }, []);

  // 1) Keep a 90-day local cache synced.
  useEffect(() => {
    let active = true;
    (async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await syncOracleCache({days: ORACLE_CACHE_DAYS});
        if (!active) return;
        setHistory(res.entries);
        setTreatments(res.treatments);
        setDeviceStatus(res.deviceStatus);
        setLastSyncedMs(res.meta.lastSyncedMs);
        setDidFullSync(!!res.didFullSync);
      } catch (e) {
        if (!active) return;
        setSyncError(e);
      } finally {
        if (active) setIsSyncing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [syncNonce]);

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
    const raw = buildRecentEvents({recentSlim: base, maxEvents: 10, minSpacingMinutes: 20});
    if (raw.length) {
      return raw.map(e => {
        const load = findLoadAtTs(sortedDeviceStatus, e.date);
        return {...e, iob: load.iob, cob: load.cob};
      });
    }

    const fallbackEvents: OracleInvestigateEvent[] = [];
    const spacingMs = 20 * 60 * 1000;
    for (let i = base.length - 1; i >= 0; i--) {
      const e = base[i];
      const slope = bestEffortSlopeAt(base, e.date);
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
      if (fallbackEvents.length >= 10) break;
    }

    return fallbackEvents;
  }, [deviceStatus, recentBg]);

  const selectedEvent = useMemo(() => {
    if (!events.length) return null;
    if (typeof selectedEventTs === 'number') {
      const found = events.find(e => e.date === selectedEventTs);
      if (found) return found;
    }
    return events[0];
  }, [events, selectedEventTs]);

  const computed = useMemo(() => {
    if (!selectedEvent) return {insights: null as OracleInsights | null, computeError: null as unknown};

    const anchor: BgSample = {
      sgv: selectedEvent.sgv,
      date: selectedEvent.date,
      dateString: new Date(selectedEvent.date).toISOString(),
      trend: 0,
      direction: ORACLE_DIRECTION_NOT_COMPUTABLE,
      device: 'oracle-anchor',
      type: 'sgv',
    } as BgSample;

    const startMs = Date.now();
    try {
      const res = computeOracleInsights({
        anchor,
        recentBg,
        history,
        treatments,
        deviceStatus,
        includeLoadInMatching,
      });

      const elapsed = Date.now() - startMs;
      if (elapsed > 1500) {
        console.warn(
          `Oracle: computeOracleInsights took ${elapsed}ms for ${history.length} points`,
        );
      }

      return {insights: res, computeError: null as unknown};
    } catch (e) {
      console.warn('Oracle: computeOracleInsights failed', e);
      return {insights: null, computeError: e};
    }
  }, [history, recentBg, selectedEvent, treatments, deviceStatus, includeLoadInMatching]);

  const error = snapshotError ?? syncError ?? recentError ?? computed.computeError;
  const isLoading = snapshotLoading || isSyncing || isLoadingRecent;

  const status: OracleInsightsStatus = useMemo(() => {
    if (snapshotLoading && history.length === 0) {
      return {state: 'loading', message: 'Loading recent data…'};
    }

    if (isSyncing) {
      const hasHistory = history.length > 0;
      const message = hasHistory
        ? 'Updating history cache…'
        : didFullSync
          ? 'Building your 90‑day history cache…'
          : 'Syncing history cache…';
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

    return {state: 'ready'};
  }, [anchorNow, didFullSync, error, events.length, history.length, isLoading, isSyncing, recentBg.length, snapshotLoading]);

  return {
    insights: computed.insights,
    events,
    selectedEvent,
    isLoading,
    error,
    lastSyncedMs,
    historyCount: history.length,
    isSyncing,
    status,
    retry,
  };
}
