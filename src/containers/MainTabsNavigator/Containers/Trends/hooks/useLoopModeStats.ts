import {useEffect, useMemo, useState} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {
  fetchDeviceStatusForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';

export type LoopMode = 'open' | 'closed' | 'unknown';
export type BasalMode = 'temp' | 'suspended' | 'planned' | 'other' | 'unknown';
type LoopModeEvent = {
  timestamp: number;
  mode: LoopMode;
  basalMode?: BasalMode;
  basalDurationMinutes?: number | null;
  modeDurationMinutes?: number | null;
};

export const LOOP_STATUS_CARRY_FORWARD_MINUTES = 20;
export const LOOP_TREATMENT_LOOKBACK_MINUTES = 180;
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

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'on', 'closed', 'closedloop'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'off', 'open', 'openloop'].includes(normalized)) {
      return false;
    }
  }
  return null;
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

  const explicitLoopClosed =
    readBoolean(loop?.closedLoop) ??
    readBoolean(loop?.isClosedLoop) ??
    readBoolean(loop?.dosingEnabled) ??
    readBoolean(loop?.automaticDosingStatus) ??
    readBoolean(loop?.loopStatus) ??
    readBoolean(loop?.status);
  if (explicitLoopClosed != null) {
    return explicitLoopClosed ? 'closed' : 'open';
  }

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

function classifyBasalRecord(
  record: Record<string, unknown> | null,
): {mode: BasalMode; durationMinutes: number | null} | null {
  if (!record) {
    return null;
  }

  const adjustment =
    asRecord(record.tempBasalAdjustment) ??
    asRecord(record.basalAdjustment) ??
    asRecord(record.tempBasal) ??
    record;
  const rate =
    readNumber(adjustment.rate) ??
    readNumber(adjustment.absolute) ??
    readNumber(adjustment.unitsPerHour);
  const duration =
    readNumber(adjustment.duration) ??
    readNumber(adjustment.durationMinutes) ??
    readNumber(adjustment.minutes);

  if (duration == null || duration <= 0) {
    return null;
  }

  return {
    mode: rate === 0 ? 'suspended' : 'temp',
    durationMinutes: duration,
  };
}

function classifyBasalModeFromDeviceStatus(
  entry: DeviceStatusEntry,
): {mode: BasalMode; durationMinutes: number | null} {
  const pump = asRecord(entry.pump);
  if (pump?.suspended === true) {
    return {mode: 'suspended', durationMinutes: null};
  }

  const loop = asRecord(entry.loop);
  const openaps = asRecord(entry.openaps);
  const enacted = asRecord(loop?.enacted) ?? asRecord(openaps?.enacted);
  const enactedReceived = enacted && enacted.received !== false;
  const enactedBasal = classifyBasalRecord(enactedReceived ? enacted : null);
  if (enactedBasal) {
    return enactedBasal;
  }

  const recommendedBasal =
    classifyBasalRecord(asRecord(loop?.automaticDoseRecommendation)) ??
    classifyBasalRecord(asRecord(openaps?.suggested));
  if (recommendedBasal) {
    return recommendedBasal;
  }

  return pump?.suspended === false
    ? {mode: 'planned', durationMinutes: null}
    : {mode: 'unknown', durationMinutes: null};
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

      const basal = classifyBasalModeFromDeviceStatus(entry);
      const mode = classifyModeFromDeviceStatus(entry);

      return {
        timestamp,
        mode,
        basalMode: basal.mode,
        basalDurationMinutes: basal.durationMinutes,
      };
    })
    .filter((event): event is LoopModeEvent => event !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function buildLoopModeEventsFromTreatments(
  treatments: Array<Record<string, unknown>>,
): LoopModeEvent[] {
  return treatments
    .map((treatment): LoopModeEvent | null => {
      const eventType =
        typeof treatment.eventType === 'string'
          ? treatment.eventType.toLowerCase()
          : '';
      const enteredBy =
        typeof treatment.enteredBy === 'string'
          ? treatment.enteredBy.toLowerCase()
          : '';
      const durationMinutes = readNumber(treatment.duration);
      const createdAt =
        typeof treatment.created_at === 'string'
          ? Date.parse(treatment.created_at)
          : NaN;
      const timestamp =
        Number.isFinite(createdAt) && createdAt > 0
          ? createdAt
          : typeof treatment.timestamp === 'string'
            ? Date.parse(treatment.timestamp)
            : NaN;

      if (
        eventType !== 'temp basal' ||
        treatment.automatic !== true ||
        !enteredBy.includes('loop') ||
        durationMinutes == null ||
        durationMinutes <= 0 ||
        !Number.isFinite(timestamp)
      ) {
        return null;
      }

      const rate =
        readNumber(treatment.rate) ??
        readNumber(treatment.absolute) ??
        readNumber(treatment.amount);

      return {
        timestamp,
        mode: 'closed',
        basalMode: rate === 0 ? 'suspended' : 'temp',
        basalDurationMinutes: durationMinutes,
        modeDurationMinutes: durationMinutes,
      };
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
  const endMs = Math.min(end.getTime(), Date.now());
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const maxCarryForwardMs =
    Number.isFinite(maxCarryForwardMinutes) && maxCarryForwardMinutes >= 0
      ? maxCarryForwardMinutes * 60000
      : Infinity;
  const sortedEvents = events
    .filter(e => Number.isFinite(e.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const sortedModeEvents = sortedEvents.filter(e => e.mode !== 'unknown');

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
      unknownBasalMinutes: totalMinutes,
      tempBasalPct: 0,
      suspendedPct: 0,
      plannedBasalPct: 0,
      unknownBasalPct: 100,
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
  let currentModeUntil = startMs;
  const getModeCoverageEnd = (event: LoopModeEvent) => {
    if (maxCarryForwardMs === Infinity) {
      return Infinity;
    }

    const durationMs =
      event.modeDurationMinutes != null && event.modeDurationMinutes > 0
        ? event.modeDurationMinutes * 60000
        : 0;
    return event.timestamp + Math.max(maxCarryForwardMs, durationMs);
  };

  for (const event of sortedModeEvents) {
    if (event.timestamp > startMs) {
      break;
    }

    const coverageEnd = getModeCoverageEnd(event);
    if (coverageEnd >= startMs) {
      if (event.mode === currentMode) {
        currentModeUntil = Math.max(currentModeUntil, coverageEnd);
      } else {
        currentMode = event.mode;
        currentModeUntil = coverageEnd;
      }
    }
  }

  let cursor = startMs;
  let openMinutes = 0;
  let closedMinutes = 0;
  let unknownMinutes = 0;

  for (const e of sortedModeEvents) {
    if (e.timestamp <= startMs || e.timestamp >= endMs) {
      continue;
    }

    const segmentEnd =
      maxCarryForwardMs === Infinity
        ? e.timestamp
        : Math.min(e.timestamp, currentModeUntil);
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

    const nextModeUntil = getModeCoverageEnd(e);
    const extendsCurrentMode = e.mode === currentMode;
    currentMode = e.mode;
    currentModeUntil =
      extendsCurrentMode && currentModeUntil > e.timestamp
        ? Math.max(currentModeUntil, nextModeUntil)
        : nextModeUntil;
    cursor = e.timestamp;
  }

  const tailEnd =
    maxCarryForwardMs === Infinity
      ? endMs
      : Math.min(endMs, currentModeUntil);
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

  const basalTimeline: BasalMode[] = Array.from(
    {length: totalMinutes},
    () => 'unknown',
  );
  const markBasalMinutes = (
    fromMs: number,
    toMs: number,
    mode: BasalMode,
    overwriteTemp = false,
  ) => {
    if (!['temp', 'suspended', 'planned'].includes(mode)) {
      return;
    }

    const fromMinute = Math.max(
      0,
      Math.floor((Math.max(startMs, fromMs) - startMs) / 60000),
    );
    const toMinute = Math.min(
      totalMinutes,
      Math.ceil((Math.min(endMs, toMs) - startMs) / 60000),
    );

    for (let minute = fromMinute; minute < toMinute; minute += 1) {
      if (overwriteTemp || basalTimeline[minute] === 'unknown') {
        basalTimeline[minute] = mode;
      }
    }
  };

  for (let i = 0; i < sortedEvents.length; i += 1) {
    const event = sortedEvents[i];
    if (event.timestamp >= endMs) {
      break;
    }

    const nextTimestamp = sortedEvents[i + 1]?.timestamp ?? endMs;
    const coverageEnd =
      maxCarryForwardMs === Infinity
        ? nextTimestamp
        : Math.min(nextTimestamp, event.timestamp + maxCarryForwardMs);

    if (event.basalMode === 'planned') {
      markBasalMinutes(event.timestamp, coverageEnd, event.basalMode);
    } else if (
      (event.basalMode === 'temp' || event.basalMode === 'suspended') &&
      event.basalDurationMinutes != null &&
      event.basalDurationMinutes > 0
    ) {
      markBasalMinutes(
        event.timestamp + event.basalDurationMinutes * 60000,
        coverageEnd,
        'planned',
      );
    } else if (event.basalMode === 'suspended') {
      markBasalMinutes(event.timestamp, coverageEnd, event.basalMode);
    }
  }

  for (const event of sortedEvents) {
    if (
      event.basalDurationMinutes == null ||
      event.basalDurationMinutes <= 0 ||
      (event.basalMode !== 'temp' && event.basalMode !== 'suspended')
    ) {
      continue;
    }

    markBasalMinutes(
      event.timestamp,
      event.timestamp + event.basalDurationMinutes * 60000,
      event.basalMode,
      true,
    );
  }

  const tempBasalMinutes = basalTimeline.filter(mode => mode === 'temp').length;
  const suspendedMinutes = basalTimeline.filter(
    mode => mode === 'suspended',
  ).length;
  const plannedBasalMinutes = basalTimeline.filter(
    mode => mode === 'planned',
  ).length;
  const unknownBasalMinutes = basalTimeline.filter(
    mode => mode === 'unknown',
  ).length;

  const modeAt = (ts: number): LoopMode => {
    let m: LoopMode = 'unknown';
    for (const e of sortedModeEvents) {
      if (e.timestamp <= ts) {
        const coverageEnd = getModeCoverageEnd(e);
        if (coverageEnd >= ts) {
          m = e.mode;
        }
      } else {
        break;
      }
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
    unknownBasalMinutes,
    tempBasalPct: (tempBasalMinutes / totalMinutes) * 100,
    suspendedPct: (suspendedMinutes / totalMinutes) * 100,
    plannedBasalPct: (plannedBasalMinutes / totalMinutes) * 100,
    unknownBasalPct: (unknownBasalMinutes / totalMinutes) * 100,
    knownMinutes,
    knownCoveragePct,
    unknownPct,
    hasEnoughLoopCoverage,
    openMetricsReliable,
    closedMetricsReliable,
    canCompareOpenClosed: openMetricsReliable && closedMetricsReliable,
    diagnostics: {
      eventsFetched: sortedEvents.length,
      eventsClassified: sortedModeEvents.length,
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
  const [eventsRangeKey, setEventsRangeKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowsFetched, setRowsFetched] = useState(0);
  const rangeKey = `${start.getTime()}-${end.getTime()}`;
  const hasCurrentRangeData = eventsRangeKey === rangeKey;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const deviceStatusFetchStart = new Date(
          start.getTime() - LOOP_STATUS_CARRY_FORWARD_MINUTES * 60000,
        );
        const treatmentFetchStart = new Date(
          start.getTime() - LOOP_TREATMENT_LOOKBACK_MINUTES * 60000,
        );
        const [rows, treatments] = await Promise.all([
          fetchDeviceStatusForDateRangeUncached(deviceStatusFetchStart, end, {
            throwOnError: true,
          }),
          fetchTreatmentsForDateRangeUncached(treatmentFetchStart, end),
        ]);
        const normalized = [
          ...buildLoopModeEventsFromDeviceStatus(rows),
          ...buildLoopModeEventsFromTreatments(treatments),
        ].sort((a, b) => a.timestamp - b.timestamp);

        if (!cancelled) {
          setRowsFetched(rows.length + treatments.length);
          setEvents(normalized);
          setEventsRangeKey(rangeKey);
          setFetchError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setRowsFetched(0);
          setEvents([]);
          setEventsRangeKey(rangeKey);
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
  }, [end, rangeKey, start]);

  const stats = useMemo(() => {
    return computeLoopModeStats({
      start,
      end,
      bgData,
      events: hasCurrentRangeData ? events : [],
      maxCarryForwardMinutes: LOOP_STATUS_CARRY_FORWARD_MINUTES,
    });
  }, [bgData, end, events, hasCurrentRangeData, start]);

  return {
    stats,
    isLoading: isLoading || !hasCurrentRangeData,
    fetchError,
    rowsFetched: hasCurrentRangeData ? rowsFetched : 0,
  };
}
