import {
  MAX_NIGHTSCOUT_TIMESTAMP_MS,
  parseNightscoutTimestampMs as timestamp,
} from '../../utils/nightscoutTimestamp';
import type {
  DailyInsulinSourceSummary,
  DailyOverviewPeriod,
} from '../../modules/dailyOverview/contracts';

type Treatment = Readonly<Record<string, unknown>>;
export interface RecordedBasalInterval {
  startMs: number;
  endMs: number;
  units: number;
}
interface IntervalEvent {
  timeMs: number;
  interval: RecordedBasalInterval;
  starts: boolean;
}

export const parseInsulinNumber = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
        /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
/** An invalid explicit delivery must never fall back to the requested dose. */
export const getRecordedBolusUnits = (record: Treatment): number | undefined =>
  record.deliveredUnits != null
    ? parseInsulinNumber(record.deliveredUnits)
    : parseInsulinNumber(record.insulin);
export const getInsulinStartMs = (record: Treatment): number => {
  for (const value of [record.created_at, record.timestamp, record.date]) {
    const parsed = timestamp(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return NaN;
};
export const getInsulinEndMs = (record: Treatment, startMs: number): number => {
  let hasExplicitEnd = false;
  for (const value of [record.endDate, record.endTime]) {
    hasExplicitEnd ||= value != null;
    const parsed = timestamp(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (hasExplicitEnd) {
    return NaN;
  }
  const duration =
    record.duration == null ? 0 : parseInsulinNumber(record.duration);
  if (duration === undefined) {
    return NaN;
  }
  const durationMs = Math.round(duration * 60_000);
  return Number.isFinite(durationMs) &&
    durationMs <= MAX_NIGHTSCOUT_TIMESTAMP_MS - startMs
    ? startMs + durationMs
    : NaN;
};

/** Same completion rules for charts, timelines and recorded amount summaries. */
export const getFinalizedRecordedBolus = (
  record: Treatment,
  observedAtMs: number,
) => {
  const type = typeof record.eventType === 'string' ? record.eventType : '';
  const startMs = getInsulinStartMs(record);
  const endMs = getInsulinEndMs(record, startMs);
  const units = getRecordedBolusUnits(record);
  if (
    !/bolus/i.test(type) ||
    record.isValid === false ||
    record.deleted === true ||
    record.isMutable === true ||
    record.mutable === true ||
    units === undefined ||
    ![startMs, endMs, observedAtMs].every(Number.isFinite) ||
    endMs < startMs ||
    endMs > observedAtMs ||
    record.type === 'dual' ||
    /combo/i.test(type) ||
    ((/extended/i.test(type) || record.type === 'square') && endMs === startMs)
  )
    return undefined;
  return {startMs, endMs, units};
};

/** A generic treatment's amount may be a percentage or command, not insulin U. */
export const getFinalizedTreatmentInsulinUnits = (
  record: Treatment,
  observedAtMs: number,
): number | undefined => {
  const bolus = getFinalizedRecordedBolus(record, observedAtMs);
  if (bolus) return bolus.units;
  const startMs = getInsulinStartMs(record);
  const endMs = getInsulinEndMs(record, startMs);
  return getRecordedBasalIntervals([record], {startMs, endMs}, observedAtMs)[0]
    ?.units;
};

export const deduplicateInsulinRecords = <T extends Treatment>(
  records: readonly T[],
): T[] => {
  const byId = new Map<string, T>();
  records.forEach((record, index) => {
    const identity = [
      record.syncIdentifier,
      record.identifier,
      record._id,
    ].find(value => typeof value === 'string' && value.trim().length > 0);
    const key = typeof identity === 'string' ? identity.trim() : `row:${index}`;
    const previous = byId.get(key);
    const revision = (item: Treatment): number => {
      const primary = timestamp(item.srvModified);
      return Number.isFinite(primary)
        ? primary
        : timestamp(item.modified_at) || 0;
    };
    if (!previous || revision(record) >= revision(previous)) {
      byId.set(key, record);
    }
  });
  return [...byId.values()];
};

export interface RecordedBasalSegment {
  startMs: number;
  endMs: number;
  /** Undefined means conflicting recorded intervals, rather than an empty gap. */
  units: number | undefined;
}

/** Completed, explicit recorded amounts only; no programmed-rate inference. */
export const getRecordedBasalIntervals = (
  records: readonly Treatment[],
  period: Pick<DailyOverviewPeriod, 'startMs' | 'endMs'>,
  observedAtMs: number,
): RecordedBasalInterval[] => {
  const intervals: RecordedBasalInterval[] = [];
  const fingerprints = new Set<string>();
  for (const record of deduplicateInsulinRecords(records)) {
    if (record.isValid === false || record.deleted === true) {
      continue;
    }
    const type = typeof record.eventType === 'string' ? record.eventType : '';
    const startMs = getInsulinStartMs(record);
    const endMs = getInsulinEndMs(record, startMs);
    if (
      !/^(Temp Basal|Basal)$/i.test(type) ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs ||
      record.isMutable === true ||
      record.mutable === true ||
      endMs > observedAtMs ||
      startMs >= period.endMs ||
      endMs <= period.startMs
    ) {
      continue;
    }
    const loop =
      typeof record.enteredBy === 'string' &&
      record.enteredBy.toLowerCase().startsWith('loop://');
    const units =
      record.deliveredUnits != null
        ? parseInsulinNumber(record.deliveredUnits)
        : loop
        ? parseInsulinNumber(record.amount)
        : undefined;
    if (units === undefined) {
      continue;
    }
    const fingerprint = `${startMs}:${endMs}:${units}`;
    if (!fingerprints.has(fingerprint)) {
      fingerprints.add(fingerprint);
      intervals.push({startMs, endMs, units});
    }
  }
  return intervals;
};

/** Returns recorded spans, including explicit unknown spans for overlaps. */
export const buildRecordedBasalSegments = (
  intervals: readonly RecordedBasalInterval[],
  period: Pick<DailyOverviewPeriod, 'startMs' | 'endMs'>,
): RecordedBasalSegment[] => {
  const {startMs, endMs} = period;
  const events: IntervalEvent[] = intervals.flatMap(interval => [
    {timeMs: Math.max(startMs, interval.startMs), interval, starts: true},
    {timeMs: Math.min(endMs, interval.endMs), interval, starts: false},
  ]);
  events.sort((left, right) => left.timeMs - right.timeMs);
  const active = new Set<RecordedBasalInterval>();
  const segments: RecordedBasalSegment[] = [];
  let left = startMs;
  let index = 0;
  while (index < events.length) {
    const right = events[index]!.timeMs;
    if (active.size > 0 && right > left) {
      const interval = active.values().next().value!;
      segments.push({
        startMs: left,
        endMs: right,
        units:
          active.size === 1
            ? interval.units *
              ((right - left) / (interval.endMs - interval.startMs))
            : undefined,
      });
    }
    // Apply simultaneous boundaries together, without creating a false overlap.
    while (index < events.length && events[index]!.timeMs === right) {
      const event = events[index++]!;
      if (event.starts) {
        active.add(event.interval);
      } else {
        active.delete(event.interval);
      }
    }
    left = right;
  }
  return segments;
};

/**
 * Recorded events only. Loop's uploader exports actual dose start/end and
 * amount=deliveredUnits for temp basals; .basal schedule doses are omitted.
 * https://github.com/LoopKit/NightscoutService/blob/dev/NightscoutServiceKit/Extensions/DoseEntry.swift
 * Only explicit deliveredUnits or Loop amount establishes basal quantity.
 * A programmed rate, profile, elapsed time, or gap cannot establish delivery.
 * When a completed dose crosses a boundary, its recorded total is allocated
 * uniformly across its recorded duration; this does not claim pulse timestamps.
 */
export const buildRecordedInsulinSummary = (
  records: readonly Treatment[],
  period: DailyOverviewPeriod,
  observedAtMs: number,
): DailyInsulinSourceSummary => {
  const {startMs, endMs} = period;
  if (
    ![startMs, endMs, observedAtMs].every(Number.isFinite) ||
    endMs <= startMs
  ) {
    return {quality: 'unavailable'};
  }
  let bolusUnits = 0;
  let bolusKnown = true;
  for (const record of deduplicateInsulinRecords(records)) {
    if (record.isValid === false || record.deleted === true) {
      continue;
    }
    const type = typeof record.eventType === 'string' ? record.eventType : '';
    const start = getInsulinStartMs(record);
    const end = getInsulinEndMs(record, start);
    const mutable = record.isMutable === true || record.mutable === true;
    if (/bolus/i.test(type)) {
      if (!Number.isFinite(start)) {
        bolusKnown = false;
        continue;
      }
      const requiresDuration =
        /combo|extended/i.test(type) ||
        record.type === 'square' ||
        record.type === 'dual';
      const interval = end > start;
      const overlaps =
        start < endMs &&
        (!Number.isFinite(end) ||
          end < start ||
          (interval ? end > startMs : start >= startMs));
      if (!overlaps) {
        continue;
      }
      const amount = getRecordedBolusUnits(record);
      if (
        amount === undefined ||
        !Number.isFinite(end) ||
        end < start ||
        mutable ||
        end > observedAtMs ||
        record.type === 'dual' ||
        /combo/i.test(type)
      ) {
        bolusKnown = false;
        continue;
      }
      if (requiresDuration && !interval) {
        bolusKnown = false;
        continue;
      }
      if (interval) {
        bolusUnits +=
          amount *
          ((Math.min(end, endMs) - Math.max(start, startMs)) / (end - start));
      } else {
        bolusUnits += amount;
      }
      continue;
    }
  }
  let basalCoveredMs = 0;
  let basalUnits = 0;
  const segments = buildRecordedBasalSegments(
    getRecordedBasalIntervals(records, period, observedAtMs),
    period,
  );
  for (const segment of segments) {
    if (segment.units !== undefined) {
      basalCoveredMs += segment.endMs - segment.startMs;
      basalUnits += segment.units;
    }
  }
  const evidence = {
    basalEvidence: 'recorded' as const,
    basalCoveredMs,
    basalCoveragePercent: Math.min(
      100,
      (basalCoveredMs / (endMs - startMs)) * 100,
    ),
  };
  const basalKnown = basalCoveredMs > 0 && Number.isFinite(basalUnits);
  bolusKnown &&= Number.isFinite(bolusUnits);
  if (
    basalCoveredMs === endMs - startMs &&
    basalKnown &&
    bolusKnown &&
    Number.isFinite(basalUnits + bolusUnits)
  ) {
    return {quality: 'available', basalUnits, bolusUnits, ...evidence};
  }
  return {
    quality: 'partial',
    ...(basalKnown ? {basalUnits} : {}),
    ...(bolusKnown ? {bolusUnits} : {}),
    ...evidence,
  };
};
