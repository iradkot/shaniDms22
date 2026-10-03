import {
  PRE_MEAL_INTENT_DURATION_MS,
  createNativePreMealAssistanceDataSource,
  createNativePreMealIntentStore,
} from 'app/platform/native/product';
import {buildCurrentDataSnapshot} from 'app/modules/currentData';

describe('native pre-meal assistance adapter', () => {
  it('keeps the explicit intent scoped, time-limited, and strictly decoded', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const store = createNativePreMealIntentStore({
      scopeId: 'workspace_abc',
      storage,
    });
    const startedAtMs = 1_800_000_000_000;

    const intent = await store.start(startedAtMs);
    expect(intent).toEqual({
      startedAtMs,
      expiresAtMs: startedAtMs + PRE_MEAL_INTENT_DURATION_MS,
    });
    await expect(store.load(startedAtMs + 1)).resolves.toEqual(intent);

    values.set(
      'product.preMealIntent.v1.workspace_abc',
      JSON.stringify({
        startedAtMs: 'bad',
        expiresAtMs: Number.POSITIVE_INFINITY,
      }),
    );
    await expect(store.load(startedAtMs + 1)).resolves.toBeUndefined();
    expect(values.has('product.preMealIntent.v1.workspace_abc')).toBe(false);
  });

  it('maps only validated Nightscout facts and reports an offline source', async () => {
    const nowMs = 1_800_000_000_000;
    const dataSource = createNativePreMealAssistanceDataSource({
      intent: {startedAtMs: nowMs - 1_000, expiresAtMs: nowMs + 60_000},
      latestSnapshotState: {
        isLoading: false,
        error: new Error('private network detail'),
        snapshot: {
          currentData: buildCurrentDataSnapshot({
            observedAtMs: nowMs,
            glucose: {
              records: [{sgv: 123.4, date: nowMs - 120_000}],
              freshness: {kind: 'fresh', fetchedAtMs: nowMs},
            },
            deviceStatus: {
              records: [
                {
                  loop: {
                    iob: {iob: -1.25, timestamp: nowMs - 180_000},
                    cob: {cob: 0, timestamp: nowMs - 240_000},
                  },
                },
              ],
              freshness: {kind: 'fresh', fetchedAtMs: nowMs},
            },
          }),
          enrichedBg: {
            sgv: 123.4,
            date: nowMs - 120_000,
            direction: 'FortyFiveDown',
            iob: 1.25,
            cob: 18,
            ignoredSecret: 'never project me',
          },
        },
      },
    });

    await expect(
      dataSource.loadContext({
        nowMs,
        period: {dayStartMs: nowMs - 10_000, dayEndMs: nowMs + 10_000},
      }),
    ).resolves.toEqual({
      relevance: {
        kind: 'active',
        startedAtMs: nowMs - 1_000,
        expiresAtMs: nowMs + 60_000,
      },
      sourceState: {kind: 'offline'},
      facts: {
        observedAtMs: nowMs - 120_000,
        glucoseMgDl: 123.4,
        trend: 'forty-five-down',
        iobUnits: -1.25,
        cobGrams: 0,
        iobTimestampMs: nowMs - 180_000,
        cobTimestampMs: nowMs - 240_000,
      },
    });
  });

  it('re-ages individual source clocks when meal context is loaded later', async () => {
    const at = 1_800_000_000_000;
    const dataSource = createNativePreMealAssistanceDataSource({
      latestSnapshotState: {
        isLoading: false,
        error: null,
        snapshot: {
          enrichedBg: {sgv: 123, date: at, iob: -0.2, cob: 0},
          currentData: buildCurrentDataSnapshot({
            observedAtMs: at,
            glucose: {
              records: [{sgv: 123, date: at}],
              freshness: {kind: 'fresh', fetchedAtMs: at},
            },
            deviceStatus: {
              records: [
                {
                  loop: {
                    iob: {iob: -0.2, timestamp: at - 14 * 60_000},
                    cob: {cob: 0, timestamp: at},
                  },
                },
              ],
              freshness: {kind: 'fresh', fetchedAtMs: at},
            },
          }),
        },
      },
    });
    const result = await dataSource.loadContext({
      nowMs: at + 60_000,
      period: {dayStartMs: at - 60_000, dayEndMs: at + 100_000},
    });
    expect(result.facts).toEqual({
      observedAtMs: at,
      glucoseMgDl: 123,
      cobGrams: 0,
      cobTimestampMs: at,
    });
  });

  it('does not invent facts when the snapshot shape is invalid or intent expired', async () => {
    const nowMs = 1_800_000_000_000;
    const dataSource = createNativePreMealAssistanceDataSource({
      intent: {startedAtMs: nowMs - 100_000, expiresAtMs: nowMs},
      latestSnapshotState: {
        isLoading: false,
        error: null,
        snapshot: {enrichedBg: {sgv: '123', date: nowMs}},
      },
    });

    await expect(
      dataSource.loadContext({
        nowMs,
        period: {dayStartMs: nowMs - 10_000, dayEndMs: nowMs + 10_000},
      }),
    ).resolves.toEqual({
      relevance: {kind: 'inactive'},
      sourceState: {kind: 'live'},
    });
  });
});
