import {createRecordedInsulinDataSource} from 'app/services/insulin/recordedInsulinDataSource';
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
