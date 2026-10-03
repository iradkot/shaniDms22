import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {purgeAccountNightscoutCaches} from 'app/services/nightscoutAccountCleanup';
import {
  createNightscoutCacheScope,
  nightscoutCacheKey,
  type NightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';
import {
  readNightscoutRangeCache,
  writeNightscoutRangeCache,
} from 'app/services/nightscoutRangeCache';
import {loadOracleCache, syncOracleCache} from 'app/services/oracle/oracleCache';

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const fixtureSet = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
const fixtureMultiSet = jest.mocked(AsyncStorage.multiSet).getMockImplementation()!;
const fixtureGet = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
const scope = (url: string, owner: string): NightscoutCacheScope => {
  const value = createNightscoutCacheScope(url, owner);
  if (!value) {throw new Error('Invalid fixture source.');}
  return value;
};
const deferred = () => {
  let release: () => void = () => {throw new Error('Not initialized.');};
  const promise = new Promise<void>(resolve => {release = resolve;});
  return {promise, release};
};
const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve));
const rangeKey = (value: NightscoutCacheScope) =>
  `nightscout-range-cache.v1:${value.sourceIdentity}:bg-data.test`;
const writeRange = (value: NightscoutCacheScope, now = NOW) =>
  writeNightscoutRangeCache({
    scope: value,
    resource: 'bg-data.test',
    startMs: now - DAY,
    endMs: now,
    fetchedAtMs: now,
    records: [{timestampMs: now - DAY, sgv: 111}],
    getTimestampMs: record => record.timestampMs,
    policy: {now: () => now},
  });

describe('account Nightscout cache deletion races', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.setItem).mockImplementation(fixtureSet);
    jest.mocked(AsyncStorage.multiSet).mockImplementation(fixtureMultiSet);
    jest.mocked(AsyncStorage.getItem).mockImplementation(fixtureGet);
    clearNightscoutInstance();
    await AsyncStorage.clear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    clearNightscoutInstance();
  });

  it('uses the exact owner-and-source hash and preserves another owner and unknown legacy data', async () => {
    const deleted = scope('https://shared.example', 'deletion-target');
    const retained = scope('https://shared.example', 'other-owner');
    const targetKeys = [
      nightscoutCacheKey(deleted, 'oracle.entries.v2'),
      nightscoutCacheKey(deleted, 'oracle.meta.v3'),
      rangeKey(deleted),
    ];
    const retainedKeys = [
      nightscoutCacheKey(retained, 'oracle.entries.v2'),
      rangeKey(retained),
      'nightscout-cache.v1:unassigned-legacy:oracle.entries.v1',
      'nightscout-range-cache.v1:unassigned-legacy:bg-data.test',
      'bgData-unowned-legacy',
    ];
    await AsyncStorage.multiSet([...targetKeys, ...retainedKeys].map(key => [key, 'private readings']));

    await purgeAccountNightscoutCaches([deleted.sourceIdentity]);

    for (const key of targetKeys) {
      await expect(AsyncStorage.getItem(key)).resolves.toBeNull();
    }
    for (const key of retainedKeys) {
      await expect(AsyncStorage.getItem(key)).resolves.toBe('private readings');
    }
    await expect(writeRange(deleted)).rejects.toThrow('deletion');
    await expect(readNightscoutRangeCache({
      scope: deleted,
      resource: 'bg-data.test',
      startMs: NOW - DAY,
      endMs: NOW,
      decodeRecord: () => null,
      getTimestampMs: () => undefined,
      policy: {now: () => NOW},
    })).resolves.toBeNull();
  });

  it('drains an in-flight range write and rejects a queued write before removing its namespace', async () => {
    const deleted = scope('https://range-race.example', 'range-race-owner');
    const started = deferred();
    const hold = deferred();
    jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
      if (key === rangeKey(deleted)) {
        started.release();
        await hold.promise;
      }
      return fixtureSet(key, value);
    });
    const active = writeRange(deleted);
    await started.promise;
    const queued = writeRange(deleted).catch(error => error as Error);
    let purged = false;
    const deletion = purgeAccountNightscoutCaches([deleted.sourceIdentity]).then(() => {purged = true;});
    try {
      await flushMicrotasks();
      expect(purged).toBe(false);
    } finally {hold.release();}
    await active;
    expect(await queued).toEqual(expect.objectContaining({message: expect.stringContaining('deletion')}));
    await deletion;
    await expect(AsyncStorage.getItem(rangeKey(deleted))).resolves.toBeNull();
  });

  it('drains another source compacting a deleted range so compaction cannot recreate it after purge', async () => {
    const deleted = scope('https://range-compaction.example', 'compaction-deleted');
    const retained = scope('https://range-compaction.example', 'compaction-retained');
    await writeRange(deleted, NOW - 14 * DAY);
    const started = deferred();
    const hold = deferred();
    jest.spyOn(AsyncStorage, 'multiSet').mockImplementation(async pairs => {
      if (pairs.some(([key]) => key === rangeKey(deleted))) {
        started.release();
        await hold.promise;
      }
      return fixtureMultiSet(pairs);
    });
    const compacting = writeRange(retained);
    await started.promise;
    let purged = false;
    const deletion = purgeAccountNightscoutCaches([deleted.sourceIdentity]).then(() => {purged = true;});
    try {
      await flushMicrotasks();
      expect(purged).toBe(false);
    } finally {hold.release();}
    await compacting;
    await deletion;
    await expect(AsyncStorage.getItem(rangeKey(deleted))).resolves.toBeNull();
    await expect(AsyncStorage.getItem(rangeKey(retained))).resolves.not.toBeNull();
  });

  it('discards a range read already touching its cache when deletion begins', async () => {
    const deleted = scope('https://range-read-race.example', 'range-read-race-owner');
    await writeRange(deleted);
    const started = deferred();
    const hold = deferred();
    jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
      if (key === rangeKey(deleted)) {
        started.release();
        await hold.promise;
      }
      return fixtureSet(key, value);
    });
    const read = readNightscoutRangeCache({
      scope: deleted,
      resource: 'bg-data.test',
      startMs: NOW - DAY,
      endMs: NOW,
      decodeRecord: value => value as {timestampMs: number; sgv: number},
      getTimestampMs: record => record.timestampMs,
      policy: {now: () => NOW},
    });
    await started.promise;
    const deletion = purgeAccountNightscoutCaches([deleted.sourceIdentity]);
    hold.release();
    await expect(read).resolves.toBeNull();
    await deletion;
    await expect(AsyncStorage.getItem(rangeKey(deleted))).resolves.toBeNull();
  });

  it('waits for every parallel Oracle storage write even when another write fails first', async () => {
    const owner = 'oracle-partial-failure';
    const baseUrl = 'https://oracle-partial-failure.example';
    const deleted = scope(baseUrl, owner);
    configureNightscoutInstance({baseUrl, ownerUserId: owner});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: NOW - DAY / 2, sgv: 111}]} as never)
      .mockResolvedValueOnce({data: []} as never)
      .mockResolvedValueOnce({data: []} as never);
    const started = deferred();
    const hold = deferred();
    jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
      if (key === nightscoutCacheKey(deleted, 'oracle.entries.v2')) {
        throw new Error('One storage write failed.');
      }
      if (key === nightscoutCacheKey(deleted, 'oracle.treatments.v2')) {
        started.release();
        await hold.promise;
      }
      return fixtureSet(key, value);
    });
    const sync = syncOracleCache({scope: deleted, nowMs: NOW, days: 1, chunkDays: 1}).catch(error => error as Error);
    await started.promise;
    let purged = false;
    const deletion = purgeAccountNightscoutCaches([deleted.sourceIdentity]).then(() => {purged = true;});
    try {
      await flushMicrotasks();
      expect(purged).toBe(false);
    } finally {hold.release();}
    await sync;
    await deletion;
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter(key => key.includes(`:${deleted.sourceIdentity}:`))).toEqual([]);
  });

  it('rejects Oracle results that arrive after deletion instead of caching or returning them', async () => {
    const owner = 'oracle-delayed-network';
    const baseUrl = 'https://oracle-delayed-network.example';
    const deleted = scope(baseUrl, owner);
    configureNightscoutInstance({baseUrl, ownerUserId: owner});
    const started = deferred();
    const hold = deferred();
    jest.spyOn(nightscoutInstance, 'get').mockImplementationOnce(async () => {
      started.release();
      await hold.promise;
      return {data: [{date: NOW - DAY / 2, sgv: 111}]} as never;
    }).mockResolvedValueOnce({data: []} as never).mockResolvedValueOnce({data: []} as never);
    const sync = syncOracleCache({scope: deleted, nowMs: NOW, days: 1, chunkDays: 1}).catch(error => error as Error);
    await started.promise;
    await purgeAccountNightscoutCaches([deleted.sourceIdentity]);
    hold.release();
    expect(await sync).toEqual(expect.objectContaining({message: expect.stringContaining('deletion')}));
    await expect(loadOracleCache(deleted)).resolves.toEqual({entries: [], treatments: [], deviceStatus: [], meta: null});
    expect((await AsyncStorage.getAllKeys()).filter(key => key.includes(`:${deleted.sourceIdentity}:`))).toEqual([]);
  });

  it('discards Oracle cache contents read before their account was deleted', async () => {
    const deleted = scope('https://oracle-read-race.example', 'oracle-read-race-owner');
    const entriesKey = nightscoutCacheKey(deleted, 'oracle.entries.v2');
    await AsyncStorage.setItem(entriesKey, JSON.stringify([{date: NOW, sgv: 123}]));
    const started = deferred();
    const hold = deferred();
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async key => {
      const captured = await fixtureGet(key);
      if (key === entriesKey) {
        started.release();
        await hold.promise;
      }
      return captured;
    });
    const read = loadOracleCache(deleted);
    await started.promise;
    await purgeAccountNightscoutCaches([deleted.sourceIdentity]);
    hold.release();
    await expect(read).resolves.toEqual({entries: [], treatments: [], deviceStatus: [], meta: null});
  });

  it('rejects a malformed scope list before touching storage', async () => {
    const keys = jest.spyOn(AsyncStorage, 'getAllKeys');
    await expect(purgeAccountNightscoutCaches(['not-an-owned-source'])).rejects.toThrow('Invalid');
    expect(keys).not.toHaveBeenCalled();
  });
});
