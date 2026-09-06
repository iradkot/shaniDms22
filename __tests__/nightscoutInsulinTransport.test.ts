import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AxiosAdapter} from 'axios';
import {
  fetchDeviceStatusForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
  fetchTreatmentsForDateRangeWithMetadata,
  fetchDeviceStatusForDateRangeWithMetadata,
} from 'app/api/apiRequests';
import {getActiveNightscoutCacheScope} from 'app/services/nightscoutCacheScope';
import {writeNightscoutRangeCache} from 'app/services/nightscoutRangeCache';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';

const start = new Date('2026-09-06T00:00:00Z');
const end = new Date('2026-09-06T23:59:59Z');

describe('shared Nightscout insulin transport', () => {
  const previousAdapter = nightscoutInstance.defaults.adapter;
  beforeEach(async () => {
    await AsyncStorage.clear();
    configureNightscoutInstance({
      baseUrl: 'https://fixture.example',
      ownerUserId: 'fixture-user',
    });
  });
  afterEach(() => {
    clearNightscoutInstance();
    nightscoutInstance.defaults.adapter = previousAdapter;
  });

  it('does not trust old cache windows that were written without checking truncation', async () => {
    const scope = getActiveNightscoutCacheScope()!;
    for (const resource of ['treatments.v1', 'device-status.v2']) {
      await writeNightscoutRangeCache({
        scope,
        resource,
        startMs: start.getTime(),
        endMs: end.getTime(),
        fetchedAtMs: Date.now(),
        records: [],
        getTimestampMs: () => undefined,
      });
    }
    nightscoutInstance.defaults.adapter = async () => {
      throw new Error('offline');
    };
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ).rejects.toThrow('offline');
    await expect(
      fetchDeviceStatusForDateRangeWithMetadata(start, end),
    ).rejects.toThrow('offline');
  });

  it('rejects unavailable data instead of reporting zero treatment or load records', async () => {
    nightscoutInstance.defaults.adapter = async () => {
      throw new Error('offline');
    };
    await expect(
      fetchTreatmentsForDateRangeUncached(start, end),
    ).rejects.toThrow('offline');
    await expect(
      fetchDeviceStatusForDateRangeUncached(start, end),
    ).rejects.toThrow('offline');
  });

  it('rejects malformed responses without caching them as known empty ranges', async () => {
    const adapter: AxiosAdapter = async config => ({
      config,
      data: '<html>Login</html>',
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    nightscoutInstance.defaults.adapter = adapter;
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ).rejects.toThrow('record list');
    nightscoutInstance.defaults.adapter = async () => {
      throw new Error('offline');
    };
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ).rejects.toThrow('offline');
  });

  it('shares the request and record decoding between cached and uncached consumers', async () => {
    const record = {
      created_at: start.toISOString(),
      eventType: 'Correction Bolus',
      insulin: 2,
    };
    const adapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>(
      async config => ({
        config,
        data: [record, null, 4],
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
    );
    nightscoutInstance.defaults.adapter = adapter;
    const [raw, range] = await Promise.all([
      fetchTreatmentsForDateRangeUncached(start, end),
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ]);
    expect(raw).toEqual([record]);
    expect(range.records).toEqual(raw);
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
