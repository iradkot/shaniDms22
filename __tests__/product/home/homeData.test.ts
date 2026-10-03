import {
  buildHomeTodayData,
  buildHomeWeeklyGlucoseData,
  getHomeCompletedWeekPeriod,
  loadHomeWeeklyInsulinData,
} from 'app/product/home/homeData';
import {getLocalDayPeriod, moveLocalDay} from 'app/modules/dailyOverview';
import type {DailyOverviewSourceSnapshot} from 'app/modules/dailyOverview';

// Keep Node's test-only environment out of the shared native/Web type graph.
declare const process: {readonly env: {readonly TZ?: string}};

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const today = getLocalDayPeriod(new Date(2026, 8, 8, 12).getTime());
const emptySnapshot: DailyOverviewSourceSnapshot = {
  glucoseSamples: [],
  insulinSummary: {quality: 'unavailable'},
};

describe('home dashboard data', () => {
  it('shares validated today metrics and splits the graph at missing readings', () => {
    const data = buildHomeTodayData({
      period: today,
      observedEndMs: today.startMs + HOUR,
      thresholds,
      source: {
        insulinSummary: {
          quality: 'available',
          basalUnits: 0.8,
          bolusUnits: 2.25,
        },
        glucoseSamples: [
          {timestampMs: today.startMs, valueMgDl: 100},
          {timestampMs: today.startMs + 5 * MINUTE, valueMgDl: 120},
          {timestampMs: today.startMs + 5 * MINUTE, valueMgDl: 120},
          {timestampMs: today.startMs + 30 * MINUTE, valueMgDl: 150},
          {timestampMs: today.startMs + 35 * MINUTE, valueMgDl: -2},
          {timestampMs: today.startMs + HOUR, valueMgDl: 300},
          {timestampMs: today.endMs - MINUTE, valueMgDl: 400},
        ],
      },
    });
    expect(data.overview.validSampleCount).toBe(3);
    expect(data.overview.meanGlucoseMgDl).toBe(123.33);
    expect(data.overview.insulinSummary).toEqual({
      quality: 'available',
      basalUnits: 0.8,
      bolusUnits: 2.25,
      totalUnits: 3.05,
    });
    expect(data.elapsedCoverage).toEqual({
      validSampleCount: 3,
      expectedSampleCount: 12,
      coveragePercent: 25,
      coverageQuality: 'low',
    });
    expect(data.overview.coveragePercent).toBeLessThan(
      data.elapsedCoverage.coveragePercent,
    );
    expect(data.glucose.glucoseSamples).toHaveLength(3);
    expect(data.glucose.glucoseSegments.map(segment => segment.length)).toEqual(
      [2, 1],
    );
    expect(data.observedPeriod.endMs).toBe(today.startMs + HOUR);
  });

  it('represents exact midnight without an invalid elapsed period or invented insulin', () => {
    const data = buildHomeTodayData({
      period: today,
      observedEndMs: today.startMs,
      thresholds,
      source: {
        ...emptySnapshot,
        insulinSummary: {quality: 'available', basalUnits: 5, bolusUnits: 0},
      },
    });
    expect(data.overview.insulinSummary).toEqual({quality: 'unavailable'});
    expect(data.elapsedCoverage).toEqual({
      validSampleCount: 0,
      expectedSampleCount: 0,
      coveragePercent: 0,
      coverageQuality: 'no-data',
    });
  });

  it.each([
    [2026, 2, 9, -1],
    [2026, 10, 2, 1],
  ])(
    'keeps seven completed calendar days across a DST boundary (%s/%s/%s)',
    (year, month, date, extraHours) => {
      const now = new Date(year!, month!, date!, 12).getTime();
      const period = getHomeCompletedWeekPeriod(now);
      const data = buildHomeWeeklyGlucoseData(period, [], thresholds);
      expect(period.endMs).toBe(new Date(year!, month!, date!).getTime());
      expect(period.startMs).toBe(new Date(year!, month!, date! - 7).getTime());
      expect(data.days).toHaveLength(7);
      for (const [index, day] of data.days.entries()) {
        expect(new Date(day.period.startMs).getHours()).toBe(0);
        expect(day.period.endMs).toBe(moveLocalDay(day.period.startMs, 1));
        expect(day.period.startMs).toBe(moveLocalDay(period.startMs, index));
      }
      if (process.env.TZ === 'America/New_York') {
        expect(period.endMs - period.startMs).toBe(
          (7 * 24 + extraHours!) * HOUR,
        );
        expect(
          data.days.some(
            day => day.period.endMs - day.period.startMs !== 24 * HOUR,
          ),
        ).toBe(true);
      }
    },
  );

  it('keeps missing weekly glucose days empty and excludes today', () => {
    const period = getHomeCompletedWeekPeriod(today.startMs);
    const data = buildHomeWeeklyGlucoseData(
      period,
      [
        {timestampMs: period.startMs + HOUR, valueMgDl: 90},
        {timestampMs: period.startMs + HOUR, valueMgDl: 90},
        {timestampMs: moveLocalDay(period.startMs, 2) + HOUR, valueMgDl: 210},
        {timestampMs: period.endMs, valueMgDl: 500},
      ],
      thresholds,
    );
    expect(data.days.map(day => day.overview.meanGlucoseMgDl)).toEqual([
      90,
      undefined,
      210,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(data.days[0]?.overview.validSampleCount).toBe(1);
    expect(data.days[0]?.overview.excludedSampleCount).toBe(0);
    expect(data.days[1]?.overview.coverageQuality).toBe('no-data');
    expect(data.days[6]?.period.endMs).toBe(today.startMs);
  });

  it('loads weekly insulin with at most two simultaneous days and preserves failed and missing days', async () => {
    const period = getHomeCompletedWeekPeriod(today.startMs);
    let active = 0;
    let maximum = 0;
    const loadDailyOverview = jest.fn(
      async (day: {startMs: number; endMs: number}) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        if (day.startMs === moveLocalDay(period.startMs, 1)) {
          throw new Error('offline');
        }
        return day.startMs === moveLocalDay(period.startMs, 2)
          ? emptySnapshot
          : {
              glucoseSamples: [],
              insulinSummary: {
                quality: 'available' as const,
                basalUnits: 12.5,
                bolusUnits: 5.2,
              },
            };
      },
    );
    const data = await loadHomeWeeklyInsulinData({loadDailyOverview}, period);
    expect(maximum).toBe(2);
    expect(loadDailyOverview).toHaveBeenCalledTimes(7);
    expect(data.days.map(day => day.kind)).toEqual([
      'ready',
      'error',
      'unavailable',
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
    expect(data.days[0]).toMatchObject({insulinSummary: {totalUnits: 17.7}});
    expect(data.days[2]).not.toHaveProperty('insulinSummary');
  });

  it('stops queued weekly requests when the scope becomes obsolete', async () => {
    let active = true;
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const loadDailyOverview = jest.fn(async () => {
      await pending;
      return emptySnapshot;
    });
    const work = loadHomeWeeklyInsulinData(
      {loadDailyOverview},
      getHomeCompletedWeekPeriod(today.startMs),
      () => active,
    );
    expect(loadDailyOverview).toHaveBeenCalledTimes(2);
    active = false;
    release?.();
    await expect(work).rejects.toThrow('no longer current');
    expect(loadDailyOverview).toHaveBeenCalledTimes(2);
  });
});
