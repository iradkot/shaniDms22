import AsyncStorage from '@react-native-async-storage/async-storage';
import BGDataService from 'app/api/firebase/services/BGDataService';
import type {AxiosAdapter} from 'axios';
import {
  fetchBgDataForDateRangeUncached,
  fetchBgDataForDateRangeWithMetadata,
  fetchTreatmentsForDateRangeWithMetadata,
} from 'app/api/apiRequests';
import {
  requestCompleteNightscoutRange,
  NightscoutIncompleteRangeError,
} from 'app/api/nightscoutRangeRecords';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';

const start = new Date('2026-08-30T00:00:00Z');
const end = new Date('2026-09-06T23:59:59Z');
const records = Array.from({length: 8 * 288}, (_, index) => ({
  _id: `temp-${index}`,
  created_at: new Date(+end - index * 5 * 60_000).toISOString(),
  eventType: 'Temp Basal',
  absolute: 0.8,
  duration: 5,
}));

describe('Nightscout range completeness', () => {
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

  it.each(['cached', 'uncached', 'legacy'] as const)(
    '%s history includes numeric-date glucose with no optional dateString',
    async reader => {
      const raw = [
        {date: +end - 4 * 60_000, sgv: 123},
        {
          date: +end - 243 * 60_000,
          sgv: 181,
          dateString: new Date(+end - 243 * 60_000).toISOString(),
        },
      ];
      nightscoutInstance.defaults.adapter = async config => {
        const url = new URL(config.url!, config.baseURL);
        const startNumber = url.searchParams.get('find[date][$gte]');
        const endNumber = url.searchParams.get('find[date][$lte]');
        const data =
          startNumber !== null && endNumber !== null
            ? raw.filter(
                row =>
                  row.date >= Number(startNumber) &&
                  row.date <= Number(endNumber),
              )
            : raw.filter(row => row.dateString !== undefined);
        return {config, data, status: 200, statusText: 'OK', headers: {}};
      };
      const result =
        reader === 'cached'
          ? (await fetchBgDataForDateRangeWithMetadata(start, end)).records
          : reader === 'uncached'
          ? await fetchBgDataForDateRangeUncached(start, end, {
              throwOnError: true,
            })
          : await BGDataService.fetchBgDataForDateRange(start, end);
      expect(result.map(row => row.sgv)).toEqual([123, 181]);
    },
  );

  it('enumerates one-minute daily glucose beyond the initial count, including invalid raw rows', async () => {
    const dayStart = new Date('2026-09-01T00:00:00Z');
    const dayEnd = new Date('2026-09-02T00:00:00Z');
    const glucose = Array.from({length: 1440}, (_, index) => ({
      _id: `g-${index}`,
      date: +dayStart + index * 60_000,
      sgv: 100,
    }));
    const raw = [...glucose, ...Array(60).fill(null)];
    const counts: number[] = [];
    nightscoutInstance.defaults.adapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      counts.push(count);
      return {
        config,
        data: raw.slice(0, count),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    const result = await fetchBgDataForDateRangeWithMetadata(dayStart, dayEnd);
    expect(counts).toEqual([1000, 2000]);
    expect(result.records).toHaveLength(1440);
    expect(result.complete).toBe(true);
  });

  it('rejects saturated glucose without caching it as a fully read day', async () => {
    const dayStart = new Date();
    const dayEnd = new Date(+dayStart + 24 * 60 * 60 * 1000);
    nightscoutInstance.defaults.adapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      return {
        config,
        data: Array(count).fill({date: +dayStart, sgv: 120}),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    await expect(
      fetchBgDataForDateRangeWithMetadata(dayStart, dayEnd),
    ).rejects.toBeInstanceOf(NightscoutIncompleteRangeError);
    nightscoutInstance.defaults.adapter = async () => {
      throw new Error('offline-after-saturation');
    };
    await expect(
      fetchBgDataForDateRangeWithMetadata(dayStart, dayEnd),
    ).rejects.toThrow('offline-after-saturation');
  });

  it('uses the same complete decoded glucose range for uncached analysis readers', async () => {
    const raw = [
      {date: String(+start), sgv: '110'},
      null,
      {date: +start + 60_000, sgv: 120},
      {date: +start + 120_000, sgv: -5},
      {date: +start + 180_000, sgv: 130},
    ];
    const counts: number[] = [];
    nightscoutInstance.defaults.adapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      counts.push(count);
      return {
        config,
        data: raw.slice(0, count),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    const result = await fetchBgDataForDateRangeUncached(start, end, {
      count: 2,
      throwOnError: true,
    });
    expect(counts).toEqual([2, 4, 8]);
    expect(result).toEqual([
      {date: +start + 180_000, sgv: 130},
      {date: +start + 60_000, sgv: 120},
      {date: +start, sgv: 110},
    ]);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('rejects malformed uncached glucose and does not relabel it as an empty history in strict mode', async () => {
    nightscoutInstance.defaults.adapter = async config => ({
      config,
      data: {error: 'not a record list'},
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    await expect(
      fetchBgDataForDateRangeUncached(start, end, {throwOnError: true}),
    ).rejects.toThrow('invalid record list');
  });

  it('loads every five-minute basal event in a seven-day analysis plus its carry-in day', async () => {
    const requests: number[] = [];
    const adapter: AxiosAdapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      requests.push(count);
      return {
        config,
        data: records.slice(0, count),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    nightscoutInstance.defaults.adapter = adapter;
    const result = await fetchTreatmentsForDateRangeWithMetadata(start, end);
    expect(result.records).toHaveLength(2304);
    expect(result.records).toEqual(records);
    expect(result.freshness.kind).toBe('fresh');
    expect(requests).toEqual([1000, 2000, 4000]);
  });

  it('uses the raw received count so filtered invalid rows cannot conceal saturation', async () => {
    const raw = [records[0], null, records[1], 4, records[2]];
    const requests: number[] = [];
    nightscoutInstance.defaults.adapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      requests.push(count);
      return {
        config,
        data: raw.slice(0, count),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    const result = await requestCompleteNightscoutRange(
      count => `/api/v1/treatments?count=${count}`,
      2,
      8,
    );
    expect(requests).toEqual([2, 4, 8]);
    expect(result).toEqual(records.slice(0, 3));
  });

  it('rejects a saturated safety cap and never publishes the partial range to offline cache', async () => {
    const requests: number[] = [];
    nightscoutInstance.defaults.adapter = async config => {
      const count = Number(config.url?.match(/[?&]count=(\d+)/)?.[1]);
      requests.push(count);
      return {
        config,
        data: Array(count).fill(records[0]),
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ).rejects.toBeInstanceOf(NightscoutIncompleteRangeError);
    expect(requests).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 50000]);
    nightscoutInstance.defaults.adapter = async () => {
      throw new Error('offline-after-saturation');
    };
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(start, end),
    ).rejects.toThrow('offline-after-saturation');
  });

  it('rejects an account change between count escalation requests', async () => {
    const adapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>(
      async config => ({
        config,
        data: records.slice(0, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
    );
    nightscoutInstance.defaults.adapter = adapter;
    await expect(
      requestCompleteNightscoutRange(
        count => {
          if (count === 4) {
            configureNightscoutInstance({
              baseUrl: 'https://another-fixture.example',
              ownerUserId: 'another-fixture-user',
            });
          }
          return `/api/v1/treatments?count=${count}`;
        },
        2,
        8,
      ),
    ).rejects.toThrow('source changed');
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('accepts a known empty range without further requests and validates finite limits', async () => {
    const adapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>(
      async config => ({
        config,
        data: [],
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
    );
    nightscoutInstance.defaults.adapter = adapter;
    await expect(
      requestCompleteNightscoutRange(
        count => `/api/v1/treatments?count=${count}`,
        1000,
      ),
    ).resolves.toEqual([]);
    expect(adapter).toHaveBeenCalledTimes(1);
    await expect(
      requestCompleteNightscoutRange(() => '', Number.NaN),
    ).rejects.toThrow('limits');
    await expect(
      requestCompleteNightscoutRange(() => '', 1000, 100001),
    ).rejects.toThrow('limits');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
