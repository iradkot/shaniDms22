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
