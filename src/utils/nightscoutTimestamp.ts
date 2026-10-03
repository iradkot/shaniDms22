export const MAX_NIGHTSCOUT_TIMESTAMP_MS = 8.64e15;

/** Same strict epoch-millisecond / ISO timestamp contract as the background adapter. */
export const parseNightscoutTimestampMs = (value: unknown): number => {
  const raw = typeof value === 'string' ? value.trim() : undefined;
  if (typeof value === 'number' || (raw && /^\d+$/.test(raw))) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= MAX_NIGHTSCOUT_TIMESTAMP_MS
      ? parsed
      : NaN;
  }
  const match = raw?.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i,
  );
  if (!match) {
    return NaN;
  }
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const millis = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3));
  const local = new Date(0);
  local.setUTCFullYear(year!, month! - 1, day!);
  local.setUTCHours(hour!, minute!, second!, millis);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() + 1 !== month ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return NaN;
  }
  const zone = match[8]!;
  const zoneHours = /^z$/i.test(zone) ? 0 : Number(zone.slice(1, 3));
  const zoneMinutes = zone.length > 3 ? Number(zone.slice(-2)) : 0;
  if (zoneHours > 23 || zoneMinutes > 59) {
    return NaN;
  }
  const offset = (zoneHours * 60 + zoneMinutes) * (zone[0] === '-' ? -1 : 1);
  const parsed = local.getTime() - offset * 60_000;
  return parsed > 0 && parsed <= MAX_NIGHTSCOUT_TIMESTAMP_MS ? parsed : NaN;
};
