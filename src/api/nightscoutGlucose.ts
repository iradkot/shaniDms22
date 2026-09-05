import type {BgSample} from '../types/day_bgs.types';

/** Decode glucose consistently for connection checks and chart data loading. */
export const decodeNightscoutGlucose = (value: unknown): BgSample | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const numberFrom = (field: unknown): number =>
    typeof field === 'number'
      ? field
      : typeof field === 'string' && field.trim().length > 0
      ? Number(field)
      : Number.NaN;
  const date = numberFrom(record.date);
  const sgv = numberFrom(record.sgv);
  if (!Number.isFinite(date) || !Number.isFinite(sgv) || sgv <= 0) {
    return null;
  }
  return {...record, date, sgv} as unknown as BgSample;
};
