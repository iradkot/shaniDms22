import AsyncStorage from '@react-native-async-storage/async-storage';

import type {NightscoutCacheScope} from './nightscoutCacheScope';

export const NIGHTSCOUT_RANGE_CACHE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const NIGHTSCOUT_RANGE_CACHE_MAX_BYTES = 25 * 1024 * 1024;

const CACHE_PREFIX = 'nightscout-range-cache.v1';
const LEGACY_SCOPED_CACHE_PREFIX = 'nightscout-cache.v1:';
const CACHE_VERSION = 1;
const MAX_STORED_RECORDS = 100_000;
const MAX_STORED_WINDOWS = 128;

export interface NightscoutRangeCachePolicy {
  readonly now?: () => number;
  readonly retentionMs?: number;
  readonly maxBytes?: number;
}

export interface NightscoutRangeCacheRead<T> {
  readonly records: readonly T[];
  readonly fetchedAtMs: number;
}

export interface NightscoutRangeCacheReadInput<T> {
  readonly scope: NightscoutCacheScope;
  readonly resource: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly decodeRecord: (value: unknown) => T | null;
  readonly getTimestampMs: (record: T) => number | undefined;
  readonly policy?: NightscoutRangeCachePolicy;
}

export interface NightscoutRangeCacheWriteInput<T> {
  readonly scope: NightscoutCacheScope;
  readonly resource: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly fetchedAtMs: number;
  readonly records: readonly T[];
  readonly getTimestampMs: (record: T) => number | undefined;
  readonly policy?: NightscoutRangeCachePolicy;
}

interface StoredWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly fetchedAtMs: number;
}

interface StoredRecord {
  readonly timestampMs: number;
  readonly value: unknown;
}

interface StoredEnvelope {
  readonly version: 1;
  readonly sourceIdentity: string;
  readonly resource: string;
  readonly updatedAtMs: number;
  readonly lastAccessedAtMs: number;
  readonly windows: readonly StoredWindow[];
  readonly records: readonly StoredRecord[];
}

interface CacheCandidate {
  readonly key: string;
  readonly byteSize: number;
  readonly lastAccessedAtMs: number;
  readonly updatedAtMs: number;
  readonly compactedValue: string;
  readonly windowCount: number;
}

let cacheQueue: Promise<void> = Promise.resolve();

const enqueueCacheOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = cacheQueue.then(operation, operation);
  cacheQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const positiveFiniteNumber = (value: unknown): number | null => {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const resolvePolicy = (policy?: NightscoutRangeCachePolicy) => ({
  now: policy?.now ?? Date.now,
  retentionMs: policy?.retentionMs ?? NIGHTSCOUT_RANGE_CACHE_RETENTION_MS,
  maxBytes: policy?.maxBytes ?? NIGHTSCOUT_RANGE_CACHE_MAX_BYTES,
});

const assertRange = (startMs: number, endMs: number): void => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error('Nightscout cache requires a valid time range.');
  }
};

const assertResource = (resource: string): void => {
  if (!/^[a-z0-9.-]{1,80}$/i.test(resource)) {
    throw new Error('Nightscout cache requires an opaque resource name.');
  }
};

const assertScope = (scope: NightscoutCacheScope): void => {
  if (!/^[a-z0-9._-]{1,160}$/i.test(scope.sourceIdentity)) {
    throw new Error('Nightscout cache requires an opaque source identity.');
  }
};

const cacheKey = (scope: NightscoutCacheScope, resource: string): string =>
  `${CACHE_PREFIX}:${scope.sourceIdentity}:${resource}`;

const legacyCacheKeys = (storageKeys: readonly string[]): string[] =>
  storageKeys.filter(
    candidate =>
      candidate.startsWith('bgData-') ||
      candidate.startsWith('deviceStatus-') ||
      (candidate.startsWith(LEGACY_SCOPED_CACHE_PREFIX) &&
        (candidate.includes(':bg-data.') ||
          candidate.includes(':device-status.'))),
  );

/** Calculates UTF-8 storage bytes without relying on Node-only Buffer. */
const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

const decodeWindow = (value: unknown): StoredWindow | null => {
  if (!isRecord(value)) {
    return null;
  }
  const startMs = finiteNumber(value.startMs);
  const endMs = finiteNumber(value.endMs);
  const fetchedAtMs = positiveFiniteNumber(value.fetchedAtMs);
  if (
    startMs === null ||
    endMs === null ||
    fetchedAtMs === null ||
    endMs < startMs
  ) {
    return null;
  }
  return {startMs, endMs, fetchedAtMs};
};

const decodeStoredRecord = (value: unknown): StoredRecord | null => {
  if (!isRecord(value)) {
    return null;
  }
  const timestampMs = finiteNumber(value.timestampMs);
  if (timestampMs === null || !Object.prototype.hasOwnProperty.call(value, 'value')) {
    return null;
  }
  return {timestampMs, value: value.value};
};

const decodeEnvelope = (
  serialized: string,
  expected?: {readonly scope: NightscoutCacheScope; readonly resource: string},
): StoredEnvelope | null => {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== CACHE_VERSION) {
    return null;
  }
  if (
    typeof value.sourceIdentity !== 'string' ||
    typeof value.resource !== 'string' ||
    (expected !== undefined &&
      (value.sourceIdentity !== expected.scope.sourceIdentity ||
        value.resource !== expected.resource))
  ) {
    return null;
  }
  const updatedAtMs = positiveFiniteNumber(value.updatedAtMs);
  const lastAccessedAtMs = positiveFiniteNumber(value.lastAccessedAtMs);
  if (
    updatedAtMs === null ||
    lastAccessedAtMs === null ||
    !Array.isArray(value.windows) ||
    !Array.isArray(value.records) ||
    value.windows.length > MAX_STORED_WINDOWS ||
    value.records.length > MAX_STORED_RECORDS
  ) {
    return null;
  }
  const windows = value.windows.map(decodeWindow);
  const records = value.records.map(decodeStoredRecord);
  if (windows.some(window => window === null) || records.some(row => row === null)) {
    return null;
  }
  return {
    version: CACHE_VERSION,
    sourceIdentity: value.sourceIdentity,
    resource: value.resource,
    updatedAtMs,
    lastAccessedAtMs,
    windows: windows as StoredWindow[],
    records: records as StoredRecord[],
  };
};

const trimEnvelope = (
  envelope: StoredEnvelope,
  cutoffMs: number,
): StoredEnvelope => ({
  ...envelope,
  windows: envelope.windows
    .filter(window => window.endMs >= cutoffMs)
    .map(window => ({...window, startMs: Math.max(window.startMs, cutoffMs)})),
  records: envelope.records.filter(record => record.timestampMs >= cutoffMs),
});

const windowsCoverRange = (
  windows: readonly StoredWindow[],
  startMs: number,
  endMs: number,
): number | null => {
  const relevant = windows
    .filter(window => window.endMs >= startMs && window.startMs <= endMs)
    .sort((left, right) =>
      left.startMs === right.startMs
        ? left.endMs - right.endMs
        : left.startMs - right.startMs,
    );
  let coveredThrough = startMs;
  let oldestFetch = Number.POSITIVE_INFINITY;
  for (const window of relevant) {
    if (window.startMs > coveredThrough) {
      return null;
    }
    coveredThrough = Math.max(coveredThrough, window.endMs);
    oldestFetch = Math.min(oldestFetch, window.fetchedAtMs);
    if (coveredThrough >= endMs) {
      return oldestFetch;
    }
  }
  return null;
};

const removeOverlappingWindows = (
  windows: readonly StoredWindow[],
  startMs: number,
  endMs: number,
): StoredWindow[] => {
  const next: StoredWindow[] = [];
  for (const window of windows) {
    if (window.endMs < startMs || window.startMs > endMs) {
      next.push(window);
      continue;
    }
    if (window.startMs < startMs) {
      next.push({...window, endMs: startMs});
    }
    if (window.endMs > endMs) {
      next.push({...window, startMs: endMs});
    }
  }
  return next;
};

const cacheCandidate = (
  key: string,
  serialized: string,
  cutoffMs: number,
): CacheCandidate | null => {
  const envelope = decodeEnvelope(serialized);
  if (!envelope) {
    return null;
  }
  const trimmed = trimEnvelope(envelope, cutoffMs);
  const compactedValue = JSON.stringify(trimmed);
  return {
    key,
    byteSize: utf8ByteLength(key) + utf8ByteLength(compactedValue),
    lastAccessedAtMs: trimmed.lastAccessedAtMs,
    updatedAtMs: trimmed.updatedAtMs,
    compactedValue,
    windowCount: trimmed.windows.length,
  };
};

const makeRoomAndStore = async (
  key: string,
  serialized: string,
  nowMs: number,
  retentionMs: number,
  maxBytes: number,
): Promise<void> => {
  const newBytes = utf8ByteLength(key) + utf8ByteLength(serialized);
  const storageKeys = await AsyncStorage.getAllKeys();
  const legacyKeys = legacyCacheKeys(storageKeys);
  const allKeys = storageKeys.filter(candidate =>
    candidate.startsWith(`${CACHE_PREFIX}:`),
  );
  const existing = await AsyncStorage.multiGet(allKeys);
  const corruptKeys: string[] = [];
  const expiredKeys: string[] = [];
  const candidates: CacheCandidate[] = [];
  const cutoffMs = nowMs - retentionMs;
  existing.forEach(([candidateKey, value]) => {
    if (candidateKey === key || value === null) {
      return;
    }
    const candidate = cacheCandidate(candidateKey, value, cutoffMs);
    if (!candidate) {
      corruptKeys.push(candidateKey);
      return;
    }
    if (candidate.windowCount === 0) {
      expiredKeys.push(candidateKey);
      return;
    }
    candidates.push(candidate);
  });

  const retained = candidates;
  const canStoreNewEntry = newBytes <= maxBytes;
  let totalBytes =
    (canStoreNewEntry ? newBytes : 0) +
    retained.reduce((sum, item) => sum + item.byteSize, 0);
  const evictionOrder = [...retained].sort((left, right) =>
    left.lastAccessedAtMs !== right.lastAccessedAtMs
      ? left.lastAccessedAtMs - right.lastAccessedAtMs
      : left.updatedAtMs !== right.updatedAtMs
      ? left.updatedAtMs - right.updatedAtMs
      : left.key.localeCompare(right.key),
  );
  const evictedKeys: string[] = [];
  while (totalBytes > maxBytes && evictionOrder.length > 0) {
    const evicted = evictionOrder.shift();
    if (evicted) {
      totalBytes -= evicted.byteSize;
      evictedKeys.push(evicted.key);
    }
  }

  const keysToRemove = [
    ...new Set([
      ...legacyKeys,
      ...corruptKeys,
      ...expiredKeys,
      ...evictedKeys,
    ]),
  ];
  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
  const removedKeySet = new Set(keysToRemove);
  const compactedUpdates = retained
    .filter(candidate => !removedKeySet.has(candidate.key))
    .map(candidate => [candidate.key, candidate.compactedValue] as [string, string]);
  if (compactedUpdates.length > 0) {
    await AsyncStorage.multiSet(compactedUpdates);
  }
  if (!canStoreNewEntry) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, serialized);
};

export const readNightscoutRangeCache = <T>(
  input: NightscoutRangeCacheReadInput<T>,
): Promise<NightscoutRangeCacheRead<T> | null> =>
  enqueueCacheOperation(async () => {
    assertScope(input.scope);
    assertResource(input.resource);
    assertRange(input.startMs, input.endMs);
    const {now, retentionMs} = resolvePolicy(input.policy);
    const nowMs = now();
    const cutoffMs = nowMs - retentionMs;
    const obsoleteKeys = legacyCacheKeys(await AsyncStorage.getAllKeys());
    if (obsoleteKeys.length > 0) {
      await AsyncStorage.multiRemove(obsoleteKeys);
    }
    if (input.startMs < cutoffMs) {
      return null;
    }
    const key = cacheKey(input.scope, input.resource);
    const serialized = await AsyncStorage.getItem(key);
    if (serialized === null) {
      return null;
    }
    const decoded = decodeEnvelope(serialized, {
      scope: input.scope,
      resource: input.resource,
    });
    if (!decoded) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    const envelope = trimEnvelope(decoded, cutoffMs);
    const fetchedAtMs = windowsCoverRange(
      envelope.windows,
      input.startMs,
      input.endMs,
    );
    if (fetchedAtMs === null) {
      return null;
    }
    const records: T[] = [];
    for (const stored of envelope.records) {
      if (stored.timestampMs < input.startMs || stored.timestampMs > input.endMs) {
        continue;
      }
      const record = input.decodeRecord(stored.value);
      const timestampMs = record === null ? undefined : input.getTimestampMs(record);
      if (
        record === null ||
        timestampMs === undefined ||
        !Number.isFinite(timestampMs) ||
        timestampMs !== stored.timestampMs
      ) {
        await AsyncStorage.removeItem(key);
        return null;
      }
      records.push(record);
    }
    const accessed: StoredEnvelope = {
      ...envelope,
      lastAccessedAtMs: nowMs,
    };
    await AsyncStorage.setItem(key, JSON.stringify(accessed));
    return {records, fetchedAtMs};
  });

export const writeNightscoutRangeCache = <T>(
  input: NightscoutRangeCacheWriteInput<T>,
): Promise<void> =>
  enqueueCacheOperation(async () => {
    assertScope(input.scope);
    assertResource(input.resource);
    assertRange(input.startMs, input.endMs);
    const {now, retentionMs, maxBytes} = resolvePolicy(input.policy);
    const nowMs = now();
    const cutoffMs = nowMs - retentionMs;
    const effectiveStartMs = Math.max(input.startMs, cutoffMs);
    if (input.endMs < effectiveStartMs) {
      return;
    }
    const key = cacheKey(input.scope, input.resource);
    const existingSerialized = await AsyncStorage.getItem(key);
    const existing = existingSerialized
      ? decodeEnvelope(existingSerialized, {
          scope: input.scope,
          resource: input.resource,
        })
      : null;
    const trimmed = existing
      ? trimEnvelope(existing, cutoffMs)
      : {
          version: 1 as const,
          sourceIdentity: input.scope.sourceIdentity,
          resource: input.resource,
          updatedAtMs: nowMs,
          lastAccessedAtMs: nowMs,
          windows: [] as readonly StoredWindow[],
          records: [] as readonly StoredRecord[],
        };
    const recordsOutsideRange = trimmed.records.filter(
      record =>
        record.timestampMs < effectiveStartMs || record.timestampMs > input.endMs,
    );
    const replacementRecords: StoredRecord[] = [];
    input.records.forEach(value => {
      const timestampMs = input.getTimestampMs(value);
      if (
        timestampMs !== undefined &&
        Number.isFinite(timestampMs) &&
        timestampMs >= effectiveStartMs &&
        timestampMs <= input.endMs
      ) {
        replacementRecords.push({timestampMs, value});
      }
    });
    const windows = removeOverlappingWindows(
      trimmed.windows,
      effectiveStartMs,
      input.endMs,
    );
    windows.push({
      startMs: effectiveStartMs,
      endMs: input.endMs,
      fetchedAtMs: input.fetchedAtMs,
    });
    const envelope: StoredEnvelope = {
      version: CACHE_VERSION,
      sourceIdentity: input.scope.sourceIdentity,
      resource: input.resource,
      updatedAtMs: nowMs,
      lastAccessedAtMs: nowMs,
      windows: windows
        .sort((left, right) => left.startMs - right.startMs)
        .slice(-MAX_STORED_WINDOWS),
      records: [...recordsOutsideRange, ...replacementRecords]
        .sort((left, right) => left.timestampMs - right.timestampMs)
        .slice(-MAX_STORED_RECORDS),
    };
    await makeRoomAndStore(
      key,
      JSON.stringify(envelope),
      nowMs,
      retentionMs,
      maxBytes,
    );
  });

export const isNightscoutRangeCacheStorageKey = (key: string): boolean =>
  key.startsWith(`${CACHE_PREFIX}:`);
