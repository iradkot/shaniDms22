import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  fetchBgDataForDateRange,
  fetchBgDataForDateRangeWithMetadata,
  fetchDeviceStatusForDateRange,
  fetchTreatmentsForDateRangeWithMetadata,
} from 'app/api/apiRequests';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';

const START = new Date('2026-08-01T00:00:00.000Z');
const END = new Date('2026-08-01T01:00:00.000Z');

describe('Nightscout date-range cache isolation', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    jest.restoreAllMocks();
    clearNightscoutInstance();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    clearNightscoutInstance();
    jest.useRealTimers();
  });

  it('never returns cached BG belonging to another Nightscout Source', async () => {
    const getSpy = jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{date: START.getTime(), sgv: 101}]} as never)
      .mockResolvedValueOnce({
        data: [{date: START.getTime() + 1, sgv: 202}],
      } as never)
      .mockRejectedValueOnce(new Error('offline'));

    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    await expect(fetchBgDataForDateRange(START, END)).resolves.toMatchObject([
      {sgv: 101},
    ]);

    configureNightscoutInstance({baseUrl: 'https://beta.example'});
    await expect(fetchBgDataForDateRange(START, END)).resolves.toMatchObject([
      {sgv: 202},
    ]);

    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    await expect(fetchBgDataForDateRange(START, END)).resolves.toMatchObject([
      {sgv: 101},
    ]);

    expect(getSpy).toHaveBeenCalledTimes(3);
  });

  it('never returns cached device status belonging to another Nightscout Source', async () => {
    const getSpy = jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({data: [{created_at: '2026-08-01', source: 'alpha'}]} as never)
      .mockResolvedValueOnce({data: [{created_at: '2026-08-01', source: 'beta'}]} as never);

    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    await expect(
      fetchDeviceStatusForDateRange(START, END),
    ).resolves.toMatchObject([{source: 'alpha'}]);

    configureNightscoutInstance({baseUrl: 'https://beta.example'});
    await expect(
      fetchDeviceStatusForDateRange(START, END),
    ).resolves.toMatchObject([{source: 'beta'}]);

    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('abandons a BG response if the active Nightscout Source changes while loading', async () => {
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    const getSpy = jest
      .spyOn(nightscoutInstance, 'get')
      .mockImplementationOnce(async () => {
        configureNightscoutInstance({baseUrl: 'https://beta.example'});
        return {data: [{date: START.getTime(), sgv: 101}]} as never;
      });

    await expect(fetchBgDataForDateRange(START, END)).rejects.toThrow(
      'Nightscout Source changed while loading cached data',
    );
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('reports cached network fallback as stale', async () => {
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({
        data: [{date: START.getTime(), sgv: 101}],
      } as never)
      .mockRejectedValueOnce(new Error('offline'));

    await expect(
      fetchBgDataForDateRangeWithMetadata(START, END),
    ).resolves.toMatchObject({freshness: {kind: 'fresh'}});
    await expect(
      fetchBgDataForDateRangeWithMetadata(START, END),
    ).resolves.toEqual({
      records: [expect.objectContaining({sgv: 101})],
      freshness: {
        kind: 'stale',
        fetchedAtMs: Date.parse('2026-08-02T00:00:00.000Z'),
        reason: 'network-unavailable',
      },
    });
  });

  it('distinguishes cached treatments from an authoritative empty response', async () => {
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValueOnce({
        data: [
          {
            _id: 'treatment-1',
            created_at: START.toISOString(),
            carbs: 15,
          },
        ],
      } as never)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline without cache'));

    await expect(
      fetchTreatmentsForDateRangeWithMetadata(START, END),
    ).resolves.toMatchObject({freshness: {kind: 'fresh'}});
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(START, END),
    ).resolves.toMatchObject({
      records: [expect.objectContaining({_id: 'treatment-1'})],
      freshness: {kind: 'stale', reason: 'network-unavailable'},
    });

    configureNightscoutInstance({baseUrl: 'https://beta.example'});
    await expect(
      fetchTreatmentsForDateRangeWithMetadata(START, END),
    ).rejects.toThrow('offline without cache');
  });
});
