import type {EstimatedBasalProfile} from './estimatedBasal';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Decode only the effective profile returned by an as-of Nightscout read. */
export const decodeEstimatedBasalProfile = (
  value: unknown,
  asOfMs: number,
): EstimatedBasalProfile | undefined => {
  const rows = Array.isArray(value) ? value : [value];
  const row = rows[0];
  if (
    !record(row) ||
    typeof row.startDate !== 'string' ||
    !Number.isFinite(Date.parse(row.startDate)) ||
    Date.parse(row.startDate) > asOfMs ||
    typeof row.defaultProfile !== 'string' ||
    !record(row.store)
  ) {
    return undefined;
  }
  const selected = row.store[row.defaultProfile];
  if (
    !record(selected) ||
    !Array.isArray(selected.basal) ||
    selected.basal.length === 0
  ) {
    return undefined;
  }
  const entries: EstimatedBasalProfile['entries'][number][] = [];
  for (const entry of selected.basal) {
    if (
      !record(entry) ||
      typeof entry.time !== 'string' ||
      (typeof entry.value !== 'number' && typeof entry.value !== 'string') ||
      String(entry.value).trim() === '' ||
      !Number.isFinite(Number(entry.value)) ||
      Number(entry.value) < 0 ||
      (entry.timeAsSeconds !== undefined &&
        !Number.isInteger(Number(entry.timeAsSeconds)))
    ) {
      return undefined;
    }
    entries.push({
      time: entry.time,
      value: Number(entry.value),
      ...(entry.timeAsSeconds === undefined
        ? {}
        : {timeAsSeconds: Number(entry.timeAsSeconds)}),
    });
  }
  const timeZone = selected.timezone ?? row.timezone;
  if (
    timeZone !== undefined &&
    (typeof timeZone !== 'string' || timeZone.trim() === '')
  ) {
    return undefined;
  }
  return {entries, ...(typeof timeZone === 'string' ? {timeZone} : {})};
};

type EffectiveProfile = NonNullable<EstimatedBasalProfile['history']>[number];

/** Shared effective-time selection for raw and normalized source adapters. */
const assembleEstimatedBasalProfileHistory = (
  profiles: readonly EffectiveProfile[],
  startMs: number,
  throughMs: number,
): EstimatedBasalProfile | undefined => {
  if (
    !profiles.length ||
    ![startMs, throughMs].every(Number.isFinite) ||
    throughMs < startMs ||
    profiles.some(
      profile =>
        !Number.isFinite(profile.startMs) || profile.startMs > throughMs,
    )
  ) {
    return undefined;
  }
  const history = [...profiles].sort(
    (left, right) => left.startMs - right.startMs,
  );
  const unique: typeof history = [];
  for (const entry of history) {
    const previous = unique[unique.length - 1];
    if (previous?.startMs === entry.startMs) {
      if (JSON.stringify(previous) !== JSON.stringify(entry)) {
        return undefined;
      }
    } else {
      unique.push(entry);
    }
  }
  const carryIn = [...unique].reverse().find(entry => entry.startMs <= startMs);
  if (!carryIn) {
    return undefined;
  }
  return {
    entries: carryIn.entries,
    ...(carryIn.timeZone === undefined ? {} : {timeZone: carryIn.timeZone}),
    history: unique.filter(
      entry => entry === carryIn || entry.startMs > startMs,
    ),
    verifiedThroughMs: throughMs,
  };
};

/** A normalized transport schedule. Missing effective time cannot prove history. */
export interface EffectiveBasalSchedule {
  readonly effectiveFromMs?: number;
  readonly timeZone?: string;
  readonly entries: readonly {
    readonly secondsFromMidnight: number;
    readonly rateUnitsPerHour: number;
  }[];
}

/** Adapt normalized schedules directly, without recreating a Nightscout payload. */
export const buildEstimatedBasalProfileHistoryFromSchedules = (
  schedules: readonly EffectiveBasalSchedule[],
  startMs: number,
  throughMs: number,
): EstimatedBasalProfile | undefined => {
  const profiles: EffectiveProfile[] = [];
  for (const schedule of schedules) {
    const effectiveFromMs = schedule.effectiveFromMs;
    if (
      effectiveFromMs === undefined ||
      !Number.isFinite(effectiveFromMs) ||
      (schedule.timeZone !== undefined && schedule.timeZone.trim() === '') ||
      !schedule.entries.length ||
      schedule.entries.some(
        entry =>
          !Number.isInteger(entry.secondsFromMidnight) ||
          entry.secondsFromMidnight < 0 ||
          entry.secondsFromMidnight >= 86_400 ||
          !Number.isFinite(entry.rateUnitsPerHour) ||
          entry.rateUnitsPerHour < 0,
      )
    ) {
      return undefined;
    }
    const entries = schedule.entries.map(entry => {
      const seconds = entry.secondsFromMidnight;
      const time = [
        Math.floor(seconds / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60,
      ]
        .map(part => String(part).padStart(2, '0'))
        .join(':');
      return {time, timeAsSeconds: seconds, value: entry.rateUnitsPerHour};
    });
    profiles.push({
      startMs: effectiveFromMs,
      entries,
      ...(schedule.timeZone === undefined ? {} : {timeZone: schedule.timeZone}),
    });
  }
  return assembleEstimatedBasalProfileHistory(profiles, startMs, throughMs);
};

/** Decode a verified complete transport history without extending later profiles backwards. */
export const decodeEstimatedBasalProfileHistory = (
  value: unknown,
  startMs: number,
  throughMs: number,
): EstimatedBasalProfile | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const profiles: EffectiveProfile[] = [];
  for (const row of value) {
    const profile = decodeEstimatedBasalProfile(row, throughMs);
    if (!profile || !record(row)) {
      return undefined;
    }
    profiles.push({startMs: Date.parse(String(row.startDate)), ...profile});
  }
  return assembleEstimatedBasalProfileHistory(profiles, startMs, throughMs);
};
