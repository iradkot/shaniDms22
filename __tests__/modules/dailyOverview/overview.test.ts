import {
  DailyOverviewInputError,
  buildDailyOverview,
  getLocalDayPeriod,
  moveLocalDay,
} from 'app/modules/dailyOverview';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localNoon = (year: number, month: number, day: number): number =>
  new Date(year, month, day, 12).getTime();

describe('Daily Overview domain', () => {
  it('normalizes a timestamp to one local calendar day and moves by local days', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));

    expect(new Date(period.startMs).getFullYear()).toBe(2026);
    expect(new Date(period.startMs).getMonth()).toBe(0);
    expect(new Date(period.startMs).getDate()).toBe(15);
    expect(new Date(period.startMs).getHours()).toBe(0);
    expect(new Date(period.startMs).getMinutes()).toBe(0);
    expect(new Date(period.endMs).getDate()).toBe(
      new Date(moveLocalDay(period.startMs, 1)).getDate(),
    );
    expect(moveLocalDay(period.startMs, -1)).toBe(
      new Date(2026, 0, 14).getTime(),
    );
  });

  it('uses the shared Trends integrity and range semantics for descriptive daily metrics', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));
    const values = [53, 54, 69, 70, 180, 181, 250, 251] as const;
    const interval = (period.endMs - period.startMs) / values.length;

    const overview = buildDailyOverview({
      period,
      expectedSampleIntervalMs: interval,
      thresholds,
      source: {
        glucoseSamples: values.map((valueMgDl, index) => ({
          timestampMs: period.startMs + index * interval,
          valueMgDl,
        })),
        insulinSummary: {
          quality: 'available',
          basalUnits: 5.5,
          bolusUnits: 3.5,
        },
      },
    });

    expect(overview).toMatchObject({
      validSampleCount: 8,
      expectedSampleCount: 8,
      coveragePercent: 100,
      coverageQuality: 'adequate',
      ranges: {
        veryLowPercent: 12.5,
        lowPercent: 25,
        targetPercent: 25,
        highPercent: 25,
        veryHighPercent: 12.5,
      },
      meanGlucoseMgDl: 138.5,
      minimumGlucoseMgDl: 53,
      maximumGlucoseMgDl: 251,
      coefficientOfVariationPercent: expect.any(Number),
      insulinSummary: {
        quality: 'available',
        basalUnits: 5.5,
        bolusUnits: 3.5,
        totalUnits: 9,
      },
    });
    expect(overview).not.toHaveProperty('gmiPercent');
    expect(overview).not.toHaveProperty('gri');
    expect(overview).not.toHaveProperty('score');
  });

  it('keeps unavailable insulin explicit and never converts missing data to zero', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));

    const overview = buildDailyOverview({
      period,
      expectedSampleIntervalMs: 5 * 60 * 1000,
      thresholds,
      source: {
        glucoseSamples: [],
        insulinSummary: {quality: 'unavailable'},
      },
    });

    expect(overview.insulinSummary).toEqual({quality: 'unavailable'});
    expect(overview.ranges).toBeUndefined();
    expect(overview.meanGlucoseMgDl).toBeUndefined();
    expect(overview.minimumGlucoseMgDl).toBeUndefined();
    expect(overview.maximumGlucoseMgDl).toBeUndefined();
    expect(overview.coefficientOfVariationPercent).toBeUndefined();
  });

  it('deduplicates timestamps before daily metric weighting', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));
    const interval = (period.endMs - period.startMs) / 2;
    const firstTimestamp = period.startMs;

    const overview = buildDailyOverview({
      period,
      expectedSampleIntervalMs: interval,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: firstTimestamp, valueMgDl: 100},
          {timestampMs: firstTimestamp, valueMgDl: 300},
          {timestampMs: firstTimestamp + interval, valueMgDl: 120},
        ],
        insulinSummary: {quality: 'unavailable'},
      },
    });

    expect(overview).toMatchObject({
      validSampleCount: 2,
      duplicateSampleCount: 1,
      meanGlucoseMgDl: 110,
      maximumGlucoseMgDl: 120,
    });
  });

  it('rejects invalid available insulin totals instead of presenting them', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));

    expect(() =>
      buildDailyOverview({
        period,
        expectedSampleIntervalMs: 5 * 60 * 1000,
        thresholds,
        source: {
          glucoseSamples: [],
          insulinSummary: {
            quality: 'available',
            basalUnits: Number.NaN,
            bolusUnits: 2,
          },
        },
      }),
    ).toThrow(DailyOverviewInputError);
  });
});
