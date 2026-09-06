import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isNightscoutRangeCacheStorageKey,
  readNightscoutRangeCache,
  writeNightscoutRangeCache,
} from 'app/services/nightscoutRangeCache';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const START = NOW - DAY_MS;
const END = NOW;
const alpha = {sourceIdentity: 'alpha_opaque'};
const beta = {sourceIdentity: 'beta_opaque'};

interface Row {
  readonly timestampMs: number;
  readonly value: number;
  readonly padding?: string;
}

const decodeRow = (value: unknown): Row | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<Row>;
  return typeof candidate.timestampMs === 'number' &&
    Number.isFinite(candidate.timestampMs) &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    (candidate.padding === undefined || typeof candidate.padding === 'string')
    ? (candidate as Row)
    : null;
};

const getTimestampMs = (row: Row): number => row.timestampMs;
const policy = {now: () => NOW};

const write = (
  scope: typeof alpha,
  resource: string,
  records: readonly Row[],
  customPolicy = policy,
) =>
  writeNightscoutRangeCache({
    scope,
    resource,
    startMs: START,
    endMs: END,
    fetchedAtMs: NOW - 1_000,
    records,
    getTimestampMs,
    policy: customPolicy,
  });

const read = (scope: typeof alpha, resource: string, customPolicy = policy) =>
  readNightscoutRangeCache({
    scope,
    resource,
    startMs: START,
    endMs: END,
    decodeRecord: decodeRow,
    getTimestampMs,
    policy: customPolicy,
  });

describe('bounded Nightscout range cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('isolates normalized ranges by opaque Nightscout source identity', async () => {
    await AsyncStorage.multiSet([
      ['bgData-legacy-unscoped', '[{"sgv":99}]'],
      ['nightscout-cache.v1:old-source:bg-data.v2:exact-query', '[{"sgv":99}]'],
    ]);
    await write(alpha, 'bg-data.test', [{timestampMs: START, value: 101}]);

    await expect(read(alpha, 'bg-data.test')).resolves.toEqual({
      records: [{timestampMs: START, value: 101}],
      fetchedAtMs: NOW - 1_000,
    });
    await expect(read(beta, 'bg-data.test')).resolves.toBeNull();

    const keys = (await AsyncStorage.getAllKeys()).filter(
      isNightscoutRangeCacheStorageKey,
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('https://');
    await expect(
      AsyncStorage.getItem('bgData-legacy-unscoped'),
    ).resolves.toBeNull();
    await expect(
      AsyncStorage.getItem(
        'nightscout-cache.v1:old-source:bg-data.v2:exact-query',
      ),
    ).resolves.toBeNull();
  });

  it('refuses URLs and credentials as cache source identities', async () => {
    await expect(
      write(
        {sourceIdentity: 'https://secret.example?token=abc'},
        'bg-data.test',
        [{timestampMs: START, value: 101}],
      ),
    ).rejects.toThrow(/opaque source identity/i);
  });

  it('rejects and removes corrupt or wrongly shaped persisted records', async () => {
    await write(alpha, 'bg-data.test', [{timestampMs: START, value: 101}]);
    const key = (await AsyncStorage.getAllKeys()).find(
      isNightscoutRangeCacheStorageKey,
    );
    expect(key).toBeDefined();
    await AsyncStorage.setItem(
      key!,
      JSON.stringify({
        version: 1,
        sourceIdentity: alpha.sourceIdentity,
        resource: 'bg-data.test',
        updatedAtMs: NOW,
        lastAccessedAtMs: NOW,
        windows: [{startMs: START, endMs: END, fetchedAtMs: NOW}],
        records: [{timestampMs: START, value: {timestampMs: 'bad'}}],
      }),
    );

    await expect(read(alpha, 'bg-data.test')).resolves.toBeNull();
    await expect(AsyncStorage.getItem(key!)).resolves.toBeNull();
  });

  it('does not retain or serve ranges older than fourteen days', async () => {
    const oldStart = NOW - 16 * DAY_MS;
    const oldEnd = NOW - 15 * DAY_MS;
    await writeNightscoutRangeCache({
      scope: alpha,
      resource: 'bg-data.test',
      startMs: oldStart,
      endMs: oldEnd,
      fetchedAtMs: NOW,
      records: [{timestampMs: oldStart, value: 90}],
      getTimestampMs,
      policy,
    });
    await AsyncStorage.setItem('deviceStatus-legacy-offline', '[]');

    await expect(
      readNightscoutRangeCache({
        scope: alpha,
        resource: 'bg-data.test',
        startMs: oldStart,
        endMs: oldEnd,
        decodeRecord: decodeRow,
        getTimestampMs,
        policy,
      }),
    ).resolves.toBeNull();
    expect(
      (await AsyncStorage.getAllKeys()).filter(
        isNightscoutRangeCacheStorageKey,
      ),
    ).toHaveLength(0);
    await expect(
      AsyncStorage.getItem('deviceStatus-legacy-offline'),
    ).resolves.toBeNull();
  });

  it('compacts old rows in other source caches while enforcing the global limit', async () => {
    const oldTimestamp = NOW - 20 * DAY_MS;
    const recentTimestamp = NOW - DAY_MS;
    await writeNightscoutRangeCache({
      scope: alpha,
      resource: 'mixed-age-data',
      startMs: oldTimestamp,
      endMs: recentTimestamp,
      fetchedAtMs: NOW - 13 * DAY_MS,
      records: [
        {timestampMs: oldTimestamp, value: 1},
        {timestampMs: recentTimestamp, value: 2},
      ],
      getTimestampMs,
      policy: {now: () => NOW - 13 * DAY_MS},
    });

    await write(beta, 'new-data', [{timestampMs: START, value: 3}]);

    const mixedKey = (await AsyncStorage.getAllKeys()).find(key =>
      key.endsWith(':mixed-age-data'),
    );
    const stored = JSON.parse((await AsyncStorage.getItem(mixedKey!))!) as {
      records: Array<{timestampMs: number}>;
    };
    expect(stored.records).toEqual([
      {timestampMs: recentTimestamp, value: expect.anything()},
    ]);
  });

  it('evicts least-recently-used source resources deterministically at the byte cap', async () => {
    const smallLimit = 1_250;
    const padding = 'x'.repeat(300);
    await write(
      alpha,
      'resource-a',
      [{timestampMs: START, value: 1, padding}],
      {now: () => NOW - 2_000, maxBytes: smallLimit},
    );
    await write(beta, 'resource-b', [{timestampMs: START, value: 2, padding}], {
      now: () => NOW - 1_000,
      maxBytes: smallLimit,
    });
    await write(
      alpha,
      'resource-c',
      [{timestampMs: START, value: 3, padding}],
      {now: () => NOW, maxBytes: smallLimit},
    );

    await expect(
      read(alpha, 'resource-a', {now: () => NOW, maxBytes: smallLimit}),
    ).resolves.toBeNull();
    await expect(
      read(alpha, 'resource-c', {now: () => NOW, maxBytes: smallLimit}),
    ).resolves.toEqual(
      expect.objectContaining({
        records: [expect.objectContaining({value: 3})],
      }),
    );
  });

  it('skips an oversized entry without evicting a valid smaller cache', async () => {
    const maxBytes = 1_000;
    await write(alpha, 'small-data', [{timestampMs: START, value: 1}], {
      now: () => NOW - 1,
      maxBytes,
    });
    await write(
      beta,
      'oversized-data',
      [{timestampMs: START, value: 2, padding: 'x'.repeat(2_000)}],
      {now: () => NOW, maxBytes},
    );

    await expect(
      read(alpha, 'small-data', {now: () => NOW, maxBytes}),
    ).resolves.toEqual(
      expect.objectContaining({
        records: [expect.objectContaining({value: 1})],
      }),
    );
    await expect(
      read(beta, 'oversized-data', {now: () => NOW, maxBytes}),
    ).resolves.toBeNull();
  });

  it('requires complete cached coverage and replaces refreshed windows', async () => {
    const middle = START + DAY_MS / 2;
    await writeNightscoutRangeCache({
      scope: alpha,
      resource: 'bg-data.test',
      startMs: START,
      endMs: middle,
      fetchedAtMs: NOW - 2_000,
      records: [{timestampMs: START, value: 1}],
      getTimestampMs,
      policy,
    });
    await expect(read(alpha, 'bg-data.test')).resolves.toBeNull();

    await writeNightscoutRangeCache({
      scope: alpha,
      resource: 'bg-data.test',
      startMs: START,
      endMs: END,
      fetchedAtMs: NOW - 1_000,
      records: [{timestampMs: END, value: 2}],
      getTimestampMs,
      policy,
    });
    await expect(read(alpha, 'bg-data.test')).resolves.toEqual({
      records: [{timestampMs: END, value: 2}],
      fetchedAtMs: NOW - 1_000,
    });
  });

  it('does not reload or rewrite unrelated unexpired payloads on a range refresh', async () => {
    await write(alpha, 'glucose', [{timestampMs: START, value: 100}]);
    await write(beta, 'device-status', [
      {timestampMs: START, value: 2, padding: 'x'.repeat(100_000)},
    ]);
    const unrelatedKey = (await AsyncStorage.getAllKeys()).find(key =>
      key.endsWith(':device-status'),
    )!;
    const unrelatedBefore = await AsyncStorage.getItem(unrelatedKey);
    jest.mocked(AsyncStorage.multiGet).mockClear();
    jest.mocked(AsyncStorage.multiSet).mockClear();

    await write(alpha, 'glucose', [{timestampMs: START, value: 110}]);

    expect(
      jest.mocked(AsyncStorage.multiGet).mock.calls.flatMap(([keys]) => keys),
    ).not.toContain(unrelatedKey);
    expect(
      jest
        .mocked(AsyncStorage.multiSet)
        .mock.calls.flatMap(([entries]) => entries.map(([key]) => key)),
    ).not.toContain(unrelatedKey);
    expect(await AsyncStorage.getItem(unrelatedKey)).toBe(unrelatedBefore);
    await expect(read(alpha, 'glucose')).resolves.toEqual({
      records: [{timestampMs: START, value: 110}],
      fetchedAtMs: NOW - 1_000,
    });
  });

  it('inspects a persisted resource once without rewriting its unchanged payload', async () => {
    const key = 'nightscout-range-cache.v1:beta_opaque:persisted';
    const serialized = JSON.stringify({
      version: 1,
      sourceIdentity: beta.sourceIdentity,
      resource: 'persisted',
      updatedAtMs: NOW,
      lastAccessedAtMs: NOW,
      windows: [{startMs: START, endMs: END, fetchedAtMs: NOW}],
      records: [{timestampMs: START, value: {timestampMs: START, value: 2}}],
    });
    await AsyncStorage.setItem(key, serialized);
    jest.mocked(AsyncStorage.multiGet).mockClear();
    jest.mocked(AsyncStorage.multiSet).mockClear();

    await write(alpha, 'glucose', [{timestampMs: START, value: 100}]);
    expect(
      jest.mocked(AsyncStorage.multiGet).mock.calls.flatMap(([keys]) => keys),
    ).toContain(key);
    expect(
      jest
        .mocked(AsyncStorage.multiSet)
        .mock.calls.flatMap(([entries]) =>
          entries.map(([entryKey]) => entryKey),
        ),
    ).not.toContain(key);
    expect(await AsyncStorage.getItem(key)).toBe(serialized);
  });

  it('invalidates metadata after storage failure before enforcing the next budget', async () => {
    await write(beta, 'retained', [{timestampMs: START, value: 2}]);
    const retainedKey = (await AsyncStorage.getAllKeys()).find(key =>
      key.endsWith(':retained'),
    )!;
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(
      write(alpha, 'glucose', [{timestampMs: START, value: 100}]),
    ).rejects.toThrow('disk full');
    jest.mocked(AsyncStorage.multiGet).mockClear();

    await write(alpha, 'glucose', [{timestampMs: START, value: 110}]);
    expect(
      jest.mocked(AsyncStorage.multiGet).mock.calls.flatMap(([keys]) => keys),
    ).toContain(retainedKey);
    await expect(read(beta, 'retained')).resolves.toEqual({
      records: [{timestampMs: START, value: 2}],
      fetchedAtMs: NOW - 1_000,
    });
  });

  it('uses a cached read to update resource recency before the next eviction', async () => {
    const maxBytes = 1_500;
    const padding = 'x'.repeat(200);
    await write(
      alpha,
      'recently-read',
      [{timestampMs: START, value: 1, padding}],
      {
        now: () => NOW - 3_000,
        maxBytes,
      },
    );
    await write(beta, 'unused', [{timestampMs: START, value: 2, padding}], {
      now: () => NOW - 2_000,
      maxBytes,
    });
    await expect(
      read(alpha, 'recently-read', {
        now: () => NOW - 1_000,
        maxBytes,
      }),
    ).resolves.not.toBeNull();

    await write(alpha, 'newest', [{timestampMs: START, value: 3, padding}], {
      now: () => NOW,
      maxBytes,
    });

    await expect(read(alpha, 'recently-read')).resolves.not.toBeNull();
    await expect(read(beta, 'unused')).resolves.toBeNull();
    await expect(read(alpha, 'newest')).resolves.not.toBeNull();
  });
});
