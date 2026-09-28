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

const number = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
const timestamp = (value: unknown): number =>
  typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Date.parse(value)
    : NaN;
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
  for (const value of [record.endDate, record.endTime]) {
    const parsed = timestamp(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return startMs + (number(record.duration) ?? 0) * 60_000;
};

const deduplicate = (records: readonly Treatment[]): Treatment[] => {
  const byId = new Map<string, Treatment>();
  records.forEach((record, index) => {
    const identity = record.syncIdentifier ?? record.identifier ?? record._id;
    const key =
      typeof identity === 'string' && identity ? identity : `row:${index}`;
    const previous = byId.get(key);
    const revision = (item: Treatment): number =>
      timestamp(item.srvModified ?? item.modified_at) || 0;
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
 * A generic programmed temp rate, profile, or gap cannot establish delivery.
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
      const extended =
        /combo|extended/i.test(type) ||
        record.type === 'square' ||
        record.type === 'dual';
      const overlaps =
        start < endMs &&
        (extended && end > start ? end > startMs : start >= startMs);
      if (!overlaps) {
        continue;
      }
      const amount =
        record.deliveredUnits != null
          ? number(record.deliveredUnits)
          : number(record.insulin);
      if (
        amount === undefined ||
        mutable ||
        end > observedAtMs ||
        record.type === 'dual' ||
        /combo/i.test(type)
      ) {
        bolusKnown = false;
        continue;
      }
      if (extended) {
        if (end <= start) {
          bolusKnown = false;
          continue;
        }
        bolusUnits +=
          (amount * (Math.min(end, endMs) - Math.max(start, startMs))) /
          (end - start);
      } else {
        bolusUnits += amount;
      }
      continue;
    }
    if (
      !/^(Temp Basal|Basal)$/i.test(type) ||
      !Number.isFinite(start) ||
      end <= start ||
      mutable ||
      end > observedAtMs
    ) {
      continue;
    }
    if (start >= endMs || end <= startMs) {
      continue;
    }
    const hasExplicitAmount =
      record.deliveredUnits != null || (loop && record.amount != null);
    const explicitAmount =
      record.deliveredUnits != null
        ? number(record.deliveredUnits)
        : loop
        ? number(record.amount)
        : undefined;
    const absolute = number(record.absolute) ?? number(record.rate);
    const isAbsolute = record.temp === undefined || record.temp === 'absolute';
    const amount = hasExplicitAmount
      ? explicitAmount
      : loop && isAbsolute && absolute !== undefined
      ? (absolute * (end - start)) / 3_600_000
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
  const boundaries = [
    ...new Set([
      startMs,
      endMs,
      ...intervals.flatMap(interval => [
        Math.max(startMs, interval.startMs),
        Math.min(endMs, interval.endMs),
      ]),
    ]),
  ].sort((left, right) => left - right);
  let basalCoveredMs = 0;
  let basalUnits = 0;
  for (let index = 1; index < boundaries.length; index++) {
    const left = boundaries[index - 1]!;
    const right = boundaries[index]!;
    const active = intervals.filter(
      interval => interval.startMs <= left && interval.endMs >= right,
    );
    // Conflicting records do not prove which delivery occurred in the overlap.
    if (active.length !== 1) {
      continue;
    }
    const interval = active[0]!;
    basalCoveredMs += right - left;
    basalUnits +=
      (interval.units * (right - left)) / (interval.endMs - interval.startMs);
  }
  const evidence = {
    basalEvidence: 'recorded' as const,
    basalCoveredMs,
    basalCoveragePercent: Math.min(
      100,
      (basalCoveredMs / (endMs - startMs)) * 100,
    ),
  };
  if (basalCoveredMs === endMs - startMs && bolusKnown) {
    return {quality: 'available', basalUnits, bolusUnits, ...evidence};
  }
  return {
    quality: 'partial',
    ...(basalCoveredMs > 0 ? {basalUnits} : {}),
    ...(bolusKnown ? {bolusUnits} : {}),
    ...evidence,
  };
};
