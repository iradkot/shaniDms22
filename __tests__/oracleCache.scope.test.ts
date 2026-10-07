import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  createNightscoutCacheScope,
  nightscoutCacheKey,
  type NightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';
import {
  loadOracleCache,
  syncOracleCache,
} from 'app/services/oracle/oracleCache';
import {oracleTreatmentsToCgmInputs} from 'app/services/oracle/oracleCgmGraphAdapter';

const NOW_MS = Date.parse('2026-08-02T00:00:00.000Z');
const ALPHA_BG_MS = Date.parse('2026-08-01T12:00:00.000Z');
const BETA_BG_MS = Date.parse('2026-08-01T13:00:00.000Z');

const scopeFor = (baseUrl: string): NightscoutCacheScope => {
  const scope = createNightscoutCacheScope(baseUrl);
  if (!scope) {
    throw new Error(`Expected a valid scope for ${baseUrl}`);
  }
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

  it('renders only finalized recorded boluses from synced Nightscout treatments', async () => {
    const baseUrl = 'https://recorded-delivery.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const ts = ALPHA_BG_MS;
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: ts, sgv: 111}]} as never)
      .mockResolvedValueOnce({
        data: [
          {
            _id: 'basal',
            eventType: 'Temp Basal',
            created_at: new Date(ts).toISOString(),
            rate: 3.2,
            amount: 1.6,
            duration: 30,
            enteredBy: 'loop://phone',
          },
          {
            _id: 'interrupted',
            eventType: 'Correction Bolus',
            created_at: new Date(ts + 60_000).toISOString(),
            insulin: 0.5,
            deliveredUnits: 0.05,
          },
          {
            _id: 'simultaneous-a',
            eventType: 'Meal Bolus',
            created_at: new Date(ts + 120_000).toISOString(),
            insulin: 1,
          },
          {
            _id: 'simultaneous-b',
            eventType: 'Correction Bolus',
            created_at: new Date(ts + 120_000).toISOString(),
            insulin: 2,
          },
          {
            _id: 'deleted',
            eventType: 'Correction Bolus',
            created_at: new Date(ts + 180_000).toISOString(),
            insulin: 99,
            deleted: true,
          },
        ],
      } as never)
      .mockResolvedValueOnce({data: []} as never);

    await syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1});
    const cache = await loadOracleCache(scope);
    const graph = oracleTreatmentsToCgmInputs({
      treatments: cache.treatments,
      idPrefix: 'recorded',
    });
    expect(graph.insulinData.map(entry => entry.amount)).toEqual([0.05, 1, 2]);
    expect(graph.insulinData.every(entry => entry.type === 'bolus')).toBe(true);
  });

  it('invalidates old dose caches before a graph or history matching can read them', async () => {
    const scope = scopeFor('https://old-dose-cache.example');
    await AsyncStorage.setItem(
      nightscoutCacheKey(scope, 'oracle.entries.v2'),
      JSON.stringify([{date: ALPHA_BG_MS, sgv: 111}]),
    );
    await AsyncStorage.setItem(
      nightscoutCacheKey(scope, 'oracle.treatments.v2'),
      JSON.stringify([
        {ts: ALPHA_BG_MS, eventType: 'Temp Basal', insulin: 3.2},
      ]),
    );
    await AsyncStorage.setItem(
      nightscoutCacheKey(scope, 'oracle.meta.v3'),
      JSON.stringify({version: 2, lastSyncedMs: NOW_MS}),
    );
    await expect(loadOracleCache(scope)).resolves.toEqual({
      entries: [],
      treatments: [],
      deviceStatus: [],
      meta: null,
    });
  });

  it('keeps the newest delivery revision and its later deletion across incremental syncs', async () => {
    const baseUrl = 'https://delivery-revisions.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const ts = NOW_MS - 2 * 60_000;
    const dose = {
      _id: 'same-dose',
      eventType: 'Correction Bolus',
      created_at: new Date(ts).toISOString(),
      insulin: 0.5,
    };
    const bgResponse = {data: [{date: ts, sgv: 111}]} as never;
    const emptyResponse = {data: []} as never;
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce(bgResponse)
      .mockResolvedValueOnce({
        data: [{...dose, deliveredUnits: 0.5, srvModified: ts}],
      } as never)
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce(bgResponse)
      .mockResolvedValueOnce({
        data: [
          {...dose, deliveredUnits: 0.05, srvModified: ts + 60_000},
          {...dose, deliveredUnits: 0.5, srvModified: ts},
        ],
      } as never)
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce(bgResponse)
      .mockResolvedValueOnce({
        data: [{_id: dose._id, deleted: true, srvModified: ts + 120_000}],
      } as never)
      .mockResolvedValueOnce(emptyResponse);

    await syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1});
    const revised = await syncOracleCache({
      scope,
      nowMs: NOW_MS,
      days: 1,
      chunkDays: 1,
    });
    expect(revised.didFullSync).toBe(false);
    expect(
      oracleTreatmentsToCgmInputs({
        treatments: revised.treatments,
        idPrefix: 'revision',
      }).insulinData.map(entry => entry.amount),
    ).toEqual([0.05]);
    await syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1});
    const deleted = await loadOracleCache(scope);
    expect(deleted.treatments).toHaveLength(1);
    expect(deleted.treatments[0]).toMatchObject({
      sourceRecordId: 'same-dose',
      deleted: true,
      insulinBasis: 'none',
    });
    expect(
      oracleTreatmentsToCgmInputs({
        treatments: deleted.treatments,
        idPrefix: 'revision',
      }).insulinData,
    ).toEqual([]);
  });

  it('rejects a treatment window whose active bolus timestamp cannot be validated', async () => {
    const baseUrl = 'https://invalid-bolus-time.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: ALPHA_BG_MS, sgv: 111}]} as never)
      .mockResolvedValueOnce({
        data: [
          {
            _id: 'invalid-time',
            eventType: 'Correction Bolus',
            created_at: '2026-02-30T12:00:00Z',
            insulin: 5,
          },
        ],
      } as never)
      .mockResolvedValueOnce({data: []} as never);
    await expect(
      syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1}),
    ).rejects.toThrow('invalid bolus timestamp');
    await expect(loadOracleCache(scope)).resolves.toMatchObject({
      entries: [],
      treatments: [],
      meta: null,
    });
  });

  it.each([1, 2])(
    'does not add repeated anonymous overlap rows while preserving %i same-response anonymous doses',
    async anonymousCount => {
      const baseUrl = `https://anonymous-overlap-${anonymousCount}.example`;
      configureNightscoutInstance({baseUrl});
      const scope = scopeFor(baseUrl);
      const ts = NOW_MS - 2 * 60_000;
      const anonymousDose = {
        eventType: 'Correction Bolus',
        created_at: new Date(ts).toISOString(),
        insulin: 2,
      };
      const treatments = [
        ...Array.from({length: anonymousCount}, () => ({...anonymousDose})),
        {...anonymousDose, _id: 'identified-a'},
        {...anonymousDose, _id: 'identified-b'},
      ];
      jest
        .spyOn(nightscoutInstance, 'get')
        .mockResolvedValueOnce({data: [{date: ts, sgv: 111}]} as never)
        .mockResolvedValueOnce({data: treatments} as never)
        .mockResolvedValueOnce({data: []} as never)
        .mockResolvedValueOnce({data: [{date: ts, sgv: 111}]} as never)
        .mockResolvedValueOnce({data: treatments} as never)
        .mockResolvedValueOnce({data: []} as never);
      await syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1});
      const repeated = await syncOracleCache({
        scope,
        nowMs: NOW_MS,
        days: 1,
        chunkDays: 1,
      });
      expect(repeated.didFullSync).toBe(false);
      const graph = oracleTreatmentsToCgmInputs({
        treatments: repeated.treatments,
        idPrefix: 'overlap',
      });
      expect(graph.insulinData.map(entry => entry.amount)).toEqual(
        Array(anonymousCount + 2).fill(2),
      );
    },
  );

  it.each([true, false])(
    'refetches an unresolved older extended dose and uses its finalized source revision (identity: %s)',
    async identified => {
      const baseUrl = `https://unfinished-delivery-${identified}.example`;
      configureNightscoutInstance({baseUrl});
      const scope = scopeFor(baseUrl);
      const started = Date.parse('2026-08-01T09:30:00Z');
      const firstNow = Date.parse('2026-08-01T10:00:00Z');
      const secondNow = Date.parse('2026-08-01T10:10:00Z');
      const sourceDose = {
        ...(identified ? {_id: 'extended-dose'} : {}),
        eventType: 'Extended Bolus',
        created_at: new Date(started).toISOString(),
        insulin: 5,
      };
      const get = jest
        .spyOn(nightscoutInstance, 'get')
        .mockResolvedValueOnce({data: [{date: started, sgv: 111}]} as never)
        .mockResolvedValueOnce({
          data: [
            {
              ...sourceDose,
              endDate: '2026-08-01T10:30:00Z',
              isMutable: true,
              deliveredUnits: 1,
              srvModified: started,
            },
          ],
        } as never)
        .mockResolvedValueOnce({data: []} as never)
        .mockResolvedValueOnce({data: [{date: started, sgv: 111}]} as never)
        .mockResolvedValueOnce({
          data: [
            {
              ...sourceDose,
              endDate: '2026-08-01T10:05:00Z',
              isMutable: false,
              deliveredUnits: 2,
              srvModified: '2026-08-01T10:07:00Z',
            },
          ],
        } as never)
        .mockResolvedValueOnce({data: []} as never);
      const unfinished = await syncOracleCache({
        scope,
        nowMs: firstNow,
        days: 1,
        chunkDays: 1,
      });
      expect(unfinished.treatments[0]?.insulinBasis).toBe('unknown-bolus');
      expect(
        oracleTreatmentsToCgmInputs({
          treatments: unfinished.treatments,
          idPrefix: 'unfinished',
        }).insulinData,
      ).toEqual([]);
      const finalized = await syncOracleCache({
        scope,
        nowMs: secondNow,
        days: 1,
        chunkDays: 1,
      });
      expect(get.mock.calls[4]?.[0]).toContain(
        `find[created_at][$gte]=${new Date(
          secondNow - 2 * 24 * 60 * 60_000,
        ).toISOString()}`,
      );
      expect(finalized.treatments).toHaveLength(1);
      expect(finalized.treatments[0]).toMatchObject({
        insulinBasis: 'recorded-bolus',
        insulin: 2,
      });
      expect(
        oracleTreatmentsToCgmInputs({
          treatments: finalized.treatments,
          idPrefix: 'finished',
        }).insulinData[0],
      ).toMatchObject({amount: 2, duration: 35});
    },
  );

  it('refreshes older finalized revisions and removes hard-deleted identified doses while glucose stays incremental', async () => {
    const baseUrl = 'https://historical-revisions.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const ts = NOW_MS - 12 * 60 * 60_000;
    const dose = {
      _id: 'historical-dose',
      eventType: 'Correction Bolus',
      created_at: new Date(ts).toISOString(),
      insulin: 2,
    };
    let sourceTreatments: Record<string, unknown>[] = [
      {...dose, deliveredUnits: 2, srvModified: ts},
    ];
    const get = jest
      .spyOn(nightscoutInstance, 'get')
      .mockImplementation(async url => {
        if (String(url).startsWith('/api/v1/entries?')) {
          return {data: [{date: ts, sgv: 111}]} as never;
        }
        if (String(url).startsWith('/api/v1/treatments?')) {
          return {data: sourceTreatments} as never;
        }
        return {data: []} as never;
      });
    await syncOracleCache({scope, nowMs: NOW_MS, days: 1, chunkDays: 1});

    const laterNow = NOW_MS + 10 * 60_000;
    sourceTreatments = [
      {...dose, deliveredUnits: 1, srvModified: laterNow - 60_000},
    ];
    get.mockClear();
    const revised = await syncOracleCache({
      scope,
      nowMs: laterNow,
      days: 1,
      chunkDays: 1,
    });
    expect(revised.didFullSync).toBe(false);
    expect(revised.treatments).toMatchObject([
      {sourceRecordId: 'historical-dose', insulin: 1},
    ]);
    const requested = get.mock.calls.map(([url]) => String(url));
    expect(requested.find(url => url.startsWith('/api/v1/entries?'))).toContain(
      `find[date][$gte]=${NOW_MS - 5 * 60_000}`,
    );
    expect(
      requested.find(url => url.startsWith('/api/v1/treatments?')),
    ).toContain(
      `find[created_at][$gte]=${new Date(
        laterNow - 2 * 24 * 60 * 60_000,
      ).toISOString()}`,
    );

    sourceTreatments = [];
    const deleted = await syncOracleCache({
      scope,
      nowMs: laterNow + 60_000,
      days: 1,
      chunkDays: 1,
    });
    expect(deleted.treatments).toEqual([]);
  });

  it('retains an interval starting before the analysis range when its recorded delivery crosses the boundary', async () => {
    const baseUrl = 'https://recorded-carry-in.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const startMs = NOW_MS - 24 * 60 * 60_000;
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: ALPHA_BG_MS, sgv: 111}]} as never)
      .mockResolvedValueOnce({
        data: [
          {
            _id: 'carry-in',
            eventType: 'Extended Bolus',
            created_at: new Date(startMs - 15 * 60_000).toISOString(),
            endDate: new Date(startMs + 15 * 60_000).toISOString(),
            deliveredUnits: 2,
          },
          {
            _id: 'old-instant',
            eventType: 'Bolus',
            created_at: new Date(startMs - 15 * 60_000).toISOString(),
            deliveredUnits: 2,
          },
        ],
      } as never)
      .mockResolvedValueOnce({data: []} as never);
    const cache = await syncOracleCache({
      scope,
      nowMs: NOW_MS,
      days: 1,
      chunkDays: 1,
    });
    expect(cache.treatments).toHaveLength(1);
    expect(cache.treatments[0]).toMatchObject({
      sourceRecordId: 'carry-in',
      insulin: 2,
      endTs: startMs + 15 * 60_000,
    });
  });

  it('refreshes every historical treatment chunk and preserves anonymous dose multiplicity at inclusive boundaries', async () => {
    const baseUrl = 'https://chunked-historical-refresh.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const dayMs = 24 * 60 * 60_000;
    const boundaryMs = NOW_MS - 2 * dayMs;
    const anonymousDose = {
      eventType: 'Bolus',
      created_at: new Date(boundaryMs).toISOString(),
      deliveredUnits: 2,
    };
    let recordedUnits = 2;
    const get = jest
      .spyOn(nightscoutInstance, 'get')
      .mockImplementation(async url => {
        const request = String(url);
        if (request.startsWith('/api/v1/entries?')) {
          return {data: [{date: ALPHA_BG_MS, sgv: 111}]} as never;
        }
        if (!request.startsWith('/api/v1/treatments?')) {
          return {data: []} as never;
        }
        const fromMs = Date.parse(
          request.match(/find\[created_at\]\[\$gte\]=([^&]+)/)?.[1] ?? '',
        );
        const toMs = Date.parse(
          request.match(/find\[created_at\]\[\$lte\]=([^&]+)/)?.[1] ?? '',
        );
        const rows = [
          {...anonymousDose},
          {...anonymousDose},
          {
            _id: 'older-complete',
            eventType: 'Bolus',
            created_at: new Date(NOW_MS - 2.5 * dayMs).toISOString(),
            deliveredUnits: recordedUnits,
          },
        ];
        return {
          data: rows.filter(row => {
            const ts = Date.parse(row.created_at);
            return ts >= fromMs && ts <= toMs;
          }),
        } as never;
      });
    await syncOracleCache({scope, nowMs: NOW_MS, days: 3, chunkDays: 1});
    recordedUnits = 1;
    get.mockClear();
    const revised = await syncOracleCache({
      scope,
      nowMs: NOW_MS,
      days: 3,
      chunkDays: 1,
    });
    const requests = get.mock.calls.map(([url]) => String(url));
    expect(
      requests.filter(url => url.startsWith('/api/v1/treatments?')),
    ).toHaveLength(3);
    expect(
      requests.filter(url => url.startsWith('/api/v1/entries?')),
    ).toHaveLength(1);
    expect(
      requests.filter(url => url.startsWith('/api/v1/devicestatus?')),
    ).toHaveLength(1);
    expect(
      oracleTreatmentsToCgmInputs({
        treatments: revised.treatments,
        idPrefix: 'chunks',
      }).insulinData.map(dose => dose.amount),
    ).toEqual([1, 2, 2]);
  });

  it('does not advance cache observation or remove doses when the authoritative treatment refresh fails', async () => {
    const baseUrl = 'https://failed-historical-refresh.example';
    configureNightscoutInstance({baseUrl});
    const scope = scopeFor(baseUrl);
    const get = jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: ALPHA_BG_MS, sgv: 111}]} as never)
      .mockResolvedValueOnce({
        data: [
          {
            _id: 'kept',
            eventType: 'Bolus',
            created_at: new Date(ALPHA_BG_MS).toISOString(),
            deliveredUnits: 2,
          },
        ],
      } as never)
      .mockResolvedValueOnce({data: []} as never);
    const original = await syncOracleCache({
      scope,
      nowMs: NOW_MS,
      days: 1,
      chunkDays: 1,
    });
    get
      .mockResolvedValueOnce({data: []} as never)
      .mockRejectedValueOnce(new Error('Treatment history unavailable'));
    await expect(
      syncOracleCache({
        scope,
        nowMs: NOW_MS + 10 * 60_000,
        days: 1,
        chunkDays: 1,
      }),
    ).rejects.toThrow('Treatment history unavailable');
    const retained = await loadOracleCache(scope);
    expect(retained.treatments).toEqual(original.treatments);
    expect(retained.meta).toEqual(original.meta);
  });
});
