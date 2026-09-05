import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  createNightscoutCacheScope,
  type NightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';
import {
  loadOracleCache,
  syncOracleCache,
} from 'app/services/oracle/oracleCache';

const NOW_MS = Date.parse('2026-08-02T00:00:00.000Z');
const ALPHA_BG_MS = Date.parse('2026-08-01T12:00:00.000Z');
const BETA_BG_MS = Date.parse('2026-08-01T13:00:00.000Z');

const scopeFor = (baseUrl: string): NightscoutCacheScope => {
  const scope = createNightscoutCacheScope(baseUrl);
  if (!scope) throw new Error(`Expected a valid scope for ${baseUrl}`);
  return scope;
};

describe('Oracle cache isolation', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    clearNightscoutInstance();
    await AsyncStorage.clear();
  });

  it('isolates the same Nightscout URL between Firebase accounts', () => {
    const accountA = createNightscoutCacheScope(
      'https://shared.example',
      'firebase-user-a',
    );
    const accountB = createNightscoutCacheScope(
      'https://shared.example',
      'firebase-user-b',
    );

    expect(accountA).not.toBeNull();
    expect(accountB).not.toBeNull();
    expect(accountA?.sourceIdentity).not.toBe(accountB?.sourceIdentity);
    expect(JSON.stringify([accountA, accountB])).not.toContain(
      'https://shared.example',
    );
  });

  afterEach(() => {
    clearNightscoutInstance();
  });

  it('loads only the history cached for the requested Nightscout Source', async () => {
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: ALPHA_BG_MS, sgv: 111}]} as never)
      .mockResolvedValueOnce({data: []} as never)
      .mockResolvedValueOnce({data: []} as never)
      .mockResolvedValueOnce({data: [{date: BETA_BG_MS, sgv: 222}]} as never)
      .mockResolvedValueOnce({data: []} as never)
      .mockResolvedValueOnce({data: []} as never);

    const alphaScope = scopeFor('https://alpha.example');
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    await syncOracleCache({
      scope: alphaScope,
      nowMs: NOW_MS,
      days: 1,
      chunkDays: 1,
    });

    const betaScope = scopeFor('https://beta.example');
    configureNightscoutInstance({baseUrl: 'https://beta.example'});
    await syncOracleCache({
      scope: betaScope,
      nowMs: NOW_MS,
      days: 1,
      chunkDays: 1,
    });

    await expect(loadOracleCache(alphaScope)).resolves.toMatchObject({
      entries: [{date: ALPHA_BG_MS, sgv: 111}],
    });
    await expect(loadOracleCache(betaScope)).resolves.toMatchObject({
      entries: [{date: BETA_BG_MS, sgv: 222}],
    });
  });

  it('abandons a sync if the active Nightscout Source changes mid-flight', async () => {
    const alphaScope = scopeFor('https://alpha.example');
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});

    jest.spyOn(nightscoutInstance, 'get').mockImplementationOnce(async () => {
      configureNightscoutInstance({baseUrl: 'https://beta.example'});
      return {data: [{date: BETA_BG_MS, sgv: 222}]} as never;
    });

    await expect(
      syncOracleCache({
        scope: alphaScope,
        nowMs: NOW_MS,
        days: 1,
        chunkDays: 1,
      }),
    ).rejects.toThrow('Nightscout Source changed during cache sync');

    await expect(loadOracleCache(alphaScope)).resolves.toMatchObject({
      entries: [],
      treatments: [],
      deviceStatus: [],
      meta: null,
    });
  });
});
