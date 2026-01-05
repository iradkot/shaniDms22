import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  fetchBgDataForDateRangeUncached,
  fetchDeviceStatusForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {
  OracleCachedBgEntry,
  OracleCachedDeviceStatus,
  OracleCachedTreatment,
  OracleCacheMeta,
} from './oracleTypes';
import {
  extractLoad,
  getDeviceStatusTimestampMs,
} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';

const ORACLE_CACHE_ENTRIES_KEY = 'oracle.entries.v2';
const ORACLE_CACHE_TREATMENTS_KEY = 'oracle.treatments.v1';
const ORACLE_CACHE_DEVICE_STATUS_KEY = 'oracle.deviceStatus.v1';
const ORACLE_CACHE_META_KEY = 'oracle.meta.v2';

const DAY_MS = 24 * 60 * 60 * 1000;

function clampFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function uniqAndSortByDate(entries: OracleCachedBgEntry[]): OracleCachedBgEntry[] {
  const byTs = new Map<number, number>();
  for (const e of entries) {
    if (!e || typeof e.date !== 'number' || typeof e.sgv !== 'number') continue;
    byTs.set(e.date, e.sgv);
  }
  const merged: OracleCachedBgEntry[] = Array.from(byTs.entries()).map(
    ([date, sgv]) => ({date, sgv}),
  );
  merged.sort((a, b) => a.date - b.date);
  return merged;
}

function uniqAndSortByTs<T extends {ts: number}>(items: T[]): T[] {
  const byTs = new Map<number, T>();
  for (const i of items) {
    if (!i || typeof i.ts !== 'number' || !Number.isFinite(i.ts)) continue;
    byTs.set(i.ts, i);
  }
  const merged = Array.from(byTs.values());
  merged.sort((a, b) => a.ts - b.ts);
  return merged;
}

function parseTreatmentTsMs(t: any): number | null {
  if (typeof t?.mills === 'number' && Number.isFinite(t.mills)) return t.mills;
  if (typeof t?.created_at === 'string') {
    const ms = Date.parse(t.created_at);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof t?.timestamp === 'string') {
    const ms = Date.parse(t.timestamp);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function clampNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

export async function loadOracleCache(): Promise<{
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta | null;
}> {
  try {
    const [rawEntries, rawTreatments, rawDeviceStatus, rawMeta] = await Promise.all([
      AsyncStorage.getItem(ORACLE_CACHE_ENTRIES_KEY),
      AsyncStorage.getItem(ORACLE_CACHE_TREATMENTS_KEY),
      AsyncStorage.getItem(ORACLE_CACHE_DEVICE_STATUS_KEY),
      AsyncStorage.getItem(ORACLE_CACHE_META_KEY),
    ]);

    const entries = rawEntries ? (JSON.parse(rawEntries) as OracleCachedBgEntry[]) : [];
    const treatments = rawTreatments
      ? (JSON.parse(rawTreatments) as OracleCachedTreatment[])
      : [];
    const deviceStatus = rawDeviceStatus
      ? (JSON.parse(rawDeviceStatus) as OracleCachedDeviceStatus[])
      : [];
    const meta = rawMeta ? (JSON.parse(rawMeta) as OracleCacheMeta) : null;

    return {
      entries: Array.isArray(entries) ? entries : [],
      treatments: Array.isArray(treatments) ? treatments : [],
      deviceStatus: Array.isArray(deviceStatus) ? deviceStatus : [],
      meta: meta && meta.version === 2 ? meta : null,
    };
  } catch (e) {
    console.warn('loadOracleCache: Failed reading cache', e);
    return {entries: [], treatments: [], deviceStatus: [], meta: null};
  }
}

async function saveOracleCache(params: {
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta;
}): Promise<void> {
  const {entries, treatments, deviceStatus, meta} = params;
  try {
    await Promise.all([
      AsyncStorage.setItem(ORACLE_CACHE_ENTRIES_KEY, JSON.stringify(entries)),
      AsyncStorage.setItem(ORACLE_CACHE_TREATMENTS_KEY, JSON.stringify(treatments)),
      AsyncStorage.setItem(
        ORACLE_CACHE_DEVICE_STATUS_KEY,
        JSON.stringify(deviceStatus),
      ),
      AsyncStorage.setItem(ORACLE_CACHE_META_KEY, JSON.stringify(meta)),
    ]);
  } catch (e) {
    console.warn('saveOracleCache: Failed writing cache', e);
  }
}

export async function syncOracleCache(params: {
  nowMs?: number;
  days?: number;
} = {}): Promise<{
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta;
  didFullSync: boolean;
}> {
  const nowMs = clampFiniteNumber(params.nowMs) ?? Date.now();
  const days = clampFiniteNumber(params.days) ?? 90;

  const startMs = nowMs - days * DAY_MS;

  const {
    entries: cachedEntries,
    treatments: cachedTreatments,
    deviceStatus: cachedDeviceStatus,
    meta: cachedMeta,
  } = await loadOracleCache();

  const lastSyncedMs = cachedMeta?.lastSyncedMs;
  const hasUsableCache =
    typeof lastSyncedMs === 'number' &&
    Number.isFinite(lastSyncedMs) &&
    cachedEntries.length > 0;

  const didFullSync = !hasUsableCache;

  const fetchStart = didFullSync
    ? new Date(startMs)
    : new Date(Math.max(startMs, lastSyncedMs - 5 * 60 * 1000));
  const fetchEnd = new Date(nowMs);

  const fetched = await fetchBgDataForDateRangeUncached(fetchStart, fetchEnd, {
    // For 90 days we expect ~26k points; keep some slack.
    count: 100000,
  });

  const fetchedSlim: OracleCachedBgEntry[] = fetched
    .filter(e => typeof e?.date === 'number' && typeof e?.sgv === 'number')
    .map(e => ({date: e.date, sgv: e.sgv}));

  const mergedAll = uniqAndSortByDate([...cachedEntries, ...fetchedSlim]).filter(
    e => e.date >= startMs && e.date <= nowMs,
  );

  const fetchedTreatments = await fetchTreatmentsForDateRangeUncached(fetchStart, fetchEnd);
  const fetchedTreatmentsSlim: OracleCachedTreatment[] = fetchedTreatments
    .map(t => {
      const ts = parseTreatmentTsMs(t);
      if (ts == null) return null;
      const insulin =
        clampNonNegativeNumber(t?.insulin) ?? clampNonNegativeNumber(t?.amount);
      const carbs = clampNonNegativeNumber(t?.carbs);
      const eventType = typeof t?.eventType === 'string' ? t.eventType : undefined;
      return {ts, insulin, carbs, eventType} satisfies OracleCachedTreatment;
    })
    .filter(Boolean) as OracleCachedTreatment[];

  const mergedTreatments = uniqAndSortByTs([
    ...cachedTreatments,
    ...fetchedTreatmentsSlim,
  ]).filter(t => t.ts >= startMs && t.ts <= nowMs);

  const fetchedDeviceStatus = await fetchDeviceStatusForDateRangeUncached(fetchStart, fetchEnd);
  const fetchedDeviceStatusSlim: OracleCachedDeviceStatus[] = fetchedDeviceStatus
    .map(s => {
      const ts = getDeviceStatusTimestampMs(s);
      if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
      const load = extractLoad(s);
      if (
        load.iob == null &&
        load.cob == null &&
        load.iobBolus == null &&
        load.iobBasal == null
      ) {
        return null;
      }
      return {
        ts,
        iob: load.iob,
        iobBolus: load.iobBolus,
        iobBasal: load.iobBasal,
        cob: load.cob,
      } satisfies OracleCachedDeviceStatus;
    })
    .filter(Boolean) as OracleCachedDeviceStatus[];

  const mergedDeviceStatus = uniqAndSortByTs([
    ...cachedDeviceStatus,
    ...fetchedDeviceStatusSlim,
  ]).filter(s => s.ts >= startMs && s.ts <= nowMs);

  const meta: OracleCacheMeta = {
    version: 2,
    lastSyncedMs: nowMs,
  };

  await saveOracleCache({
    entries: mergedAll,
    treatments: mergedTreatments,
    deviceStatus: mergedDeviceStatus,
    meta,
  });

  return {
    entries: mergedAll,
    treatments: mergedTreatments,
    deviceStatus: mergedDeviceStatus,
    meta,
    didFullSync,
  };
}
