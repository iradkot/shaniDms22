import {useEffect, useMemo, useState} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';

type LoopMode = 'open' | 'closed' | 'unknown';

interface LoopModeStats {
  openMinutes: number;
  closedMinutes: number;
  unknownMinutes: number;
  openPct: number;
  closedPct: number;
  openAvgBg: number | null;
  closedAvgBg: number | null;
  openTirPct: number | null;
  closedTirPct: number | null;
}

function classifyMode(text?: string): LoopMode {
  const s = (text || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('open') || s.includes('manual') || s.includes('open loop')) return 'open';
  if (
    s.includes('closed') ||
    s.includes('auto') ||
    s.includes('aps') ||
    s.includes('loop on') ||
    s.includes('openaps')
  ) {
    return 'closed';
  }
  return 'unknown';
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
  const [events, setEvents] = useState<Array<{timestamp: number; mode: LoopMode}>>([]);

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
          .map(r => ({
            timestamp: r.timestamp,
            mode: classifyMode(`${r.profileName || ''} ${r.summary || ''}`),
          }))
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

  return useMemo<LoopModeStats>(() => {
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

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const tir = (arr: number[]) =>
      arr.length ? (arr.filter(v => v >= 70 && v <= 180).length / arr.length) * 100 : null;

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
    };
  }, [events, bgData, start, end]);
}
