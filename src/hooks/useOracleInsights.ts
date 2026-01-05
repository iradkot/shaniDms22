import {useEffect, useMemo, useState} from 'react';

import {fetchBgDataForDateRange} from 'app/api/apiRequests';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {BgSample} from 'app/types/day_bgs.types';

import {syncOracleCache} from 'app/services/oracle/oracleCache';
import {
  computeOracleInsights,
  slopeAt,
  trendBucket,
} from 'app/services/oracle/oracleMatching';
import {
  OracleCachedBgEntry,
  OracleCachedDeviceStatus,
  OracleCachedTreatment,
  OracleInsights,
  OracleInvestigateEvent,
} from 'app/services/oracle/oracleTypes';

const HOUR_MS = 60 * 60 * 1000;

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

export function useOracleInsights(params?: {
  /** Timestamp (ms) of the event the user wants to investigate. */
  selectedEventTs?: number | null;
}): {
  insights: OracleInsights | null;
  events: OracleInvestigateEvent[];
  selectedEvent: OracleInvestigateEvent | null;
  isLoading: boolean;
  error: unknown;
  lastSyncedMs: number | null;
} {
  const selectedEventTs = params?.selectedEventTs ?? null;

  const {snapshot, isLoading: snapshotLoading, error: snapshotError} =
    useLatestNightscoutSnapshot({pollingEnabled: true});

  const [history, setHistory] = useState<OracleCachedBgEntry[]>([]);
  const [treatments, setTreatments] = useState<OracleCachedTreatment[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<OracleCachedDeviceStatus[]>([]);
  const [lastSyncedMs, setLastSyncedMs] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<unknown>(null);

  const [recentBg, setRecentBg] = useState<BgSample[]>([]);
  const [recentError, setRecentError] = useState<unknown>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // 1) Keep a 90-day local cache synced.
  useEffect(() => {
    let active = true;
    (async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await syncOracleCache({days: 90});
        if (!active) return;
        setHistory(res.entries);
        setTreatments(res.treatments);
        setDeviceStatus(res.deviceStatus);
        setLastSyncedMs(res.meta.lastSyncedMs);
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
  }, []);

  // 2) Fetch recent 3h data for the user's current line; fallback to cache when offline.
  useEffect(() => {
    const now = snapshot?.bg;
    if (!now) return;

    let active = true;

    (async () => {
      setIsLoadingRecent(true);
      setRecentError(null);
      try {
        const start = new Date(now.date - 3 * HOUR_MS);
        const end = new Date(now.date);
        const data = await fetchBgDataForDateRange(start, end);
        if (!active) return;
        setRecentBg(data);
      } catch (e) {
        if (!active) return;
        setRecentError(e);

        // Offline fallback: derive recent from cached history (best-effort).
        const derived = history
          .filter(h => h.date >= now.date - 3 * HOUR_MS && h.date <= now.date)
          .map(h => ({
            sgv: h.sgv,
            date: h.date,
            dateString: new Date(h.date).toISOString(),
            trend: 0,
            direction: 'NOT COMPUTABLE' as any,
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
  }, [snapshot?.bg, history]);

  const events = useMemo(() => {
    const base = toSlim(recentBg);
    if (!base.length) return [];
    return buildRecentEvents({recentSlim: base, maxEvents: 10, minSpacingMinutes: 20});
  }, [recentBg]);

  const selectedEvent = useMemo(() => {
    if (!events.length) return null;
    if (typeof selectedEventTs === 'number') {
      const found = events.find(e => e.date === selectedEventTs);
      if (found) return found;
    }
    return events[0];
  }, [events, selectedEventTs]);

  const insights = useMemo(() => {
    if (!selectedEvent) return null;

    const anchor: BgSample = {
      sgv: selectedEvent.sgv,
      date: selectedEvent.date,
      dateString: new Date(selectedEvent.date).toISOString(),
      trend: 0,
      direction: 'NOT COMPUTABLE' as any,
      device: 'oracle-anchor',
      type: 'sgv',
    } as BgSample;

    const startMs = Date.now();
    const res = computeOracleInsights({
      anchor,
      recentBg,
      history,
      treatments,
      deviceStatus,
    });

    const elapsed = Date.now() - startMs;
    if (elapsed > 1500) {
      console.warn(`Oracle: computeOracleInsights took ${elapsed}ms for ${history.length} points`);
    }

    return res;
  }, [history, recentBg, selectedEvent, treatments, deviceStatus]);

  const error = snapshotError ?? syncError ?? recentError;
  const isLoading = snapshotLoading || isSyncing || isLoadingRecent;

  return {insights, events, selectedEvent, isLoading, error, lastSyncedMs};
}
