import {BgSample} from 'app/types/day_bgs.types';
import {
  BasalMode,
  LoopHourlyModeProfile,
  LoopMode,
  LoopModeEvent,
  LoopModeStats,
  MIN_BG_SAMPLES_PER_LOOP_MODE,
  MIN_LOOP_KNOWN_COVERAGE_PCT,
} from './loopModeStats.types';

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

function buildEmptyHourlyModeProfile(): LoopHourlyModeProfile[] {
  return Array.from({length: 24}, (_, hour) => ({
    hour,
    openMinutes: 0,
    closedMinutes: 0,
    unknownMinutes: 0,
    totalMinutes: 0,
    openPct: 0,
    closedPct: 0,
    unknownPct: 0,
    dominantMode: 'unknown',
  }));
}

export function computeLoopModeStats({
  start,
  end,
  bgData,
  events,
  maxCarryForwardMinutes = Infinity,
  initialContextLookbackMinutes = maxCarryForwardMinutes,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
  events: LoopModeEvent[];
  maxCarryForwardMinutes?: number;
  initialContextLookbackMinutes?: number;
}): LoopModeStats {
  const startMs = start.getTime();
  const endMs = Math.min(end.getTime(), Date.now());
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const hourlyModeBuckets = buildEmptyHourlyModeProfile();
  const maxCarryForwardMs =
    Number.isFinite(maxCarryForwardMinutes) && maxCarryForwardMinutes >= 0
      ? maxCarryForwardMinutes * 60000
      : Infinity;
  const initialContextLookbackMs =
    Number.isFinite(initialContextLookbackMinutes) &&
    initialContextLookbackMinutes >= 0
      ? initialContextLookbackMinutes * 60000
      : maxCarryForwardMs;
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
      hourlyModeProfile: buildEmptyHourlyModeProfile(),
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
  const getInitialContextCoverageEnd = (event: LoopModeEvent) => {
    if (event.timestamp > startMs) {
      return getModeCoverageEnd(event);
    }

    const initialContextEnd =
      maxCarryForwardMs === Infinity || initialContextLookbackMs === Infinity
        ? Infinity
        : event.timestamp + initialContextLookbackMs;
    return Math.max(getModeCoverageEnd(event), initialContextEnd);
  };

  // Pre-range context can seed only the beginning of the selected range.
  // Later internal gaps still require a fresh status or a duration-backed event.
  for (const event of sortedModeEvents) {
    if (event.timestamp > startMs) {
      break;
    }

    const coverageEnd = getInitialContextCoverageEnd(event);
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
  const addModeSegment = (fromMs: number, toMs: number, mode: LoopMode) => {
    const clampedFrom = Math.max(startMs, fromMs);
    const clampedTo = Math.min(endMs, toMs);
    if (clampedTo <= clampedFrom) {
      return;
    }

    const deltaMin = Math.max(0, Math.round((clampedTo - clampedFrom) / 60000));
    if (mode === 'open') {
      openMinutes += deltaMin;
    } else if (mode === 'closed') {
      closedMinutes += deltaMin;
    } else {
      unknownMinutes += deltaMin;
    }

    let bucketCursor = clampedFrom;
    while (bucketCursor < clampedTo) {
      const bucketDate = new Date(bucketCursor);
      const hour = bucketDate.getHours();
      const nextHour = new Date(bucketCursor);
      nextHour.setHours(hour + 1, 0, 0, 0);
      const bucketEnd = Math.min(clampedTo, nextHour.getTime());
      const bucketMinutes = Math.max(0, (bucketEnd - bucketCursor) / 60000);
      const bucket = hourlyModeBuckets[hour];
      bucket.totalMinutes += bucketMinutes;
      if (mode === 'open') {
        bucket.openMinutes += bucketMinutes;
      } else if (mode === 'closed') {
        bucket.closedMinutes += bucketMinutes;
      } else {
        bucket.unknownMinutes += bucketMinutes;
      }
      bucketCursor = bucketEnd;
    }
  };

  for (const e of sortedModeEvents) {
    if (e.timestamp <= startMs || e.timestamp >= endMs) {
      continue;
    }

    const segmentEnd =
      maxCarryForwardMs === Infinity
        ? e.timestamp
        : Math.min(e.timestamp, currentModeUntil);
    addModeSegment(cursor, segmentEnd, currentMode);
    if (segmentEnd < e.timestamp) {
      addModeSegment(segmentEnd, e.timestamp, 'unknown');
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
  addModeSegment(cursor, tailEnd, currentMode);
  if (tailEnd < endMs) {
    addModeSegment(tailEnd, endMs, 'unknown');
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
    let modeUntil = startMs;
    for (const e of sortedModeEvents) {
      if (e.timestamp <= ts) {
        if (e.timestamp > modeUntil) {
          m = 'unknown';
          modeUntil = e.timestamp;
        }

        const coverageEnd =
          ts >= startMs ? getInitialContextCoverageEnd(e) : getModeCoverageEnd(e);
        const extendsMode = e.mode === m && modeUntil > e.timestamp;
        m = e.mode;
        modeUntil = extendsMode
          ? Math.max(modeUntil, coverageEnd)
          : coverageEnd;
      } else {
        break;
      }
    }
    return modeUntil >= ts ? m : 'unknown';
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
  const hourlyModeProfile = hourlyModeBuckets.map(bucket => {
    const total = Math.max(0, bucket.totalMinutes);
    const openPct = total > 0 ? (bucket.openMinutes / total) * 100 : 0;
    const closedPct = total > 0 ? (bucket.closedMinutes / total) * 100 : 0;
    const bucketUnknownPct =
      total > 0 ? (bucket.unknownMinutes / total) * 100 : 0;
    const dominantMode: LoopMode =
      closedPct >= openPct && closedPct >= bucketUnknownPct
        ? 'closed'
        : openPct >= bucketUnknownPct
          ? 'open'
          : 'unknown';

    return {
      hour: bucket.hour,
      openMinutes: Math.round(bucket.openMinutes),
      closedMinutes: Math.round(bucket.closedMinutes),
      unknownMinutes: Math.round(bucket.unknownMinutes),
      totalMinutes: Math.round(bucket.totalMinutes),
      openPct,
      closedPct,
      unknownPct: bucketUnknownPct,
      dominantMode,
    };
  });

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
    hourlyModeProfile,
    diagnostics: {
      eventsFetched: sortedEvents.length,
      eventsClassified: sortedModeEvents.length,
      openSamples: openSamples.length,
      closedSamples: closedSamples.length,
      basalEvents: sortedEvents.filter(e => e.basalMode != null).length,
    },
  };
}
