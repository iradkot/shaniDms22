import {createRecordedInsulinDataSource} from 'app/services/insulin/createRecordedInsulinDataSource';
import {getLocalDayPeriod, moveLocalDay} from 'app/modules/dailyOverview';

const clock = new Date(2026, 8, 28, 12).getTime();
const period = getLocalDayPeriod(clock);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(success => {
    resolve = success;
  });
  return {promise, resolve};
};
const fresh = (records: Record<string, unknown>[]) => ({
  records,
  freshness: {kind: 'fresh' as const, fetchedAtMs: clock},
});

describe('shared recorded insulin loading', () => {
  it('refreshes the shared treatment observation when a live estimate cutoff advances', async () => {
    let currentMs = clock;
    const fetchTreatments = jest.fn(async () => ({
      records: [],
      freshness: {kind: 'fresh' as const, fetchedAtMs: currentMs},
    }));
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      fetchBasalProfile: async () => ({
        profile: {entries: [{time: '00:00', value: 1}]},
        freshness: fresh([]).freshness,
      }),
      getScopeKey: () => 'a',
      now: () => currentMs,
    });
    expect(
      (
        await source.loadWindow(
          {...period, endMs: currentMs},
          {includeEstimates: true},
        )
      ).estimatedTotalUnits,
    ).toBeCloseTo(12);
    currentMs += 10_000;
    const [today, history] = await Promise.all([
      source.loadWindow(
        {...period, endMs: currentMs},
        {includeEstimates: true},
      ),
      source.loadDailyBundle(
        {period, asOfMs: currentMs},
        {includeEstimates: true},
      ),
    ]);
    expect(today.estimatedTotalUnits).toBeCloseTo(12 + 10 / 3600);
    expect(history.current.estimatedTotalUnits).toBeCloseTo(
      today.estimatedTotalUnits!,
    );
    expect(fetchTreatments).toHaveBeenCalledTimes(2);
  });

  it('keeps recorded evidence when the sum of modeled days would overflow', async () => {
    const endMs = moveLocalDay(period.startMs, 8);
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => ({
        records: [],
        freshness: {kind: 'fresh', fetchedAtMs: endMs},
      }),
      fetchBasalProfile: async () => ({
        profile: {entries: [{time: '00:00', value: 1e306}]},
        freshness: {kind: 'fresh', fetchedAtMs: endMs},
      }),
      getScopeKey: () => 'a',
      now: () => endMs,
    });
    const result = await source.loadWindow(
      {startMs: period.startMs, endMs},
      {includeEstimates: true},
    );
    expect(result).toMatchObject({quality: 'partial', bolusUnits: 0});
    expect(result).not.toHaveProperty('estimatedTotalUnits');
  });

  it('adds an opt-in total estimate without double-counting a completed temp basal', async () => {
    const threeHours = {
      startMs: period.startMs,
      endMs: period.startMs + 3 * 3_600_000,
    };
    const records = [
      {
        eventType: 'Correction Bolus',
        created_at: new Date(period.startMs).toISOString(),
        insulin: 2,
      },
      {
        eventType: 'Temp Basal',
        created_at: new Date(period.startMs + 3_600_000).toISOString(),
        duration: 60,
        rate: 2,
        deliveredUnits: 1.8,
      },
    ];
    const fetchBasalProfile = jest.fn(async () => ({
      profile: {entries: [{time: '00:00', value: 1}]},
      freshness: fresh([]).freshness,
    }));
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => fresh(records),
      fetchBasalProfile,
      getScopeKey: () => 'a',
      now: () => clock,
    });
    const recorded = await source.loadWindow(threeHours);
    expect(recorded).toMatchObject({
      quality: 'partial',
      basalUnits: 1.8,
      bolusUnits: 2,
    });
    expect(recorded).not.toHaveProperty('estimatedTotalUnits');
    expect(fetchBasalProfile).not.toHaveBeenCalled();
    const estimated = await source.loadWindow(threeHours, {
      includeEstimates: true,
    });
    expect(estimated).toMatchObject({
      quality: 'partial',
      basalUnits: 1.8,
      bolusUnits: 2,
    });
    expect(estimated.estimatedBasalUnits).toBeCloseTo(3.8);
    expect(estimated.estimatedTotalUnits).toBeCloseTo(5.8);
    expect(fetchBasalProfile).toHaveBeenCalledWith(
      new Date(period.startMs),
      new Date(threeHours.endMs - 1),
    );
  });

  it('shares current profile reads and uses each historical day schedule for total comparisons', async () => {
    const fetchBasalProfile = jest.fn(async (asOf: Date) => ({
      profile: {
        entries: [{time: '00:00', value: +asOf === period.startMs ? 2 : 1}],
      },
      freshness: fresh([]).freshness,
    }));
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => fresh([]),
      fetchBasalProfile,
      getScopeKey: () => 'a',
      now: () => clock,
    });
    const [today, bundle] = await Promise.all([
      source.loadWindow({...period, endMs: clock}, {includeEstimates: true}),
      source.loadDailyBundle({period, asOfMs: clock}, {includeEstimates: true}),
    ]);
    expect(today.estimatedTotalUnits).toBeCloseTo(24);
    expect(bundle.comparison.yesterday?.estimatedTotalUnits).toBeCloseTo(12);
    expect(bundle.comparison.weekAverage?.estimatedTotalUnits).toBeCloseTo(12);
    expect(fetchBasalProfile).toHaveBeenCalledTimes(8);
    expect(fetchBasalProfile.mock.calls.map(call => +call[0]).sort()).toEqual(
      Array.from({length: 8}, (_, index) =>
        moveLocalDay(period.startMs, -index),
      ).sort(),
    );
  });

  it.each(['stale', 'failure'] as const)(
    'retains recorded amounts when the profile is %s',
    async mode => {
      const source = createRecordedInsulinDataSource({
        fetchTreatments: async () =>
          fresh([
            {
              eventType: 'Correction Bolus',
              created_at: new Date(period.startMs).toISOString(),
              insulin: 2,
            },
          ]),
        fetchBasalProfile: async () => {
          if (mode === 'failure') {
            throw new Error('offline');
          }
          return {
            profile: {entries: [{time: '00:00', value: 1}]},
            freshness: {kind: 'stale', fetchedAtMs: clock},
          };
        },
        getScopeKey: () => 'a',
        now: () => clock,
      });
      const result = await source.loadWindow(
        {...period, endMs: clock},
        {includeEstimates: true},
      );
      expect(result).toMatchObject({quality: 'partial', bolusUnits: 2});
      expect(result).not.toHaveProperty('estimatedTotalUnits');
    },
  );

  it('rejects an account change while a profile read is pending', async () => {
    let scope = 'a';
    const pending = deferred<{
      profile: {entries: {time: string; value: number}[]};
      freshness: ReturnType<typeof fresh>['freshness'];
    }>();
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => fresh([]),
      fetchBasalProfile: () => pending.promise,
      getScopeKey: () => scope,
      now: () => clock,
    });
    const result = source.loadWindow(
      {...period, endMs: clock},
      {includeEstimates: true},
    );
    await Promise.resolve();
    await Promise.resolve();
    scope = 'b';
    pending.resolve({
      profile: {entries: [{time: '00:00', value: 1}]},
      freshness: fresh([]).freshness,
    });
    await expect(result).rejects.toThrow('source changed');
  });

  it('does not certify a fresh but explicitly incomplete treatment response', async () => {
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => ({...fresh([]), complete: false}),
      getScopeKey: () => 'a',
      now: () => clock,
    });
    expect(await source.loadWindow({...period, endMs: clock})).toEqual({
      quality: 'unavailable',
    });
  });

  it('does not certify an unfinished recorded amount just because a cached snapshot ages', async () => {
    let now = period.startMs + 15_000;
    const fetchTreatments = jest.fn(async () => ({
      records: [
        {
          eventType: 'Temp Basal',
          created_at: new Date(period.startMs).toISOString(),
          duration: 0.5,
          deliveredUnits: 0.01,
        },
      ],
      freshness: {kind: 'fresh' as const, fetchedAtMs: period.startMs + 15_000},
    }));
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => 'a',
      now: () => now,
    });
    const window = {...period, endMs: period.startMs + 30_000};
    expect(await source.loadWindow(window)).not.toHaveProperty('basalUnits');
    now += 30_000;
    expect(await source.loadWindow(window)).not.toHaveProperty('basalUnits');
    expect(fetchTreatments).toHaveBeenCalledTimes(1);
  });

  it('fetches all requested days rather than silently truncating a multi-day window', async () => {
    const secondDay = moveLocalDay(period.startMs, 1);
    const endMs = moveLocalDay(period.startMs, 2);
    const fetchTreatments = jest.fn(async (start: Date, end: Date) => ({
      records: [
        {
          eventType: 'Correction Bolus',
          created_at: new Date(period.startMs + 3_600_000).toISOString(),
          insulin: 2,
        },
        {
          eventType: 'Correction Bolus',
          created_at: new Date(secondDay + 3_600_000).toISOString(),
          insulin: 3,
        },
      ].filter(
        record =>
          Date.parse(record.created_at) >= +start &&
          Date.parse(record.created_at) <= +end,
      ),
      freshness: {kind: 'fresh' as const, fetchedAtMs: endMs},
    }));
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => 'a',
      now: () => endMs,
    });
    expect(
      await source.loadWindow({startMs: period.startMs, endMs}),
    ).toMatchObject({bolusUnits: 5});
    expect(fetchTreatments.mock.calls[0]?.[1].getTime()).toBe(endMs - 1);
  });

  it('rejects invalid ranges before contacting a source', async () => {
    const fetchTreatments = jest.fn(async () => fresh([]));
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => 'a',
      now: () => clock,
    });
    await expect(
      source.loadWindow({startMs: clock, endMs: clock}),
    ).rejects.toThrow('range');
    expect(fetchTreatments).not.toHaveBeenCalled();
  });
  it('shares one bounded nine-day request between the current window and seven comparisons', async () => {
    const pending = deferred<ReturnType<typeof fresh>>();
    const fetchTreatments = jest.fn(() => pending.promise);
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => 'a',
      now: () => clock,
    });
    const today = source.loadWindow({...period, endMs: clock});
    const history = source.loadDailyBundle({period, asOfMs: clock});
    expect(fetchTreatments).toHaveBeenCalledTimes(1);
    expect(fetchTreatments).toHaveBeenCalledWith(
      new Date(moveLocalDay(period.startMs, -8)),
      new Date(period.endMs - 1),
    );
    pending.resolve(
      fresh(
        Array.from({length: 8}, (_, index) => ({
          _id: `dose${index}`,
          eventType: 'Correction Bolus',
          created_at: new Date(
            moveLocalDay(period.startMs, -index) + 3_600_000,
          ).toISOString(),
          insulin: 2,
        })),
      ),
    );
    expect(await today).toMatchObject({
      quality: 'partial',
      bolusUnits: 2,
      basalCoveragePercent: 0,
    });
    expect((await history).comparison.weekAverage).toMatchObject({
      quality: 'partial',
      bolusUnits: 2,
    });
    expect((await history).comparison.weekAverage).not.toHaveProperty(
      'totalUnits',
    );
    await source.loadDailyBundle({period, asOfMs: clock + 10_000});
    expect(fetchTreatments).toHaveBeenCalledTimes(1);
  });
  it('expires cached snapshots and never exposes stale history as known zero', async () => {
    let now = clock;
    const fetchTreatments = jest
      .fn()
      .mockResolvedValueOnce(fresh([]))
      .mockResolvedValueOnce({
        records: [],
        freshness: {
          kind: 'stale',
          fetchedAtMs: clock,
          reason: 'network-unavailable',
        },
      });
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => 'a',
      now: () => now,
    });
    expect(await source.loadWindow({...period, endMs: clock})).toMatchObject({
      quality: 'partial',
      bolusUnits: 0,
    });
    now += 60_001;
    expect(await source.loadWindow({...period, endMs: clock})).toEqual({
      quality: 'unavailable',
    });
    expect(fetchTreatments).toHaveBeenCalledTimes(2);
  });
  it('rejects an in-flight account switch and does not reuse the previous account cache', async () => {
    let scope = 'a';
    const pending = deferred<ReturnType<typeof fresh>>();
    const fetchTreatments = jest
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(fresh([]));
    const source = createRecordedInsulinDataSource({
      fetchTreatments,
      getScopeKey: () => scope,
      now: () => clock,
    });
    const prior = source.loadWindow({...period, endMs: clock});
    scope = 'b';
    pending.resolve(
      fresh([
        {
          eventType: 'Correction Bolus',
          created_at: new Date(period.startMs).toISOString(),
          insulin: 99,
        },
      ]),
    );
    await expect(prior).rejects.toThrow('source changed');
    expect(await source.loadWindow({...period, endMs: clock})).toMatchObject({
      bolusUnits: 0,
    });
    expect(fetchTreatments).toHaveBeenCalledTimes(2);
  });
  it('keeps history unavailable when the only transport fails', async () => {
    const source = createRecordedInsulinDataSource({
      fetchTreatments: async () => {
        throw new Error('offline');
      },
      getScopeKey: () => 'a',
      now: () => clock,
    });
    const result = await source.loadDailyBundle({period, asOfMs: clock});
    expect(result.current).toEqual({quality: 'unavailable'});
    expect(result.comparison.status).toBe('unavailable');
    expect(result.comparison.weekAverage).toBeUndefined();
  });
});
