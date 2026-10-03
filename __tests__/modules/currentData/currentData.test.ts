import {
  buildCurrentDataSnapshot,
  currentFactsExpireAtMs,
  createCurrentDataSource,
  reobserveCurrentData,
  type CurrentReadResult,
} from '../../../src/modules/currentData';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const MIN = 60_000;
const read = (
  records: readonly unknown[],
  kind: 'fresh' | 'stale' = 'fresh',
): CurrentReadResult => ({
  records,
  freshness: {kind, fetchedAtMs: NOW},
});
const iso = (at: number) => new Date(at).toISOString();
const glucose = read([{date: String(NOW - 4 * MIN), sgv: '123'}]);
const status = (iobTime = NOW - 2 * MIN, cobTime = NOW - 4 * MIN) => ({
  created_at: iso(NOW),
  loop: {
    iob: {iob: -0.2, timestamp: iso(iobTime)},
    cob: {cob: 0, timestamp: iso(cobTime)},
  },
});

describe('shared current observations', () => {
  it('expires at the earliest fresh field clock and omits a deadline when all evidence is stale', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([status(NOW - 2 * MIN, NOW - 14 * MIN)]),
    });
    expect(currentFactsExpireAtMs(snapshot)).toBe(NOW + MIN);
    const aged = reobserveCurrentData(snapshot, NOW + 20 * MIN);
    expect(currentFactsExpireAtMs(aged)).toBeUndefined();
  });
  it('uses an explicit normalized value and clock together without borrowing nested metadata', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([
        {
          iobUnits: 1.5,
          iobTimestampMs: NOW - 2 * MIN,
          cobGrams: 20,
          cobTimestampMs: null,
          forecastStatus: {
            ts: NOW,
            iobUnits: 8,
            iobTimestampMs: NOW,
            cobGrams: 30,
            cobTimestampMs: NOW,
          },
        },
      ]),
    });
    expect(snapshot.iob).toMatchObject({
      status: 'fresh',
      value: 1.5,
      sourceTimestampMs: NOW - 2 * MIN,
    });
    expect(snapshot.cob).toMatchObject({status: 'unavailable', value: null});
  });
  it('keeps four-minute glucose and each independent load clock even behind an uploader-only row', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([
        {created_at: iso(NOW), uploader: {battery: 80}},
        status(),
      ]),
    });
    expect(snapshot.glucose).toMatchObject({
      status: 'fresh',
      value: 123,
      sourceTimestampMs: NOW - 4 * MIN,
      fetchedAtMs: NOW,
    });
    expect(snapshot.glucoseReading).toMatchObject({
      date: NOW - 4 * MIN,
      sgv: 123,
    });
    expect(snapshot.iob).toMatchObject({
      status: 'fresh',
      value: -0.2,
      sourceTimestampMs: NOW - 2 * MIN,
    });
    expect(snapshot.cob).toMatchObject({
      status: 'fresh',
      value: 0,
      sourceTimestampMs: NOW - 4 * MIN,
    });
  });

  it('does not let a new upload or fresh COB refresh an old IOB observation', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([status(NOW - 30 * MIN)]),
    });
    expect(snapshot.iob).toMatchObject({
      status: 'stale',
      value: -0.2,
      ageMs: 30 * MIN,
    });
    expect(snapshot.cob.status).toBe('fresh');
  });

  it('reads timestamped OpenAPS values without borrowing the upload clock', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([
        {
          created_at: iso(NOW),
          openaps: {
            iob: {iob: 1.5, timestamp: NOW - MIN},
            meal: {cob: 12, timestamp: iso(NOW - 2 * MIN)},
          },
        },
      ]),
    });
    expect(snapshot.iob).toMatchObject({
      status: 'fresh',
      value: 1.5,
      sourceTimestampMs: NOW - MIN,
    });
    expect(snapshot.cob).toMatchObject({
      status: 'fresh',
      value: 12,
      sourceTimestampMs: NOW - 2 * MIN,
    });
  });

  it.each([undefined, 'invalid', NOW + 1])(
    'rejects a missing, invalid or future own field timestamp: %p',
    timestamp => {
      const snapshot = buildCurrentDataSnapshot({
        observedAtMs: NOW,
        glucose,
        deviceStatus: read([
          {
            created_at: iso(NOW),
            loop: {iob: {iob: 4, timestamp}, cob: {cob: 8, timestamp}},
          },
        ]),
      });
      expect(snapshot.iob).toMatchObject({status: 'unavailable', value: null});
      expect(snapshot.cob).toMatchObject({status: 'unavailable', value: null});
    },
  );

  it('does not revive an older load after an explicit unknown observation', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([
        status(),
        {
          created_at: iso(NOW),
          loop: {iob: {iob: null, timestamp: iso(NOW - MIN)}},
        },
      ]),
    });
    expect(snapshot.iob).toMatchObject({
      status: 'unavailable',
      value: null,
      sourceTimestampMs: NOW - MIN,
    });
    expect(snapshot.cob.status).toBe('fresh');
  });

  it('retains a 243-minute reading only as stale display data and rejects future glucose', () => {
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose: read([
        {date: NOW + MIN, sgv: 250},
        {date: NOW - 243 * MIN, sgv: 140, iob: 20, cob: 30},
      ]),
      deviceStatus: null,
    });
    expect(snapshot.glucose).toMatchObject({
      status: 'stale',
      value: 140,
      ageMs: 243 * MIN,
    });
    expect(snapshot.glucoseReading).not.toHaveProperty('iob');
    expect(snapshot.glucoseReading).not.toHaveProperty('cob');
  });

  it('keeps original fetch timestamps and cannot freshen a cached source when aging', () => {
    const original = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose: read([{date: NOW - 14 * MIN, sgv: 123}]),
      deviceStatus: read([status()], 'stale'),
    });
    const aged = reobserveCurrentData(original, NOW + 3 * MIN);
    expect(aged.glucose).toMatchObject({
      status: 'stale',
      sourceTimestampMs: NOW - 14 * MIN,
      fetchedAtMs: NOW,
      ageMs: 17 * MIN,
    });
    expect(aged.iob).toMatchObject({
      status: 'stale',
      fetchedAtMs: NOW,
      reason: 'cached-after-read-failure',
    });
  });

  it('selects a usable raw Loop prediction behind a newer uploader-only record', () => {
    const prediction = {
      created_at: iso(NOW - MIN),
      loop: {
        timestamp: iso(NOW - MIN),
        predicted: {startDate: iso(NOW - MIN), values: [120, 121, 122, 123]},
      },
    };
    const snapshot = buildCurrentDataSnapshot({
      observedAtMs: NOW,
      glucose,
      deviceStatus: read([
        {created_at: iso(NOW), uploader: {battery: 80}},
        prediction,
      ]),
    });
    expect(snapshot.deviceStatus).toEqual(prediction);
  });
});

describe('current source boundary', () => {
  it('keeps independent resources usable when another read fails', async () => {
    const source = createCurrentDataSource({
      now: () => NOW,
      getScopeKey: () => 'A:1',
      readGlucose: async () => {
        throw new Error('Glucose failed');
      },
      readDeviceStatus: async () => read([status()]),
    });
    const snapshot = await source.loadCurrent();
    expect(snapshot.glucose).toMatchObject({
      status: 'unavailable',
      reason: 'read-failed',
    });
    expect(snapshot.iob.status).toBe('fresh');
    expect(snapshot.cob.status).toBe('fresh');
  });

  it('shares in-flight reads but cancellation belongs only to the requesting consumer', async () => {
    let release!: (value: CurrentReadResult) => void;
    const readGlucose = jest.fn(
      () =>
        new Promise<CurrentReadResult>(resolve => {
          release = resolve;
        }),
    );
    const readDeviceStatus = jest.fn(async () => read([status()]));
    const source = createCurrentDataSource({
      now: () => NOW,
      getScopeKey: () => 'A:1',
      readGlucose,
      readDeviceStatus,
    });
    const abort = new AbortController();
    const first = source.loadCurrent({signal: abort.signal});
    const second = source.loadCurrent();
    await Promise.resolve();
    abort.abort();
    await expect(first).rejects.toMatchObject({name: 'AbortError'});
    release(glucose);
    expect((await second).glucose.status).toBe('fresh');
    expect(readGlucose).toHaveBeenCalledTimes(1);
    expect(readDeviceStatus).toHaveBeenCalledTimes(1);
  });

  it('rejects a prior A response even if the source switched A to B and back to A', async () => {
    let sourceKey = 'A:1';
    let release!: (value: CurrentReadResult) => void;
    const source = createCurrentDataSource({
      now: () => NOW,
      getScopeKey: () => sourceKey,
      readGlucose: () =>
        new Promise(resolve => {
          release = resolve;
        }),
      readDeviceStatus: async () => read([status()]),
    });
    const pending = source.loadCurrent();
    await Promise.resolve();
    sourceKey = 'B:2';
    sourceKey = 'A:3';
    release(glucose);
    await expect(pending).rejects.toThrow('source changed');
  });
});
