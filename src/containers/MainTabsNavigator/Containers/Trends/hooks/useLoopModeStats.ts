import {useEffect, useMemo, useState} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {fetchDeviceStatusForDateRangeUncached} from 'app/api/apiRequests';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';

export type LoopMode = 'open' | 'closed' | 'unknown';
export type BasalMode = 'temp' | 'suspended' | 'planned' | 'other' | 'unknown';
type LoopModeEvent = {timestamp: number; mode: LoopMode; basalMode?: BasalMode};

export const LOOP_STATUS_CARRY_FORWARD_MINUTES = 20;
export const MIN_LOOP_KNOWN_COVERAGE_PCT = 70;
export const MIN_BG_SAMPLES_PER_LOOP_MODE = 3;

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
  knownMinutes: number;
  knownCoveragePct: number;
  unknownPct: number;
  hasEnoughLoopCoverage: boolean;
  openMetricsReliable: boolean;
  closedMetricsReliable: boolean;
  canCompareOpenClosed: boolean;
  diagnostics: {
    eventsFetched: number;
    eventsClassified: number;
    openSamples: number;
    closedSamples: number;
    basalEvents: number;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readTimestampMs(entry: DeviceStatusEntry): number | null {
  const mills = readNumber(entry.mills);
  if (mills != null) {
    return mills > 1e12 ? mills : mills * 1000;
  }

  const createdAt =
    typeof entry.created_at === 'string' ? Date.parse(entry.created_at) : NaN;
  return Number.isFinite(createdAt) ? createdAt : null;
}

function classifyModeFromDeviceStatus(entry: DeviceStatusEntry): LoopMode {
  const loop = asRecord(entry.loop);
  const openaps = asRecord(entry.openaps);

  const loopEnacted = asRecord(loop?.enacted);
  const loopRecommendation = asRecord(loop?.automaticDoseRecommendation);
  if (loopEnacted) {
    return loopEnacted.received === false ? 'open' : 'closed';
  }
  if (loopRecommendation) {
    return 'open';
  }

  const openapsEnacted = asRecord(openaps?.enacted);
  if (openapsEnacted) {
    return openapsEnacted.received === false ? 'open' : 'closed';
  }
  if (asRecord(openaps?.suggested)) {
    return 'open';
  }

  return 'unknown';
}

function classifyBasalModeFromDeviceStatus(
  entry: DeviceStatusEntry,
): BasalMode {
  const pump = asRecord(entry.pump);
  if (pump?.suspended === true) {
    return 'suspended';
  }

  const loop = asRecord(entry.loop);
  const openaps = asRecord(entry.openaps);
  const recommendation = asRecord(loop?.automaticDoseRecommendation);
  const enacted =
    asRecord(loop?.enacted) ??
    asRecord(openaps?.enacted) ??
    asRecord(recommendation?.tempBasalAdjustment);

  const rate = readNumber(enacted?.rate);
  const duration = readNumber(enacted?.duration);
  if (duration != null && duration > 0) {
    return rate === 0 ? 'suspended' : 'temp';
  }

  return 'planned';
}

function isValidBgSample(sample: BgSample): boolean {
  return (
    Number.isFinite(sample.date) &&
    Number.isFinite(sample.sgv) &&
    sample.sgv > 0
  );
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function tir(arr: number[]): number | null {
  return arr.length
    ? (arr.filter(v => v >= 70 && v <= 180).length / arr.length) * 100
    : null;
}

export function buildLoopModeEventsFromDeviceStatus(
  status: DeviceStatusEntry[],
): LoopModeEvent[] {
  return status
    .map((entry): LoopModeEvent | null => {
      const timestamp = readTimestampMs(entry);
      if (timestamp == null) {
        return null;
      }

      const basalMode = classifyBasalModeFromDeviceStatus(entry);
      const mode = classifyModeFromDeviceStatus(entry);

      return {timestamp, mode, basalMode};
    })
    .filter((event): event is LoopModeEvent => event !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function computeLoopModeStats({
  start,
  end,
  bgData,
  events,
  maxCarryForwardMinutes = Infinity,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
  events: LoopModeEvent[];
  maxCarryForwardMinutes?: number;
}): LoopModeStats {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const maxCarryForwardMs =
    Number.isFinite(maxCarryForwardMinutes) && maxCarryForwardMinutes >= 0
      ? maxCarryForwardMinutes * 60000
      : Infinity;
  const sortedEvents = events
    .filter(e => Number.isFinite(e.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!sortedEvents.length) {
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
      knownMinutes: 0,
      knownCoveragePct: 0,
      unknownPct: 100,
      hasEnoughLoopCoverage: false,
      openMetricsReliable: false,
      closedMetricsReliable: false,
      canCompareOpenClosed: false,
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
  const prior = sortedEvents.filter(e => e.timestamp <= startMs).slice(-1)[0];
  if (
    prior &&
    (maxCarryForwardMs === Infinity ||
      startMs - prior.timestamp <= maxCarryForwardMs)
  ) {
    currentMode = prior.mode;
  }

  let cursor = startMs;
  let openMinutes = 0;
  let closedMinutes = 0;
  let unknownMinutes = 0;
  let currentBasalMode: BasalMode = 'unknown';
  let basalCursor = startMs;
  let tempBasalMinutes = 0;
  let suspendedMinutes = 0;
  let plannedBasalMinutes = 0;

  const priorBasal = sortedEvents
    .filter(e => e.timestamp <= startMs)
    .slice(-1)[0];
  if (
    priorBasal?.basalMode &&
    (maxCarryForwardMs === Infinity ||
      startMs - priorBasal.timestamp <= maxCarryForwardMs)
  ) {
    currentBasalMode = priorBasal.basalMode;
  }

  for (const e of sortedEvents) {
    if (e.timestamp <= startMs || e.timestamp >= endMs) {
      if (
        e.timestamp <= startMs &&
        (maxCarryForwardMs === Infinity ||
          startMs - e.timestamp <= maxCarryForwardMs)
      ) {
        currentMode = e.mode;
        currentBasalMode = e.basalMode ?? 'unknown';
      }
      continue;
    }

    const segmentEnd =
      maxCarryForwardMs === Infinity
        ? e.timestamp
        : Math.min(e.timestamp, cursor + maxCarryForwardMs);
    const deltaMin = Math.max(0, Math.round((segmentEnd - cursor) / 60000));
    if (currentMode === 'open') {
      openMinutes += deltaMin;
    } else if (currentMode === 'closed') {
      closedMinutes += deltaMin;
    } else {
      unknownMinutes += deltaMin;
    }
    if (segmentEnd < e.timestamp) {
      unknownMinutes += Math.max(
        0,
        Math.round((e.timestamp - segmentEnd) / 60000),
      );
    }

    currentMode = e.mode;
    cursor = e.timestamp;

    const basalSegmentEnd =
      maxCarryForwardMs === Infinity
        ? e.timestamp
        : Math.min(e.timestamp, basalCursor + maxCarryForwardMs);
    const basalDeltaMin = Math.max(
      0,
      Math.round((basalSegmentEnd - basalCursor) / 60000),
    );
    if (currentBasalMode === 'temp') {
      tempBasalMinutes += basalDeltaMin;
    } else if (currentBasalMode === 'suspended') {
      suspendedMinutes += basalDeltaMin;
    } else if (currentBasalMode === 'planned') {
      plannedBasalMinutes += basalDeltaMin;
    }
    currentBasalMode = e.basalMode ?? 'unknown';
    basalCursor = e.timestamp;
  }

  const tailEnd =
    maxCarryForwardMs === Infinity
      ? endMs
      : Math.min(endMs, cursor + maxCarryForwardMs);
  const tailMin = Math.max(0, Math.round((tailEnd - cursor) / 60000));
  if (currentMode === 'open') {
    openMinutes += tailMin;
  } else if (currentMode === 'closed') {
    closedMinutes += tailMin;
  } else {
    unknownMinutes += tailMin;
  }
  if (tailEnd < endMs) {
    unknownMinutes += Math.max(0, Math.round((endMs - tailEnd) / 60000));
  }

  const basalTailEnd =
    maxCarryForwardMs === Infinity
      ? endMs
      : Math.min(endMs, basalCursor + maxCarryForwardMs);
  const basalTailMin = Math.max(
    0,
    Math.round((basalTailEnd - basalCursor) / 60000),
  );
  if (currentBasalMode === 'temp') {
    tempBasalMinutes += basalTailMin;
  } else if (currentBasalMode === 'suspended') {
    suspendedMinutes += basalTailMin;
  } else if (currentBasalMode === 'planned') {
    plannedBasalMinutes += basalTailMin;
  }

  const modeAt = (ts: number): LoopMode => {
    let m: LoopMode = 'unknown';
    let eventTs: number | null = null;
    for (const e of sortedEvents) {
      if (e.timestamp <= ts) {
        m = e.mode;
      } else {
        break;
      }
      eventTs = e.timestamp;
    }
    if (
      eventTs != null &&
      maxCarryForwardMs !== Infinity &&
      ts - eventTs > maxCarryForwardMs
    ) {
      return 'unknown';
    }
    return m;
  };

  const openSamples = bgData
    .filter(s => isValidBgSample(s) && modeAt(s.date) === 'open')
    .map(s => s.sgv);
  const closedSamples = bgData
    .filter(s => isValidBgSample(s) && modeAt(s.date) === 'closed')
    .map(s => s.sgv);
  const knownMinutes = openMinutes + closedMinutes;
  const knownCoveragePct = (knownMinutes / totalMinutes) * 100;
  const unknownPct = (unknownMinutes / totalMinutes) * 100;
  const hasEnoughLoopCoverage = knownCoveragePct >= MIN_LOOP_KNOWN_COVERAGE_PCT;
  const openMetricsReliable =
    hasEnoughLoopCoverage && openSamples.length >= MIN_BG_SAMPLES_PER_LOOP_MODE;
  const closedMetricsReliable =
    hasEnoughLoopCoverage &&
    closedSamples.length >= MIN_BG_SAMPLES_PER_LOOP_MODE;

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
    tempBasalMinutes,
    suspendedMinutes,
    plannedBasalMinutes,
    tempBasalPct: (tempBasalMinutes / totalMinutes) * 100,
    suspendedPct: (suspendedMinutes / totalMinutes) * 100,
    plannedBasalPct: (plannedBasalMinutes / totalMinutes) * 100,
    knownMinutes,
    knownCoveragePct,
    unknownPct,
    hasEnoughLoopCoverage,
    openMetricsReliable,
    closedMetricsReliable,
    canCompareOpenClosed: openMetricsReliable && closedMetricsReliable,
    diagnostics: {
      eventsFetched: sortedEvents.length,
      eventsClassified: sortedEvents.filter(e => e.mode !== 'unknown').length,
      openSamples: openSamples.length,
      closedSamples: closedSamples.length,
      basalEvents: sortedEvents.filter(e => e.basalMode != null).length,
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
  const [events, setEvents] = useState<LoopModeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowsFetched, setRowsFetched] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const rows = await fetchDeviceStatusForDateRangeUncached(
          new Date(start.getTime() - LOOP_STATUS_CARRY_FORWARD_MINUTES * 60000),
          end,
          {throwOnError: true},
        );
        const normalized = buildLoopModeEventsFromDeviceStatus(rows);

        if (!cancelled) {
          setRowsFetched(rows.length);
          setEvents(normalized);
          setFetchError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setRowsFetched(0);
          setEvents([]);
          setFetchError(error?.message ?? String(error ?? 'Unknown error'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const stats = useMemo(() => {
    return computeLoopModeStats({
      start,
      end,
      bgData,
      events,
      maxCarryForwardMinutes: LOOP_STATUS_CARRY_FORWARD_MINUTES,
    });
  }, [events, bgData, start, end]);

  return {
    stats,
    isLoading,
    fetchError,
    rowsFetched,
  };
}
