import {
  MAX_NIGHTSCOUT_TIMESTAMP_MS,
  parseNightscoutTimestampMs as timestamp,
} from '../../utils/nightscoutTimestamp';
import type {
  DailyInsulinSourceSummary,
  DailyOverviewPeriod,
} from '../../modules/dailyOverview/contracts';

type Treatment = Readonly<Record<string, unknown>>;
interface Interval {
  startMs: number;
  endMs: number;
  units: number;
}
interface IntervalEvent {
  timeMs: number;
  interval: Interval;
  starts: boolean;
}

const number = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
        /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
const startTime = (record: Treatment): number => {
  for (const value of [record.created_at, record.timestamp, record.date]) {
    const parsed = timestamp(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return NaN;
};
const endTime = (record: Treatment, startMs: number): number => {
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
  const duration = record.duration == null ? 0 : number(record.duration);
  if (duration === undefined) {
    return NaN;
  }
  const durationMs = Math.round(duration * 60_000);
  return Number.isFinite(durationMs) &&
    durationMs <= MAX_NIGHTSCOUT_TIMESTAMP_MS - startMs
    ? startMs + durationMs
    : NaN;
};

const deduplicate = (records: readonly Treatment[]): Treatment[] => {
  const byId = new Map<string, Treatment>();
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
  const intervals: Interval[] = [];
  const basalFingerprints = new Set<string>();
  let bolusUnits = 0;
  let bolusKnown = true;
  for (const record of deduplicate(records)) {
    if (record.isValid === false || record.deleted === true) {
      continue;
    }
    const type = typeof record.eventType === 'string' ? record.eventType : '';
    const start = startTime(record);
    const end = endTime(record, start);
    const mutable = record.isMutable === true || record.mutable === true;
    const loop =
      typeof record.enteredBy === 'string' &&
      record.enteredBy.toLowerCase().startsWith('loop://');
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
      const amount =
        record.deliveredUnits != null
          ? number(record.deliveredUnits)
          : number(record.insulin);
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
    if (
      !/^(Temp Basal|Basal)$/i.test(type) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      mutable ||
      end > observedAtMs
    ) {
      continue;
    }
    if (start >= endMs || end <= startMs) {
      continue;
    }
    const amount =
      record.deliveredUnits != null
        ? number(record.deliveredUnits)
        : loop
        ? number(record.amount)
        : undefined;
    if (amount === undefined) {
      continue;
    }
    const fingerprint = `${start}:${end}:${amount}`;
    if (basalFingerprints.has(fingerprint)) {
      continue;
    }
    basalFingerprints.add(fingerprint);
    intervals.push({startMs: start, endMs: end, units: amount});
  }
  const events: IntervalEvent[] = intervals.flatMap(interval => [
    {timeMs: Math.max(startMs, interval.startMs), interval, starts: true},
    {timeMs: Math.min(endMs, interval.endMs), interval, starts: false},
  ]);
  events.sort((left, right) => left.timeMs - right.timeMs);
  const active = new Set<Interval>();
  let basalCoveredMs = 0;
  let basalUnits = 0;
  let left = startMs;
  let index = 0;
  // Sweep the boundaries once. Multiple active records leave that segment unknown.
  while (index < events.length) {
    const right = events[index]!.timeMs;
    if (active.size === 1 && right > left) {
      const interval = active.values().next().value!;
      basalCoveredMs += right - left;
      basalUnits +=
        interval.units * ((right - left) / (interval.endMs - interval.startMs));
    }
    // Apply all changes together, so an end and the next start at one time do not overlap.
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
