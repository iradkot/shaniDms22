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
import {
  assertActiveNightscoutCacheScope,
  nightscoutCacheKey,
  withNightscoutCacheWrite,
  isNightscoutCacheSourceDeleted,
  type NightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';
import {
  deduplicateInsulinRecords,
  getFinalizedRecordedBolus,
  getInsulinEndMs,
  getInsulinStartMs,
  parseInsulinNumber,
} from 'app/services/insulin/recordedInsulin';
import {parseNightscoutTimestampMs} from 'app/utils/nightscoutTimestamp';
import {mapNightscoutTreatmentsToInsulinDataEntries} from 'app/utils/nightscoutTreatments.utils';

const ORACLE_CACHE_ENTRIES_RESOURCE = 'oracle.entries.v2';
// Older windows could contain an unverified, truncated Nightscout prefix.
const ORACLE_CACHE_TREATMENTS_RESOURCE = 'oracle.treatments.v2';
const ORACLE_CACHE_DEVICE_STATUS_RESOURCE = 'oracle.deviceStatus.v2';
const ORACLE_CACHE_META_RESOURCE = 'oracle.meta.v3';

const DAY_MS = 24 * 60 * 60 * 1000;

const assertActiveScope = (expected: NightscoutCacheScope): void => {
  if (isNightscoutCacheSourceDeleted(expected.sourceIdentity)) {
    throw new Error('Account deletion is in progress.');
  }
  assertActiveNightscoutCacheScope(
    expected,
    'Nightscout Source changed during cache sync',
  );
};

export type OracleCacheSyncProgress = {
  stage: 'bg' | 'treatments' | 'deviceStatus' | 'saving';
  chunkIndex: number;
  chunkCount: number;
  workDone: number;
  workTotal: number;
  percent: number;
  rangeStartMs: number;
  rangeEndMs: number;
  message: string;
};

function clampPercent01(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return 0;
  }
  return Math.max(0, Math.min(1, v));
}

function formatRange(startMs: number, endMs: number): string {
  const start = new Date(startMs);
  const end = new Date(endMs);
  // Keep locale formatting to avoid importing date utils into services.
  return `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;
}

function clampFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function uniqAndSortByDate(
  entries: OracleCachedBgEntry[],
): OracleCachedBgEntry[] {
  const byTs = new Map<number, number>();
  for (const e of entries) {
    if (!e || typeof e.date !== 'number' || typeof e.sgv !== 'number') {
      continue;
    }
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
    if (!i || typeof i.ts !== 'number' || !Number.isFinite(i.ts)) {
      continue;
    }
    byTs.set(i.ts, i);
  }
  const merged = Array.from(byTs.values());
  merged.sort((a, b) => a.ts - b.ts);
  return merged;
}

function normalizeTreatment(
  raw: Record<string, unknown>,
  observedAtMs: number,
  previousById: ReadonlyMap<string, OracleCachedTreatment>,
): OracleCachedTreatment | null {
  const record: Record<string, unknown> = {
    ...raw,
    timestamp: raw.timestamp ?? raw.mills,
  };
  const identity = [record.syncIdentifier, record.identifier, record._id].find(
    value => typeof value === 'string' && value.trim().length > 0,
  );
  const sourceRecordId =
    typeof identity === 'string' ? identity.trim() : undefined;
  const deleted = record.deleted === true || record.isValid === false;
  const eventType =
    typeof record.eventType === 'string' ? record.eventType : undefined;
  let ts = getInsulinStartMs(record);
  if (!Number.isFinite(ts) && deleted && sourceRecordId) {
    ts = previousById.get(sourceRecordId)?.ts ?? NaN;
  }
  if (!Number.isFinite(ts)) {
    if (!deleted && /bolus/i.test(eventType ?? '')) {
      throw new Error('Oracle treatments contain an invalid bolus timestamp.');
    }
    return null;
  }
  const revision = parseNightscoutTimestampMs(record.srvModified);
  const modifiedMs = Number.isFinite(revision)
    ? revision
    : parseNightscoutTimestampMs(record.modified_at);
  const mappedBolus = mapNightscoutTreatmentsToInsulinDataEntries(
    [record],
    observedAtMs,
  ).find(entry => entry.type === 'bolus');
  const finalized = getFinalizedRecordedBolus(record, observedAtMs);
  const endTs = getInsulinEndMs(record, ts);
  const insulin = deleted ? undefined : mappedBolus?.amount ?? finalized?.units;
  const carbs = deleted ? undefined : parseInsulinNumber(record.carbs);
  return {
    ts,
    insulinBasis:
      deleted || !/bolus/i.test(eventType ?? '')
        ? 'none'
        : insulin !== undefined
        ? 'recorded-bolus'
        : 'unknown-bolus',
    ...(sourceRecordId ? {sourceRecordId} : {}),
    ...(Number.isFinite(modifiedMs) ? {sourceModifiedMs: modifiedMs} : {}),
    ...(deleted ? {deleted: true} : {}),
    ...(Number.isFinite(endTs) && endTs > ts ? {endTs} : {}),
    ...(insulin !== undefined ? {insulin} : {}),
    ...(carbs !== undefined ? {carbs} : {}),
    ...(eventType !== undefined ? {eventType} : {}),
  };
}

function mergeTreatments(
  previous: OracleCachedTreatment[],
  incoming: OracleCachedTreatment[],
): OracleCachedTreatment[] {
  const keyed = (items: OracleCachedTreatment[]) => {
    const occurrences = new Map<string, number>();
    return items.map(item => {
      // This is only overlap bookkeeping, not a claimed external identity.
      // Equal anonymous rows within one response retain their multiplicity.
      const fingerprint = JSON.stringify([
        item.ts,
        item.endTs,
        item.eventType,
        item.insulinBasis,
        item.insulin,
        item.carbs,
        item.deleted,
      ]);
      const occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      return {
        _id: item.sourceRecordId
          ? `identified:${item.sourceRecordId}`
          : `anonymous:${fingerprint}:${occurrence}`,
        srvModified: item.sourceModifiedMs,
        item,
      };
    });
  };
  return deduplicateInsulinRecords([...keyed(previous), ...keyed(incoming)])
    .map(record => record.item)
    .sort((a, b) => a.ts - b.ts);
}

const oracleCacheKeys = (scope: NightscoutCacheScope) => ({
  entries: nightscoutCacheKey(scope, ORACLE_CACHE_ENTRIES_RESOURCE),
  treatments: nightscoutCacheKey(scope, ORACLE_CACHE_TREATMENTS_RESOURCE),
  deviceStatus: nightscoutCacheKey(scope, ORACLE_CACHE_DEVICE_STATUS_RESOURCE),
  meta: nightscoutCacheKey(scope, ORACLE_CACHE_META_RESOURCE),
});

export async function loadOracleCache(scope: NightscoutCacheScope): Promise<{
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta | null;
}> {
  if (isNightscoutCacheSourceDeleted(scope.sourceIdentity)) {
    return {entries: [], treatments: [], deviceStatus: [], meta: null};
  }
  try {
    const keys = oracleCacheKeys(scope);
    const [rawEntries, rawTreatments, rawDeviceStatus, rawMeta] =
      await Promise.all([
        AsyncStorage.getItem(keys.entries),
        AsyncStorage.getItem(keys.treatments),
        AsyncStorage.getItem(keys.deviceStatus),
        AsyncStorage.getItem(keys.meta),
      ]);
    if (isNightscoutCacheSourceDeleted(scope.sourceIdentity)) {
      return {entries: [], treatments: [], deviceStatus: [], meta: null};
    }

    const entries = rawEntries
      ? (JSON.parse(rawEntries) as OracleCachedBgEntry[])
      : [];
    const treatments = rawTreatments
      ? (JSON.parse(rawTreatments) as OracleCachedTreatment[])
      : [];
    const deviceStatus = rawDeviceStatus
      ? (JSON.parse(rawDeviceStatus) as OracleCachedDeviceStatus[])
      : [];
    const meta = rawMeta ? (JSON.parse(rawMeta) as OracleCacheMeta) : null;

    // Old caches lost delivered amounts, identities and event units. Refetch them
    // before either matching or a graph can interpret the old values as doses.
    if (
      meta?.version !== 3 ||
      !Array.isArray(treatments) ||
      treatments.some(
        t =>
          !t ||
          !['recorded-bolus', 'unknown-bolus', 'none'].includes(
            t.insulinBasis ?? '',
          ),
      )
    ) {
      return {entries: [], treatments: [], deviceStatus: [], meta: null};
    }

    return {
      entries: Array.isArray(entries) ? entries : [],
      treatments: Array.isArray(treatments) ? treatments : [],
      deviceStatus: Array.isArray(deviceStatus) ? deviceStatus : [],
      meta,
    };
  } catch (e) {
    console.warn('loadOracleCache: Failed reading cache', e);
    return {entries: [], treatments: [], deviceStatus: [], meta: null};
  }
}

async function saveOracleCache(params: {
  scope: NightscoutCacheScope;
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta;
}): Promise<void> {
  const {scope, entries, treatments, deviceStatus, meta} = params;
  try {
    const keys = oracleCacheKeys(scope);
    await withNightscoutCacheWrite(scope, async () => {
      const results = await Promise.allSettled([
        AsyncStorage.setItem(keys.entries, JSON.stringify(entries)),
        AsyncStorage.setItem(keys.treatments, JSON.stringify(treatments)),
        AsyncStorage.setItem(keys.deviceStatus, JSON.stringify(deviceStatus)),
        AsyncStorage.setItem(keys.meta, JSON.stringify(meta)),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        throw failure.reason;
      }
    });
  } catch (e) {
    console.warn('saveOracleCache: Failed writing cache', e);
  }
}

export async function syncOracleCache(params: {
  scope: NightscoutCacheScope;
  nowMs?: number;
  days?: number;
  /** Chunk size (days) for network fetches; smaller = more progress updates. */
  chunkDays?: number;
  onProgress?: (p: OracleCacheSyncProgress) => void;
  /** Return true to cancel this sync. */
  shouldAbort?: () => boolean;
}): Promise<{
  entries: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  meta: OracleCacheMeta;
  didFullSync: boolean;
}> {
  const {scope} = params;
  assertActiveScope(scope);
  const nowMs = clampFiniteNumber(params.nowMs) ?? Date.now();
  const days = clampFiniteNumber(params.days) ?? 90;
  const chunkDays = clampFiniteNumber(params.chunkDays) ?? 14;

  const startMs = nowMs - days * DAY_MS;

  const {
    entries: cachedEntries,
    treatments: cachedTreatments,
    deviceStatus: cachedDeviceStatus,
    meta: cachedMeta,
  } = await loadOracleCache(scope);

  const lastSyncedMs = cachedMeta?.lastSyncedMs;
  const hasUsableCache =
    typeof lastSyncedMs === 'number' &&
    Number.isFinite(lastSyncedMs) &&
    cachedEntries.length > 0;

  const didFullSync = !hasUsableCache;

  const fetchStartMs = didFullSync
    ? startMs
    : Math.max(
        startMs,
        (clampFiniteNumber(lastSyncedMs) ?? nowMs) - 5 * 60 * 1000,
      );
  const fetchEndMs = nowMs;

  const chunkMs = Math.max(1, chunkDays) * DAY_MS;
  const totalSpan = Math.max(0, fetchEndMs - fetchStartMs);
  const observationChunkCount = Math.max(1, Math.ceil(totalSpan / chunkMs));
  const treatmentChunkCount = Math.max(
    1,
    Math.ceil(Math.max(0, nowMs - startMs) / chunkMs),
  );
  const chunkCount = Math.max(observationChunkCount, treatmentChunkCount);

  // Glucose/load observations are incremental. Treatments are mutable historical
  // facts: every successful refresh replaces a complete range, so an old dose's
  // revision or hard deletion cannot remain hidden behind a recent event window.
  const workTotal = observationChunkCount * 2 + treatmentChunkCount + 1;
  let workDone = 0;

  const report = (
    stage: OracleCacheSyncProgress['stage'],
    chunkIndex: number,
    rangeStartMs: number,
    rangeEndMs: number,
    stageChunkCount: number = chunkCount,
  ) => {
    const percent = clampPercent01(workDone / workTotal);
    const stageLabel =
      stage === 'bg'
        ? 'BG'
        : stage === 'treatments'
        ? 'Treatments'
        : stage === 'deviceStatus'
        ? 'Device status'
        : 'Saving';
    const message =
      stage === 'saving'
        ? 'Saving Oracle cache…'
        : `Fetching ${stageLabel} (${
            chunkIndex + 1
          }/${stageChunkCount}) • ${formatRange(rangeStartMs, rangeEndMs)}`;

    params.onProgress?.({
      stage,
      chunkIndex,
      chunkCount: stageChunkCount,
      workDone,
      workTotal,
      percent,
      rangeStartMs,
      rangeEndMs,
      message,
    });
  };

  const fetchedSlimAll: OracleCachedBgEntry[] = [];
  let fetchedTreatmentsSlimAll: OracleCachedTreatment[] = [];
  const previousTreatmentsById = new Map(
    cachedTreatments
      .filter(t => t.sourceRecordId)
      .map(t => [t.sourceRecordId!, t] as const),
  );
  const fetchedDeviceStatusSlimAll: OracleCachedDeviceStatus[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    if (params.shouldAbort?.()) {
      throw new Error('Oracle cache sync aborted');
    }

    const rangeStartMs = fetchStartMs + chunkIndex * chunkMs;
    const rangeEndMs = Math.min(fetchEndMs, rangeStartMs + chunkMs);
    const fetchStart = new Date(rangeStartMs);
    const fetchEnd = new Date(rangeEndMs);

    if (chunkIndex < observationChunkCount) {
      report('bg', chunkIndex, rangeStartMs, rangeEndMs, observationChunkCount);
      const fetched = await fetchBgDataForDateRangeUncached(
        fetchStart,
        fetchEnd,
        {
          // For 90 days we expect ~26k points; keep some slack.
          count: 100000,
        },
      );
      assertActiveScope(scope);
      fetchedSlimAll.push(
        ...fetched
          .filter(
            e => typeof e?.date === 'number' && typeof e?.sgv === 'number',
          )
          .map(e => ({date: e.date, sgv: e.sgv})),
      );
      workDone += 1;
    }

    if (params.shouldAbort?.()) {
      throw new Error('Oracle cache sync aborted');
    }
    if (chunkIndex < treatmentChunkCount) {
      const treatmentStartMs =
        startMs + chunkIndex * chunkMs - (chunkIndex === 0 ? DAY_MS : 0);
      const treatmentEndMs = Math.min(
        nowMs,
        startMs + (chunkIndex + 1) * chunkMs,
      );
      report(
        'treatments',
        chunkIndex,
        treatmentStartMs,
        treatmentEndMs,
        treatmentChunkCount,
      );
      const fetchedTreatments = await fetchTreatmentsForDateRangeUncached(
        new Date(treatmentStartMs),
        new Date(treatmentEndMs),
      );
      assertActiveScope(scope);
      const fetchedTreatmentsSlim = deduplicateInsulinRecords(
        fetchedTreatments.filter(
          t => t && typeof t === 'object' && !Array.isArray(t),
        ),
      )
        .map(t => normalizeTreatment(t, nowMs, previousTreatmentsById))
        .filter((t): t is OracleCachedTreatment => t !== null);
      for (const t of fetchedTreatmentsSlim) {
        if (t.sourceRecordId) {
          previousTreatmentsById.set(t.sourceRecordId, t);
        }
      }
      fetchedTreatmentsSlimAll = mergeTreatments(
        fetchedTreatmentsSlimAll.filter(
          t =>
            t.sourceRecordId ||
            t.ts < treatmentStartMs ||
            t.ts > treatmentEndMs,
        ),
        fetchedTreatmentsSlim,
      );
      workDone += 1;
    }

    if (params.shouldAbort?.()) {
      throw new Error('Oracle cache sync aborted');
    }
    if (chunkIndex < observationChunkCount) {
      report(
        'deviceStatus',
        chunkIndex,
        rangeStartMs,
        rangeEndMs,
        observationChunkCount,
      );
      const fetchedDeviceStatus = await fetchDeviceStatusForDateRangeUncached(
        fetchStart,
        fetchEnd,
      );
      assertActiveScope(scope);
      const fetchedDeviceStatusSlim: OracleCachedDeviceStatus[] =
        fetchedDeviceStatus
          .map(s => {
            const ts = getDeviceStatusTimestampMs(s);
            if (typeof ts !== 'number' || !Number.isFinite(ts)) {
              return null;
            }
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
              ...(load.iob != null ? {iob: load.iob} : {}),
              ...(load.iobBolus != null ? {iobBolus: load.iobBolus} : {}),
              ...(load.iobBasal != null ? {iobBasal: load.iobBasal} : {}),
              ...(load.cob != null ? {cob: load.cob} : {}),
            } satisfies OracleCachedDeviceStatus;
          })
          .filter(Boolean) as OracleCachedDeviceStatus[];
      fetchedDeviceStatusSlimAll.push(...fetchedDeviceStatusSlim);
      workDone += 1;
    }
  }

  const mergedAll = uniqAndSortByDate([
    ...cachedEntries,
    ...fetchedSlimAll,
  ]).filter(e => e.date >= startMs && e.date <= nowMs);

  // Only fresh, complete reads reach this point. Absence from the authoritative
  // range is deletion evidence, including for records that previously had an ID.
  // Keep an interval starting in carry-in when its delivery overlaps the range.
  const mergedTreatments = fetchedTreatmentsSlimAll.filter(
    t => t.ts <= nowMs && (t.ts >= startMs || (t.endTs ?? t.ts) > startMs),
  );

  const mergedDeviceStatus = uniqAndSortByTs([
    ...cachedDeviceStatus,
    ...fetchedDeviceStatusSlimAll,
  ]).filter(s => s.ts >= startMs && s.ts <= nowMs);

  const meta: OracleCacheMeta = {
    version: 3,
    lastSyncedMs: nowMs,
  };

  report('saving', chunkCount - 1, fetchStartMs, fetchEndMs);
  workDone += 1;

  assertActiveScope(scope);
  await saveOracleCache({
    scope,
    entries: mergedAll,
    treatments: mergedTreatments,
    deviceStatus: mergedDeviceStatus,
    meta,
  });
  assertActiveScope(scope);

  return {
    entries: mergedAll,
    treatments: mergedTreatments,
    deviceStatus: mergedDeviceStatus,
    meta,
    didFullSync,
  };
}
