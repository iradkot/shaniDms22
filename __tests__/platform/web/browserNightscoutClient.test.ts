import {
  BrowserNightscoutClient,
  decodeBrowserNightscoutDeviceStatus,
  type IndexedDbItemUpdate,
  WebApiError,
} from '../../../src/platform/web';

class MemoryStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
  async getAllKeys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }
  async updateItem<T>(
    key: string,
    update: (current: string | null) => IndexedDbItemUpdate<T>,
  ): Promise<T> {
    const result = update(this.values.get(key) ?? null);
    if (result.value !== undefined) {
      this.values.set(key, result.value);
    }
    return result.result;
  }
}

describe('BrowserNightscoutClient', () => {
  it('uses strictly decoded cached data when the proxy becomes unavailable', async () => {
    const storage = new MemoryStorage();
    const api = {
      requestJson: jest
        .fn()
        .mockResolvedValueOnce({
          version: 1,
          data: [
            {
              _id: 'entry-1',
              date: 1_700_000_000_000,
              sgv: 112,
              direction: 'Flat',
            },
            {date: 'bad', sgv: 9999},
          ],
        })
        .mockRejectedValueOnce(new Error('offline')),
    };
    const client = new BrowserNightscoutClient({
      api,
      storage,
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => 1_700_000_100_000,
    });
    const startMs = 1_699_999_900_000;
    const endMs = 1_700_000_100_000;

    await expect(client.readEntries(startMs, endMs)).resolves.toEqual({
      records: [
        {
          _id: 'entry-1',
          date: 1_700_000_000_000,
          sgv: 112,
          direction: 'Flat',
        },
      ],
      freshness: {kind: 'fresh', fetchedAtMs: 1_700_000_100_000},
      complete: true,
    });
    await expect(client.readEntries(startMs, endMs)).resolves.toMatchObject({
      records: [{_id: 'entry-1', sgv: 112}],
      freshness: {kind: 'stale'},
      complete: false,
    });
  });

  it('rejects raw saturated glucose even when decoding removes most rows and never caches it', async () => {
    const storage = new MemoryStorage();
    const requestJson = jest.fn()
      .mockResolvedValueOnce({version: 1, data: [
        {_id: 'one', date: 1_700_000_000_000, sgv: 123},
        ...Array(14_999).fill(null),
      ]})
      .mockRejectedValueOnce(new Error('offline'));
    const client = new BrowserNightscoutClient({
      api: {requestJson}, storage, sourceId: 'source-1', workspaceId: 'workspace-1',
      now: () => 1_700_000_100_000,
    });
    await expect(client.readEntries(1_699_999_900_000, 1_700_000_100_000)).rejects.toThrow('incomplete');
    expect(storage.values.size).toBe(0);
    await expect(client.readEntries(1_699_999_900_000, 1_700_000_100_000)).rejects.toThrow('offline');
  });

  it('falls back to existing stale glucose after saturation instead of replacing it with a truncated response', async () => {
    const storage = new MemoryStorage();
    const requestJson = jest.fn()
      .mockResolvedValueOnce({version: 1, data: [
        {_id: 'saved', date: 1_700_000_000_000, sgv: 100},
      ]})
      .mockResolvedValueOnce({version: 1, data: Array(15_000).fill(
        {_id: 'truncated', date: 1_700_000_000_000, sgv: 300},
      )});
    const client = new BrowserNightscoutClient({
      api: {requestJson}, storage, sourceId: 'source-1', workspaceId: 'workspace-1',
      now: () => 1_700_000_100_000,
    });
    await client.readEntries(1_699_999_900_000, 1_700_000_100_000);
    await expect(client.readEntries(1_699_999_900_000, 1_700_000_100_000)).resolves.toMatchObject({
      records: [{_id: 'saved', sgv: 100}],
      freshness: {kind: 'stale'},
      complete: false,
    });
    expect([...storage.values.values()].join('')).not.toContain('truncated');
  });

  it('sends the expected identity and reboots instead of serving cached data after drift', async () => {
    const storage = new MemoryStorage();
    const onRebootstrapRequired = jest.fn();
    const requestJson = jest
      .fn()
      .mockResolvedValueOnce({
        version: 1,
        data: [{_id: 'entry-1', date: 1_700_000_000_000, sgv: 112}],
      })
      .mockRejectedValue(
        new WebApiError(
          409,
          'nightscout_identity_mismatch',
          'Nightscout Workspace changed',
        ),
      );
    const client = new BrowserNightscoutClient({
      api: {requestJson},
      storage,
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      onRebootstrapRequired,
      now: () => 1_700_000_100_000,
    });
    const startMs = 1_699_999_900_000;
    const endMs = 1_700_000_100_000;

    await client.readEntries(startMs, endMs);
    expect(requestJson).toHaveBeenNthCalledWith(1, '/v1/nightscout/range', {
      method: 'POST',
      body: {
        version: 1,
        kind: 'entries',
        sourceId: 'source-1',
        workspaceId: 'workspace-account-1',
        startMs,
        endMs,
      },
    });

    await expect(client.readEntries(startMs, endMs)).rejects.toMatchObject({
      status: 409,
      code: 'nightscout_identity_mismatch',
    });
    await expect(client.readEntries(startMs, endMs)).rejects.toMatchObject({
      status: 409,
      code: 'nightscout_identity_mismatch',
    });
    expect(onRebootstrapRequired).toHaveBeenCalledTimes(1);
  });

  it('isolates caches by account Workspace and ignores legacy source-only entries', async () => {
    const storage = new MemoryStorage();
    const startMs = 1_699_999_900_000;
    const endMs = 1_700_000_100_000;
    const first = new BrowserNightscoutClient({
      api: {
        requestJson: async () => ({
          version: 1,
          data: [{_id: 'account-a', date: 1_700_000_000_000, sgv: 112}],
        }),
      },
      storage,
      sourceId: 'shared-source',
      workspaceId: 'workspace-account-a',
      now: () => endMs,
    });
    await first.readEntries(startMs, endMs);
    storage.values.set(
      `shani.web.nightscout-cache.v1:shared-source:entries:${startMs}:${endMs}`,
      JSON.stringify({
        schemaVersion: 1,
        sourceId: 'shared-source',
        resource: 'entries',
        startMs,
        endMs,
        fetchedAtMs: endMs,
        lastAccessedAtMs: endMs,
        data: [{_id: 'legacy', date: 1_700_000_000_000, sgv: 999}],
      }),
    );
    const second = new BrowserNightscoutClient({
      api: {requestJson: async () => Promise.reject(new Error('offline'))},
      storage,
      sourceId: 'shared-source',
      workspaceId: 'workspace-account-b',
      now: () => endMs,
    });

    await expect(second.readEntries(startMs, endMs)).rejects.toThrow('offline');
    const currentRows = [...storage.values.entries()].filter(([key]) =>
      key.startsWith('shani.web.nightscout-cache.v2:'),
    );
    expect(currentRows).toHaveLength(1);
    expect(currentRows[0]?.[0]).toContain('workspace-account-a');
    expect(JSON.parse(currentRows[0]?.[1] ?? '{}')).toMatchObject({
      schemaVersion: 2,
      sourceId: 'shared-source',
      workspaceId: 'workspace-account-a',
    });
  });

  it('never accepts configured status without the canonical Workspace identity', async () => {
    await expect(
      BrowserNightscoutClient.status({
        requestJson: async () => ({version: 1, configured: true}),
      }),
    ).rejects.toThrow('Workspace identity');
  });

  it('consumes the server-provided opaque source identity after provision', async () => {
    const requestJson = jest.fn().mockResolvedValueOnce({
      version: 1,
      configured: true,
      sourceId: 'nightscout_source',
      workspaceId: 'workspace_source',
    });

    await expect(
      BrowserNightscoutClient.provision(
        {requestJson},
        {
          url: 'https://nightscout.example',
          apiKey: 'secret-that-must-not-return',
        },
      ),
    ).resolves.toEqual({
      configured: true,
      sourceId: 'nightscout_source',
      workspaceId: 'workspace_source',
    });
    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      '/v1/vault/nightscout/provision',
      {
        method: 'POST',
        body: {
          version: 1,
          url: 'https://nightscout.example',
          apiKey: 'secret-that-must-not-return',
        },
      },
    );
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('does not turn a cancelled request into stale cached data', async () => {
    const storage = new MemoryStorage();
    const requestJson = jest
      .fn()
      .mockResolvedValueOnce({
        version: 1,
        data: [{date: 1_700_000_000_000, sgv: 112}],
      })
      .mockRejectedValueOnce(new Error('cancelled'));
    const client = new BrowserNightscoutClient({
      api: {requestJson},
      storage,
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => 1_700_000_100_000,
    });
    const startMs = 1_699_999_900_000;
    const endMs = 1_700_000_100_000;
    await client.readEntries(startMs, endMs);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.readEntries(startMs, endMs, controller.signal),
    ).rejects.toMatchObject({name: 'AbortError'});
  });

  it('keeps only the bounded fields needed for factual profile-switch history', async () => {
    const client = new BrowserNightscoutClient({
      api: {
        requestJson: async () => ({
          version: 1,
          data: [
            {
              _id: 'profile-switch-1',
              created_at: '2026-08-01T08:00:00.000Z',
              eventType: 'Profile Switch',
              profile: 'Exercise',
              enteredBy: 'AndroidAPS',
              app: 'AAPS',
              rawSecret: 'must-be-dropped',
            },
          ],
        }),
      },
      storage: new MemoryStorage(),
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => 1_800_000_000_000,
    });

    const result = await client.readTreatments(
      1_785_000_000_000,
      1_786_000_000_000,
    );
    expect(result).toMatchObject({
      records: [
        {
          _id: 'profile-switch-1',
          eventType: 'Profile Switch',
          profile: 'Exercise',
          enteredBy: 'AndroidAPS',
          app: 'AAPS',
        },
      ],
    });
    expect(JSON.stringify(result.records)).not.toContain('rawSecret');
  });

  it('keeps the bounded temporary-basal fields required by the rich chart', async () => {
    const client = new BrowserNightscoutClient({
      api: {
        requestJson: async () => ({
          version: 1,
          data: [
            {
              _id: 'temp-basal-1',
              created_at: '2026-08-01T08:00:00.000Z',
              eventType: 'Temp Basal',
              rate: 0.85,
              absolute: 0.9,
              duration: 30,
              rawSecret: 'must-be-dropped',
            },
          ],
        }),
      },
      storage: new MemoryStorage(),
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => 1_800_000_000_000,
    });

    const result = await client.readTreatments(
      1_785_000_000_000,
      1_786_000_000_000,
    );

    expect(result.records).toEqual([
      {
        _id: 'temp-basal-1',
        created_at: '2026-08-01T08:00:00.000Z',
        eventType: 'Temp Basal',
        rate: 0.85,
        absolute: 0.9,
        duration: 30,
      },
    ]);
    expect(JSON.stringify(result.records)).not.toContain('rawSecret');
  });

  it('strictly decodes and reuses cached device-status IOB and COB facts', async () => {
    const storage = new MemoryStorage();
    const nowMs = 1_800_000_000_000;
    const requestJson = jest
      .fn()
      .mockResolvedValueOnce({
        version: 1,
        data: [
          {
            _id: 'status-1',
            created_at: '2027-01-15T08:00:00.000Z',
            loop: {iob: {iob: '1.25'}, cob: {cob: 24}},
            secret: 'drop-me',
          },
          {
            created_at: '2027-01-15T08:01:00.000Z',
            loop: {iob: {iob: -101}, cob: {cob: 50_000}},
          },
        ],
      })
      .mockRejectedValueOnce(new Error('offline'));
    const client = new BrowserNightscoutClient({
      api: {requestJson},
      storage,
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => nowMs,
    });
    const startMs = nowMs - 2 * 60 * 60 * 1_000;

    const live = await client.readDeviceStatuses(startMs, nowMs);
    expect(live).toEqual({
      records: [
        {
          _id: 'status-1',
          createdAtMs: Date.parse('2027-01-15T08:00:00.000Z'),
          iobUnits: 1.25,
          cobGrams: 24,
          forecastStatus: {
            ts: Date.parse('2027-01-15T08:00:00.000Z'),
            cobGrams: 24,
          },
        },
      ],
      freshness: {kind: 'fresh', fetchedAtMs: nowMs},
    });
    expect(JSON.stringify(live.records)).not.toContain('drop-me');

    await expect(client.readDeviceStatuses(startMs, nowMs)).resolves.toEqual({
      records: live.records,
      freshness: {kind: 'stale', fetchedAtMs: nowMs},
    });
    await expect(client.readDeviceStatuses(startMs - 1, nowMs)).rejects.toThrow(
      'exceeds two hours',
    );
  });

  it('rejects malformed normalized device-status cache shapes', () => {
    expect(
      decodeBrowserNightscoutDeviceStatus({
        createdAtMs: 1_800_000_000_000,
        iobUnits: Number.NaN,
        cobGrams: -1,
      }),
    ).toBeNull();
    expect(
      decodeBrowserNightscoutDeviceStatus({
        createdAtMs: 1_800_000_000_000.5,
        iobUnits: 1,
      }),
    ).toBeNull();
  });

  it('preserves signed and split IOB facts from a valid device status', () => {
    expect(
      decodeBrowserNightscoutDeviceStatus({
        _id: 'signed-load',
        created_at: '2027-01-15T08:00:00.000Z',
        loop: {
          iob: {iob: -0.2, bolusIob: 0.1, basalIob: -0.3},
          cob: {cob: 18},
        },
      }),
    ).toEqual({
      _id: 'signed-load',
      createdAtMs: Date.parse('2027-01-15T08:00:00.000Z'),
      iobUnits: -0.2,
      bolusIobUnits: 0.1,
      basalIobUnits: -0.3,
      cobGrams: 18,
      forecastStatus: {
        ts: Date.parse('2027-01-15T08:00:00.000Z'),
        iobUnits: -0.2,
        cobGrams: 18,
      },
    });
  });

  it('preserves original Loop forecast and load times across minimized cache round trips', async () => {
    const nowMs = Date.parse('2026-09-07T08:01:00Z');
    const startMs = nowMs - 2 * 60 * 60 * 1_000;
    const storage = new MemoryStorage();
    const requestJson = jest.fn().mockResolvedValueOnce({
      version: 1,
      data: [{
        _id: 'forecast-1',
        created_at: '2026-09-07T08:00:30Z',
        loop: {
          timestamp: '2026-09-07T08:00:15Z',
          predicted: {
            startDate: '2026-09-07T08:00:00Z',
            values: [120, 117, 114, 110, 106, 102, 100],
            IOB: [900, 900],
            COB: [800, 800],
          },
          iob: {timestamp: '2026-09-07T07:59:00Z', iob: -0.25},
          cob: {timestamp: '2026-09-07T07:58:00Z', cob: 12},
          failureReason: 'private failure detail',
        },
        pump: {serial: 'private pump detail'},
      }],
    }).mockRejectedValueOnce(new Error('offline'));
    const client = new BrowserNightscoutClient({
      api: {requestJson}, storage, sourceId: 'source-1',
      workspaceId: 'workspace-1', now: () => nowMs,
    });
    const live = await client.readDeviceStatuses(startMs, nowMs);
    expect(live.records[0]?.forecastStatus).toEqual({
      ts: Date.parse('2026-09-07T08:00:30Z'),
      loopTimestampMs: Date.parse('2026-09-07T08:00:15Z'),
      loopPrediction: {
        startMs: Date.parse('2026-09-07T08:00:00Z'),
        values: [120, 117, 114, 110, 106, 102, 100],
      },
      iobUnits: -0.25,
      iobTimestampMs: Date.parse('2026-09-07T07:59:00Z'),
      cobGrams: 12,
      cobTimestampMs: Date.parse('2026-09-07T07:58:00Z'),
    });
    const cached = await client.readDeviceStatuses(startMs, nowMs);
    expect(cached.records).toEqual(live.records);
    expect(cached.freshness.kind).toBe('stale');
    const serializedCache = [...storage.values.values()].join('');
    expect(serializedCache).not.toContain('private');
    expect(serializedCache).not.toContain('"IOB"');
    expect(serializedCache).not.toContain('"COB"');
  });

  it('keeps prediction-only records but rejects a forecast without its own start time', () => {
    const created_at = '2026-09-07T08:00:00Z';
    const withPrediction = decodeBrowserNightscoutDeviceStatus({
      created_at,
      loop: {predicted: {startDate: created_at, values: [120, 122]}},
    });
    expect(withPrediction?.forecastStatus?.loopPrediction).toEqual({
      startMs: Date.parse(created_at), values: [120, 122],
    });
    expect(decodeBrowserNightscoutDeviceStatus({
      created_at,
      loop: {predicted: {values: [120, 122]}},
    })).toBeNull();
  });

  it('loads a long device-status range in bounded compatible chunks', async () => {
    const startMs = Date.UTC(2027, 0, 15, 0, 0, 0);
    const endMs = startMs + 5 * 60 * 60 * 1_000;
    const requestJson = jest.fn(async (_path, options) => ({
      version: 1,
      data: [
        {
          _id: `status-${options.body.startMs}`,
          createdAtMs: options.body.startMs + 1,
          iobUnits: 1,
        },
      ],
    }));
    const client = new BrowserNightscoutClient({
      api: {requestJson},
      storage: new MemoryStorage(),
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => endMs,
    });

    const result = await client.readDeviceStatusesForRange(startMs, endMs);

    expect(result.records).toHaveLength(3);
    expect(requestJson).toHaveBeenCalledTimes(3);
    requestJson.mock.calls.forEach(([, options]) => {
      expect(options.body.endMs - options.body.startMs).toBeLessThanOrEqual(
        2 * 60 * 60 * 1_000,
      );
    });
  });

  it('strictly projects only the basal schedule needed by the chart and restores it offline', async () => {
    const storage = new MemoryStorage();
    const asOfMs = Date.UTC(2027, 0, 15, 0, 0, 0);
    let online = true;
    const client = new BrowserNightscoutClient({
      api: {
        requestJson: async () => {
          if (!online) {
            throw new Error('offline');
          }
          return {
            version: 1,
            data: [
              {
                defaultProfile: 'Default',
                store: {
                  Default: {
                    basal: [
                      {time: '00:00', timeAsSeconds: 0, value: 0.75},
                      {time: '12:00', value: 0.9},
                    ],
                    deviceToken: 'must-not-be-cached',
                  },
                },
                loopSettings: {deviceToken: 'also-secret'},
              },
            ],
          };
        },
      },
      storage,
      sourceId: 'source-1',
      workspaceId: 'workspace-account-1',
      now: () => asOfMs,
    });

    await expect(client.readBasalProfile(asOfMs)).resolves.toEqual({
      records: [
        {
          entries: [
            {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
            {secondsFromMidnight: 43_200, rateUnitsPerHour: 0.9},
          ],
        },
      ],
      freshness: {kind: 'fresh', fetchedAtMs: asOfMs},
    });
    expect([...storage.values.values()].join('')).not.toContain('secret');
    online = false;
    expect(await client.readBasalProfile(asOfMs)).toMatchObject({
      records: [
        {
          entries: [
            {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
            {secondsFromMidnight: 43200, rateUnitsPerHour: 0.9},
          ],
        },
      ],
      freshness: {kind: 'stale'},
    });
  });

  it.each([
    [
      {time: '00:00', value: 1},
      {time: '12:90', value: 2},
    ],
    [
      {time: '00:00', value: 1},
      {time: '12:00', value: -1},
    ],
    [
      {time: '00:00', value: 1},
      {time: '00:00', value: 2},
    ],
  ])(
    'rejects a profile with invalid or ambiguous entries: %j',
    async (...basal) => {
      const client = new BrowserNightscoutClient({
        api: {
          requestJson: async () => ({
            version: 1,
            data: [{defaultProfile: 'Default', store: {Default: {basal}}}],
          }),
        },
        storage: new MemoryStorage(),
        sourceId: 'source-1',
        workspaceId: 'workspace-1',
      });
      expect((await client.readBasalProfile(Date.now())).records).toEqual([]);
    },
  );

  it('deduplicates only the same external identity while keeping identical separate treatments', async () => {
    const treatment = {
      created_at: '2026-08-20T08:00:00.000Z',
      eventType: 'Correction Bolus',
      insulin: 1,
    };
    const client = new BrowserNightscoutClient({
      api: {
        requestJson: async () => ({
          version: 1,
          data: [
            {...treatment, _id: 'a'},
            {...treatment, _id: 'a'},
            {...treatment, _id: 'b'},
            treatment,
            treatment,
          ],
        }),
      },
      storage: new MemoryStorage(),
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
    });
    const records = (
      await client.readTreatments(
        Date.parse('2026-08-20'),
        Date.parse('2026-08-21'),
      )
    ).records;
    expect(records).toHaveLength(4);
    expect(records.map(record => record._id)).toEqual([
      'a',
      'b',
      undefined,
      undefined,
    ]);
  });

  it('keeps successful IOB/COB windows when one window fails', async () => {
    const startMs = Date.UTC(2027, 0, 15);
    const client = new BrowserNightscoutClient({
      api: {
        requestJson: jest
          .fn()
          .mockRejectedValueOnce(new Error('offline'))
          .mockResolvedValue({
            version: 1,
            data: [{createdAtMs: startMs + 3 * 3600000, iobUnits: 1.2}],
          }),
      },
      storage: new MemoryStorage(),
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
    });
    expect(
      await client.readDeviceStatusesForRange(startMs, startMs + 4 * 3600000),
    ).toMatchObject({
      records: [{iobUnits: 1.2}],
      freshness: {kind: 'stale'},
    });
  });
});
