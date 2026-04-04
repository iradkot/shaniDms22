import {useEffect, useMemo, useState} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';

export type LoopMode = 'open' | 'closed' | 'unknown';
type BasalMode = 'temp' | 'suspended' | 'planned' | 'other';

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
  tempBasalPct: number;
  suspendedPct: number;
  plannedBasalPct: number;
  diagnostics: {
    eventsFetched: number;
    eventsClassified: number;
    openSamples: number;
    closedSamples: number;
    basalEvents: number;
  };
}

function classifyMode(text?: string): LoopMode {
  const s = (text || '').toLowerCase();
  if (!s) return 'unknown';

  if (
    s.includes('open loop') ||
    s.includes('open') ||
    s.includes('manual') ||
    s.includes('profile switch') ||
    s.includes('openaps disabled') ||
    s.includes('פתוח') ||
    s.includes('ידני')
  ) {
    return 'open';
  }

  if (
    s.includes('closed loop') ||
    s.includes('closed') ||
    s.includes('auto') ||
    s.includes('aps') ||
    s.includes('loop on') ||
    s.includes('openaps') ||
    s.includes('profile switch') ||
    s.includes('autotune') ||
    s.includes('סגור') ||
    s.includes('אוטו') ||
    s.includes('אוטומ')
  ) {
    return 'closed';
  }

  return 'unknown';
}

function classifyBasalMode(text?: string, row?: any): BasalMode {
  const s = (text || '').toLowerCase();

  const rate = Number(row?.rate ?? row?.absolute ?? NaN);
  const duration = Number(row?.duration ?? row?.durationInMinutes ?? NaN);

  if (
    s.includes('suspend') ||
    s.includes('suspended') ||
    s.includes('pump suspend') ||
    s.includes('suspend pump') ||
    s.includes('השע') ||
    s.includes('מושהה') ||
    (Number.isFinite(rate) && rate === 0 && Number.isFinite(duration) && duration > 0)
  ) {
    return 'suspended';
  }

  if (
    s.includes('temp basal') ||
    s.includes('temporary basal') ||
    s.includes('temp') ||
    s.includes('tempbasal') ||
    s.includes('basal temp') ||
    s.includes('זמני') ||
    Number.isFinite(duration)
  ) {
    return 'temp';
  }

  if (
    s.includes('planned basal') ||
    s.includes('plan basal') ||
    s.includes('scheduled basal') ||
    s.includes('profile') ||
    s.includes('profile switch') ||
    s.includes('basal profile') ||
    s.includes('פרופיל') ||
    s.includes('בסל מתוכנן')
  ) {
    return 'planned';
  }

  return 'other';
}

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function tir(arr: number[]) {
  return arr.length ? (arr.filter(v => v >= 70 && v <= 180).length / arr.length) * 100 : null;
}

export function computeLoopModeStats({
  start,
  end,
  bgData,
  events,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
  events: Array<{timestamp: number; mode: LoopMode}>;
}): LoopModeStats {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

  if (!events.length) {
    return {
      openMinutes: 0,
      closedMinutes: 0,
      unknownMinutes: totalMinutes,
      openPct: 0,
      closedPct: 0,
      openAvgBg: null,
      closedAvgBg: null,
      openTirPct: null,
      closedTirPct: null,
      tempBasalMinutes: 0,
      suspendedMinutes: 0,
      plannedBasalMinutes: 0,
      tempBasalPct: 0,
      suspendedPct: 0,
      plannedBasalPct: 0,
      diagnostics: {
        eventsFetched: 0,
        eventsClassified: 0,
        openSamples: 0,
        closedSamples: 0,
        basalEvents: 0,
      },
    };
  }

  let currentMode: LoopMode = 'unknown';
  const prior = events.filter(e => e.timestamp <= startMs).slice(-1)[0];
  if (prior) currentMode = prior.mode;

  let cursor = startMs;
  let openMinutes = 0;
  let closedMinutes = 0;
  let unknownMinutes = 0;

  for (const e of events) {
    if (e.timestamp <= startMs || e.timestamp >= endMs) {
      if (e.timestamp <= startMs) currentMode = e.mode;
      continue;
    }

    const deltaMin = Math.max(0, Math.round((e.timestamp - cursor) / 60000));
    if (currentMode === 'open') openMinutes += deltaMin;
    else if (currentMode === 'closed') closedMinutes += deltaMin;
    else unknownMinutes += deltaMin;

    currentMode = e.mode;
    cursor = e.timestamp;
  }

  const tailMin = Math.max(0, Math.round((endMs - cursor) / 60000));
  if (currentMode === 'open') openMinutes += tailMin;
  else if (currentMode === 'closed') closedMinutes += tailMin;
  else unknownMinutes += tailMin;

  const modeAt = (ts: number): LoopMode => {
    let m: LoopMode = 'unknown';
    for (const e of events) {
      if (e.timestamp <= ts) m = e.mode;
      else break;
    }
    return m;
  };

  const openSamples = bgData.filter(s => modeAt(s.date) === 'open').map(s => s.sgv);
  const closedSamples = bgData.filter(s => modeAt(s.date) === 'closed').map(s => s.sgv);

  return {
    openMinutes,
    closedMinutes,
    unknownMinutes,
    openPct: (openMinutes / totalMinutes) * 100,
    closedPct: (closedMinutes / totalMinutes) * 100,
    openAvgBg: avg(openSamples),
    closedAvgBg: avg(closedSamples),
    openTirPct: tir(openSamples),
    closedTirPct: tir(closedSamples),
    tempBasalMinutes: 0,
    suspendedMinutes: 0,
    plannedBasalMinutes: 0,
    tempBasalPct: 0,
    suspendedPct: 0,
    plannedBasalPct: 0,
    diagnostics: {
      eventsFetched: events.length,
      eventsClassified: events.filter(e => e.mode !== 'unknown').length,
      openSamples: openSamples.length,
      closedSamples: closedSamples.length,
      basalEvents: events.length,
    },
  };
}

export function useLoopModeStats({
  start,
  end,
  bgData,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
}) {
  const [events, setEvents] = useState<Array<{timestamp: number; mode: LoopMode; basalMode: BasalMode}>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchProfileChangeHistory({
          startMs: start.getTime() - 24 * 60 * 60 * 1000,
          endMs: end.getTime(),
          limit: 500,
        });

        const normalized = rows
          .map(r => {
            const eventType = (r as any)?.eventType || '';
            const notes = (r as any)?.notes || '';
            const enteredBy = (r as any)?.enteredBy || '';
            const profile = (r as any)?.profile || '';
            const raw = JSON.stringify(r || {}).slice(0, 400);
            const text = `${eventType} ${notes} ${enteredBy} ${profile} ${r.profileName || ''} ${r.summary || ''} ${raw}`;
            return {
              timestamp: r.timestamp,
              mode: classifyMode(text),
              basalMode: classifyBasalMode(text, r),
            };
          })
          .sort((a, b) => a.timestamp - b.timestamp);

        if (!cancelled) setEvents(normalized);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return useMemo(() => {
    const base = computeLoopModeStats({
      start,
      end,
      bgData,
      events: events.map(e => ({timestamp: e.timestamp, mode: e.mode})),
    });

    const startMs = start.getTime();
    const endMs = end.getTime();
    const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

    let currentBasal: BasalMode = 'other';
    const prior = events.filter(e => e.timestamp <= startMs).slice(-1)[0];
    if (prior) currentBasal = prior.basalMode;

    let cursor = startMs;
    let tempBasalMinutes = 0;
    let suspendedMinutes = 0;
    let plannedBasalMinutes = 0;

    for (const e of events) {
      if (e.timestamp <= startMs || e.timestamp >= endMs) {
        if (e.timestamp <= startMs) currentBasal = e.basalMode;
        continue;
      }
      const delta = Math.max(0, Math.round((e.timestamp - cursor) / 60000));
      if (currentBasal === 'temp') tempBasalMinutes += delta;
      if (currentBasal === 'suspended') suspendedMinutes += delta;
      if (currentBasal === 'planned') plannedBasalMinutes += delta;
      currentBasal = e.basalMode;
      cursor = e.timestamp;
    }

    const tail = Math.max(0, Math.round((endMs - cursor) / 60000));
    if (currentBasal === 'temp') tempBasalMinutes += tail;
    if (currentBasal === 'suspended') suspendedMinutes += tail;
    if (currentBasal === 'planned') plannedBasalMinutes += tail;

    return {
      ...base,
      tempBasalMinutes,
      suspendedMinutes,
      plannedBasalMinutes,
      tempBasalPct: (tempBasalMinutes / totalMinutes) * 100,
      suspendedPct: (suspendedMinutes / totalMinutes) * 100,
      plannedBasalPct: (plannedBasalMinutes / totalMinutes) * 100,
      diagnostics: {
        ...base.diagnostics,
        basalEvents: events.length,
      },
    };
  }, [events, bgData, start, end]);
}
