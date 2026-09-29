import {decodeNightscoutGlucose} from '../../api/nightscoutGlucose';
import {parseNightscoutTimestampMs} from '../../utils/nightscoutTimestamp';
import {futureLoopPoints} from '../glucoseForecast/nightscout';
import type {
  CurrentDataSnapshot,
  CurrentObservation,
  CurrentReadResult,
} from './types';

export const CURRENT_DATA_FRESHNESS_MS = 15 * 60_000;

/** Earliest expiry among facts that this snapshot explicitly presents as current. */
export const currentFactsExpireAtMs = (
  snapshot: CurrentDataSnapshot,
): number | undefined => {
  const expiries = [snapshot.glucose, snapshot.iob, snapshot.cob].flatMap(
    entry =>
      entry.status === 'fresh' && entry.sourceTimestampMs !== null
        ? [entry.sourceTimestampMs + CURRENT_DATA_FRESHNESS_MS]
        : [],
  );
  return expiries.length ? Math.min(...expiries) : undefined;
};
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const number = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};
const timestamp = (value: unknown, nowMs: number): number | undefined => {
  const parsed = parseNightscoutTimestampMs(value);
  return Number.isFinite(parsed) && parsed <= nowMs ? parsed : undefined;
};
const observation = (
  source: CurrentReadResult | null,
  nowMs: number,
  value: number | undefined,
  sourceTimestampMs: number | undefined,
  missingReason: string,
): CurrentObservation => {
  const fetchedAtMs = source
    ? timestamp(source.freshness.fetchedAtMs, nowMs) ?? null
    : null;
  const ageMs =
    sourceTimestampMs === undefined ? null : nowMs - sourceTimestampMs;
  if (
    !source ||
    value === undefined ||
    sourceTimestampMs === undefined ||
    fetchedAtMs === null
  ) {
    return {
      status: 'unavailable',
      value: null,
      sourceTimestampMs: sourceTimestampMs ?? null,
      fetchedAtMs,
      ageMs,
      reason: !source
        ? 'read-failed'
        : fetchedAtMs === null
        ? 'invalid-fetch-timestamp'
        : missingReason,
    };
  }
  const stale =
    source.freshness.kind === 'stale' || ageMs! >= CURRENT_DATA_FRESHNESS_MS;
  return {
    status: stale ? 'stale' : 'fresh',
    value,
    sourceTimestampMs,
    fetchedAtMs,
    ageMs,
    reason:
      source.freshness.kind === 'stale'
        ? 'cached-after-read-failure'
        : stale
        ? 'old-observation'
        : null,
  };
};

interface LoadCandidate {
  readonly timestampMs: number;
  readonly value: number | undefined;
}

/** Select each reported field using its own source clock, never upload or glucose time. */
const latestLoad = (
  rows: readonly unknown[],
  kind: 'iob' | 'cob',
  nowMs: number,
): LoadCandidate | undefined => {
  let latest: LoadCandidate | undefined;
  for (const raw of rows) {
    const outer = object(raw);
    if (!outer) {
      continue;
    }
    const clockKey = kind === 'iob' ? 'iobTimestampMs' : 'cobTimestampMs';
    const directPair = Object.prototype.hasOwnProperty.call(outer, clockKey);
    const row = directPair ? outer : object(outer.forecastStatus) ?? outer;
    const loop = object(row.loop);
    const openaps = object(row.openaps);
    const payload = directPair
      ? undefined
      : object(loop?.[kind]) ??
        object(openaps?.[kind === 'cob' ? 'meal' : 'iob']) ??
        (kind === 'cob' ? object(openaps?.cob) : undefined);
    const sourceTimestampMs = timestamp(
      payload
        ? payload.timestamp
        : row[kind === 'iob' ? 'iobTimestampMs' : 'cobTimestampMs'],
      nowMs,
    );
    if (
      sourceTimestampMs === undefined ||
      (latest && sourceTimestampMs < latest.timestampMs)
    ) {
      continue;
    }
    const value = number(
      payload ? payload[kind] : row[kind === 'iob' ? 'iobUnits' : 'cobGrams'],
    );
    // Keep the existing supported source bounds. Signed IOB and actual zero are valid.
    const valid =
      value !== undefined &&
      (kind === 'iob' ? Math.abs(value) <= 100 : value >= 0 && value <= 1000);
    // An explicit unknown observation at the newest clock must not resurrect an older value.
    latest = {timestampMs: sourceTimestampMs, value: valid ? value : undefined};
  }
  return latest;
};

const predictionStatus = (
  rows: readonly unknown[],
  nowMs: number,
): Record<string, unknown> | null => {
  let selected: Record<string, unknown> | null = null;
  let selectedTime = -1;
  let fallback: Record<string, unknown> | null = null;
  let fallbackTime = -1;
  for (const raw of rows) {
    const outer = object(raw);
    if (!outer) {
      continue;
    }
    const row = object(outer.forecastStatus) ?? outer;
    const uploadTime = timestamp(
      row.ts ?? row.created_at ?? row.mills ?? row.createdAtMs,
      nowMs,
    );
    if (uploadTime !== undefined && uploadTime > fallbackTime) {
      fallback = row;
      fallbackTime = uploadTime;
    }
    // Reuse the established prediction validation; do not change the forecast model.
    if (!futureLoopPoints(row, nowMs).length) {
      continue;
    }
    const time = timestamp(
      object(row.loop)?.timestamp ?? row.loopTimestampMs,
      nowMs,
    );
    if (time !== undefined && time > selectedTime) {
      selected = row;
      selectedTime = time;
    }
  }
  return selected ?? fallback;
};

export const buildCurrentDataSnapshot = (input: {
  readonly observedAtMs: number;
  readonly glucose: CurrentReadResult | null;
  readonly deviceStatus: CurrentReadResult | null;
}): CurrentDataSnapshot => {
  const {observedAtMs: nowMs, glucose, deviceStatus} = input;
  const validGlucose = (glucose?.records ?? [])
    .flatMap(raw => {
      const reading = decodeNightscoutGlucose(raw);
      if (!reading || timestamp(reading.date, nowMs) === undefined) {
        return [];
      }
      // A CGM row's copied load values do not establish a device observation.
      const clean = {...reading};
      delete clean.iob;
      delete clean.cob;
      delete clean.iobBolus;
      delete clean.iobBasal;
      return [clean];
    })
    .sort((a, b) => b.date - a.date);
  const latest = validGlucose[0] ?? null;
  const rows = deviceStatus?.records ?? [];
  const iob = latestLoad(rows, 'iob', nowMs);
  const cob = latestLoad(rows, 'cob', nowMs);
  return {
    observedAtMs: nowMs,
    glucose: observation(
      glucose,
      nowMs,
      latest?.sgv,
      latest?.date,
      glucose?.records.length ? 'invalid-observation' : 'no-records',
    ),
    iob: observation(
      deviceStatus,
      nowMs,
      iob?.value,
      iob?.timestampMs,
      'missing-valid-field-observation',
    ),
    cob: observation(
      deviceStatus,
      nowMs,
      cob?.value,
      cob?.timestampMs,
      'missing-valid-field-observation',
    ),
    glucoseReading: latest,
    deviceStatus:
      deviceStatus?.freshness.kind === 'fresh'
        ? predictionStatus(rows, nowMs)
        : null,
  };
};

/** Age the original observations after slower work. Never re-stamp or upgrade cached data. */
export const reobserveCurrentData = (
  snapshot: CurrentDataSnapshot,
  observedAtMs: number,
): CurrentDataSnapshot => {
  const age = (entry: CurrentObservation): CurrentObservation => {
    const ageMs =
      entry.sourceTimestampMs === null
        ? null
        : observedAtMs - entry.sourceTimestampMs;
    if (ageMs !== null && ageMs < 0) {
      return {
        ...entry,
        status: 'unavailable',
        value: null,
        ageMs,
        reason: 'future-observation',
      };
    }
    if (
      entry.status === 'fresh' &&
      ageMs !== null &&
      ageMs >= CURRENT_DATA_FRESHNESS_MS
    ) {
      return {...entry, status: 'stale', ageMs, reason: 'old-observation'};
    }
    return {...entry, ageMs};
  };
  return {
    ...snapshot,
    observedAtMs,
    glucose: age(snapshot.glucose),
    iob: age(snapshot.iob),
    cob: age(snapshot.cob),
  };
};
