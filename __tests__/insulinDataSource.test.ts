import {
  createInsulinContextLoader,
  type InsulinContextDependencies,
} from 'app/services/insulin/insulinDataSource';
import type {NightscoutRangeResult} from 'app/api/apiRequests';
import type {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import type {ProfileDataType} from 'app/types/insulin.types';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';

const DAY_MS = 86_400_000;
const startMs = Date.UTC(2026, 8, 6, 8);
const endMs = startMs + 60 * 60_000;
const request = {startMs, endMs};
const iso = (value: number) => new Date(value).toISOString();
const profile = [
  {
    defaultProfile: 'Default',
    store: {Default: {basal: [{time: '00:00', timeAsSeconds: 0, value: 1}]}},
  },
] as unknown as ProfileDataType;
const fresh = <T>(records: T[]): NightscoutRangeResult<T> => ({
  records,
  freshness: {kind: 'fresh', fetchedAtMs: endMs},
});
const bolus = (amount: number, timestampMs = startMs) => ({
  eventType: 'Correction Bolus',
  insulin: amount,
  created_at: iso(timestampMs),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => {
    resolve = finish;
  });
  return {promise, resolve};
}
function fixture() {
  let scope = 'source-a:revision-1';
  let now = endMs;
  const fetchTreatments = jest
    .fn<
      ReturnType<InsulinContextDependencies['fetchTreatments']>,
      Parameters<InsulinContextDependencies['fetchTreatments']>
    >()
    .mockResolvedValue(fresh([bolus(1.25)]));
  const fetchDeviceStatus = jest
    .fn<
      ReturnType<InsulinContextDependencies['fetchDeviceStatus']>,
      Parameters<InsulinContextDependencies['fetchDeviceStatus']>
    >()
    .mockResolvedValue(
      fresh<DeviceStatusEntry>([
        {created_at: iso(startMs), loop: {iob: {iob: 1.2}, cob: {cob: 18}}},
      ]),
    );
  const fetchProfile = jest
    .fn<
      ReturnType<InsulinContextDependencies['fetchProfile']>,
      Parameters<InsulinContextDependencies['fetchProfile']>
    >()
    .mockResolvedValue(profile);
  const load = createInsulinContextLoader({
    fetchTreatments,
    fetchDeviceStatus,
    fetchProfile,
    getScopeKey: () => scope,
    now: () => now,
  });
  return {
    load,
    fetchTreatments,
    fetchDeviceStatus,
    fetchProfile,
    setScope: (next: string) => {
      scope = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('shared insulin context source', () => {
  it('shares an in-flight fetch and completed cache between chart and AI readers, with independent normalized results', async () => {
    const f = fixture();
    const treatments =
      deferred<NightscoutRangeResult<Record<string, unknown>>>();
    f.fetchTreatments.mockReturnValueOnce(treatments.promise);
    const chart = f.load(request);
    const ai = f.load(request);
    treatments.resolve(fresh([bolus(1.25)]));
    const [chartContext, aiContext] = await Promise.all([chart, ai]);
    expect(chartContext.insulinData).toEqual(aiContext.insulinData);
    expect(aiContext.loadSamples).toEqual([
      {timestampMs: startMs, iob: 1.2, cob: 18},
    ]);
    chartContext.insulinData[0]!.amount = 9;
    chartContext.basalProfileData[0]!.value = 9;
    const cached = await f.load(request);
    expect(cached.insulinData[0]!.amount).toBe(1.25);
    expect(cached.basalProfileData[0]!.value).toBe(1);
    expect(aiContext.insulinData[0]!.amount).toBe(1.25);
    expect(f.fetchTreatments).toHaveBeenCalledTimes(1);
    expect(f.fetchDeviceStatus).toHaveBeenCalledTimes(1);
    expect(f.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('refreshes explicit requests and expires completed data after one minute', async () => {
    const f = fixture();
    await f.load(request);
    f.fetchTreatments.mockResolvedValueOnce(fresh([bolus(2)]));
    const refreshed = await f.load({...request, forceRefresh: true});
    expect(refreshed.insulinData[0]!.amount).toBe(2);
    expect(f.fetchTreatments).toHaveBeenCalledTimes(2);
    f.advance(59_999);
    expect((await f.load(request)).insulinData[0]!.amount).toBe(2);
    expect(f.fetchTreatments).toHaveBeenCalledTimes(2);
    f.advance(1);
    await f.load(request);
    expect(f.fetchTreatments).toHaveBeenCalledTimes(3);
  });

  it('distinguishes successful empty treatment/status data from unavailable resources', async () => {
    const f = fixture();
    f.fetchTreatments.mockResolvedValueOnce(fresh([]));
    f.fetchDeviceStatus.mockResolvedValueOnce(fresh([]));
    const empty = await f.load(request);
    expect(empty.insulinData).toEqual([]);
    expect(empty.loadSamples).toEqual([]);
    expect(empty.availability).toEqual({
      treatments: 'available',
      deviceStatus: 'available',
      profile: 'available',
    });
    f.fetchTreatments.mockRejectedValueOnce(new Error('synthetic outage'));
    f.fetchDeviceStatus.mockRejectedValueOnce(new Error('synthetic outage'));
    f.fetchProfile.mockRejectedValueOnce(new Error('synthetic outage'));
    const unavailable = await f.load({...request, forceRefresh: true});
    expect(unavailable.insulinData).toEqual([]);
    expect(unavailable.loadSamples).toEqual([]);
    expect(unavailable.profileData).toBeNull();
    expect(unavailable.availability).toEqual({
      treatments: 'unavailable',
      deviceStatus: 'unavailable',
      profile: 'unavailable',
    });
    expect(unavailable.freshness.kind).toBe('stale');
  });

  it('preserves stale source evidence and marks only the affected resource stale', async () => {
    const f = fixture();
    f.fetchTreatments.mockResolvedValueOnce({
      records: [bolus(1.25)],
      freshness: {
        kind: 'stale',
        fetchedAtMs: startMs,
        reason: 'network-unavailable',
      },
    });
    const result = await f.load(request);
    expect(result.insulinData[0]!.amount).toBe(1.25);
    expect(result.availability).toEqual({
      treatments: 'stale',
      deviceStatus: 'available',
      profile: 'available',
    });
    expect(result.freshness).toMatchObject({
      kind: 'stale',
      fetchedAtMs: startMs,
    });
  });

  it('uses one 24-hour basal carry-in window while clipping event and load samples to the exclusive requested range', async () => {
    const f = fixture();
    const prior = startMs - 15 * 60_000;
    const temp = {
      eventType: 'Temp Basal',
      created_at: iso(prior),
      duration: 30,
      rate: 2,
    };
    const carb = {created_at: iso(startMs), carbs: 12};
    f.fetchTreatments.mockResolvedValueOnce(
      fresh([
        temp,
        bolus(8, prior),
        {created_at: iso(prior), carbs: 5},
        bolus(1.25),
        carb,
        bolus(9, endMs),
        {created_at: iso(endMs), carbs: 20},
      ]),
    );
    f.fetchDeviceStatus.mockResolvedValueOnce(
      fresh([
        {created_at: iso(prior), iob: 9},
        {created_at: iso(startMs), iob: 0, cob: 0},
        {created_at: iso(endMs), iob: 9},
      ]),
    );
    const result = await f.load(request);
    expect(f.fetchTreatments).toHaveBeenCalledWith(
      new Date(startMs - DAY_MS),
      new Date(endMs - 1),
    );
    expect(f.fetchDeviceStatus).toHaveBeenCalledWith(
      new Date(startMs),
      new Date(endMs - 1),
    );
    expect(f.fetchProfile).toHaveBeenCalledWith(iso(startMs));
    expect(result.treatments).toEqual([bolus(1.25), carb]);
    expect(result.carbTreatments.map(item => item.carbs)).toEqual([12]);
    expect(result.insulinData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tempBasal',
          rate: 2,
          startTime: iso(prior),
        }),
        expect.objectContaining({type: 'bolus', amount: 1.25}),
      ]),
    );
    expect(result.insulinData).toHaveLength(2);
    expect(result.loadSamples).toEqual([
      {timestampMs: startMs, iob: 0, cob: 0},
    ]);
    expect(
      calculateTotalInsulin(
        result.insulinData,
        result.basalProfileData,
        new Date(startMs),
        new Date(endMs),
      ),
    ).toEqual({totalBasal: 1.25, totalBolus: 1.25});
  });

  it('rejects an old revision completion while preserving the replacement in-flight request and its cache', async () => {
    const f = fixture();
    const oldData = deferred<NightscoutRangeResult<Record<string, unknown>>>();
    const newData = deferred<NightscoutRangeResult<Record<string, unknown>>>();
    f.fetchTreatments
      .mockReturnValueOnce(oldData.promise)
      .mockReturnValueOnce(newData.promise);
    const oldRequest = f.load(request).catch((error: unknown) => error);
    f.setScope('source-a:revision-2');
    const nextRequest = f.load(request);
    oldData.resolve(fresh([bolus(8)]));
    expect(await oldRequest).toEqual(
      expect.objectContaining({
        message: 'Nightscout source changed while loading insulin data.',
      }),
    );
    const retry = f.load(request);
    newData.resolve(fresh([bolus(2)]));
    const [next, retried] = await Promise.all([nextRequest, retry]);
    expect(next.insulinData[0]!.amount).toBe(2);
    expect(retried.insulinData[0]!.amount).toBe(2);
    expect((await f.load(request)).insulinData[0]!.amount).toBe(2);
    expect(f.fetchTreatments).toHaveBeenCalledTimes(2);
  });

  it('includes profile-as-of in the cache identity', async () => {
    const f = fixture();
    await f.load(request);
    await f.load({...request, profileAsOfMs: endMs});
    expect(f.fetchProfile).toHaveBeenLastCalledWith(iso(endMs));
    expect(f.fetchProfile).toHaveBeenCalledTimes(2);
  });
});
