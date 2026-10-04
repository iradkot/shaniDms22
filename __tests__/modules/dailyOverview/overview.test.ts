import {
  DailyOverviewInputError,
  buildDailyOverview,
  getLocalDayPeriod,
  moveLocalDay,
} from 'app/modules/dailyOverview';
import {TrendsOverviewInputError} from 'app/modules/trends';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localNoon = (year: number, month: number, day: number): number =>
  new Date(year, month, day, 12).getTime();

describe('Daily Overview domain', () => {
  it('preserves source freshness and makes omitted or invalid metadata explicitly unknown', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const summarize = (
      glucoseFreshness?: Parameters<
        typeof buildDailyOverview
      >[0]['source']['glucoseFreshness'],
    ) =>
      buildDailyOverview({
        period,
        asOfMs: period.startMs + 600_000,
        expectedSampleIntervalMs: 300_000,
        thresholds,
        source: {
          glucoseSamples: [{timestampMs: period.startMs, valueMgDl: 123}],
          insulinSummary: {quality: 'unavailable'},
          ...(glucoseFreshness ? {glucoseFreshness} : {}),
        },
      });
    const stale = {
      kind: 'stale' as const,
      fetchedAtMs: period.startMs + 120_000,
    };
    expect(summarize(stale).glucoseFreshness).toEqual(stale);
    expect(summarize(stale).ranges?.targetPercent).toBe(100);
    expect(summarize().glucoseFreshness).toEqual({kind: 'unknown'});
    expect(
      summarize({kind: 'fresh', fetchedAtMs: NaN}).glucoseFreshness,
    ).toEqual({kind: 'unknown'});
  });

  it('weights the observed duration of uneven readings without filling gaps', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const overview = buildDailyOverview({
      period,
      asOfMs: period.startMs + 10 * 60_000,
      expectedSampleIntervalMs: 5 * 60_000,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: period.startMs, valueMgDl: 100},
          {timestampMs: period.startMs + 60_000, valueMgDl: 200},
        ],
        insulinSummary: {quality: 'unavailable'},
      },
    });
    expect(overview.ranges?.targetPercent).toBe(16.67);
    expect(overview.coveragePercent).toBe(60);
    expect(overview.coverageQuality).toBe('low');
    expect(overview.meanGlucoseMgDl).toBe(150);
    expect(overview.validSampleCount).toBe(2);
  });

  it('excludes daily outliers from sample statistics as well as elapsed ranges', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const overview = buildDailyOverview({
      period,
      asOfMs: period.startMs + 15 * 60_000,
      expectedSampleIntervalMs: 5 * 60_000,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: period.startMs, valueMgDl: 19},
          {timestampMs: period.startMs + 5 * 60_000, valueMgDl: 120},
          {timestampMs: period.startMs + 10 * 60_000, valueMgDl: 601},
        ],
        insulinSummary: {quality: 'unavailable'},
      },
    });
    expect(overview).toMatchObject({
      validSampleCount: 1,
      excludedSampleCount: 2,
      meanGlucoseMgDl: 120,
      minimumGlucoseMgDl: 120,
      maximumGlucoseMgDl: 120,
      coveragePercent: 33.33,
    });
    expect(overview.ranges?.targetPercent).toBe(100);
  });

  it('uses midnight carry-in for observed time without adding it to the selected-day mean', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const overview = buildDailyOverview({
      period,
      asOfMs: period.startMs + 10 * 60_000,
      expectedSampleIntervalMs: 5 * 60_000,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: period.startMs - 2 * 60_000, valueMgDl: 100},
          {timestampMs: period.startMs + 3 * 60_000, valueMgDl: 200},
        ],
        insulinSummary: {quality: 'unavailable'},
      },
    });
    expect(overview.coveragePercent).toBe(80);
    expect(overview.ranges?.targetPercent).toBe(37.5);
    expect(overview.validSampleCount).toBe(1);
    expect(overview.meanGlucoseMgDl).toBe(200);
  });

  it('keeps only recorded bolus from legacy estimates and never totals partial basal coverage', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const summarize = (
      insulinSummary: Parameters<
        typeof buildDailyOverview
      >[0]['source']['insulinSummary'],
    ) =>
      buildDailyOverview({
        period,
        thresholds,
        expectedSampleIntervalMs: 300_000,
        source: {glucoseSamples: [], insulinSummary},
      }).insulinSummary;
    expect(
      summarize({
        quality: 'available',
        basalUnits: 24,
        bolusUnits: 2,
        basalEstimated: true,
      }),
    ).toEqual({
      quality: 'partial',
      bolusUnits: 2,
      basalCoveredMs: 0,
      basalCoveragePercent: 0,
    });
    const partial = summarize({
      quality: 'available',
      basalUnits: 2,
      bolusUnits: 3,
      basalCoveragePercent: 50,
      basalCoveredMs: 43_200_000,
    });
    expect(partial).toMatchObject({
      quality: 'partial',
      basalUnits: 2,
      bolusUnits: 3,
      basalCoveragePercent: 50,
    });
    expect(partial).not.toHaveProperty('totalUnits');
  });

  it('keeps explicit estimates separate from recorded subtotal and coverage', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28).getTime());
    const source = {
      quality: 'partial' as const,
      basalUnits: 1.8,
      bolusUnits: 2,
      basalCoveredMs: 3_600_000,
      basalCoveragePercent: 33,
      estimatedBasalUnits: 3.8,
      estimatedTotalUnits: 5.8,
    };
    const summarize = (insulinSummary: typeof source) =>
      buildDailyOverview({
        period,
        thresholds,
        expectedSampleIntervalMs: 300_000,
        source: {glucoseSamples: [], insulinSummary},
      }).insulinSummary;
    expect(summarize(source)).toEqual(source);
    expect(summarize(source)).not.toHaveProperty('totalUnits');
    expect(() =>
      summarize({...source, estimatedBasalUnits: Number.NaN}),
    ).toThrow(DailyOverviewInputError);
    expect(() => summarize({...source, estimatedTotalUnits: 99})).toThrow(
      DailyOverviewInputError,
    );
  });
  it('uses elapsed-day coverage and excludes future readings while preserving selected-day identity', () => {
    const asOfMs = new Date(2026, 8, 28, 3, 15).getTime();
    const period = getLocalDayPeriod(asOfMs);
    const samples = Array.from({length: 39}, (_, index) => ({
      timestampMs: period.startMs + index * 5 * 60_000,
      valueMgDl: 120,
    }));
    const overview = buildDailyOverview({
      period,
      asOfMs,
      expectedSampleIntervalMs: 5 * 60_000,
      thresholds,
      source: {
        glucoseSamples: [
          ...samples,
          {timestampMs: period.endMs - 1, valueMgDl: 400},
        ],
        insulinSummary: {quality: 'unavailable'},
      },
    });
    expect(overview.period).toEqual(period);
    expect(overview.observedPeriod).toEqual({
      startMs: period.startMs,
      endMs: asOfMs,
    });
    expect(overview).toMatchObject({
      isPartialDay: true,
      validSampleCount: 39,
      excludedSampleCount: 1,
      expectedSampleCount: 39,
      coveragePercent: 100,
      coverageQuality: 'adequate',
      meanGlucoseMgDl: 120,
    });
    expect(overview.ranges?.targetPercent).toBe(100);
  });

  it('has no expected readings or numeric glucose summary exactly at midnight', () => {
    const period = getLocalDayPeriod(new Date(2026, 8, 28, 0).getTime());
    const overview = buildDailyOverview({
      period,
      asOfMs: period.startMs,
      expectedSampleIntervalMs: 5 * 60_000,
      thresholds,
      source: {
        glucoseSamples: [{timestampMs: period.startMs, valueMgDl: 120}],
        insulinSummary: {quality: 'unavailable'},
      },
    });
    expect(overview).toMatchObject({
      validSampleCount: 0,
      expectedSampleCount: 0,
      coverageQuality: 'no-data',
      isPartialDay: true,
    });
    expect(overview.ranges).toBeUndefined();
  });

  it('prepares each source reading only once for all descriptive daily metrics', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));
    const sampleCount = 288;
    const interval = (period.endMs - period.startMs) / sampleCount;
    let valueReads = 0;
    const glucoseSamples = Array.from({length: sampleCount}, (_, index) => ({
      timestampMs: period.startMs + index * interval,
      get valueMgDl() {
        valueReads += 1;
        return 70 + (index % 200);
      },
    }));

    const overview = buildDailyOverview({
      period,
      expectedSampleIntervalMs: interval,
      thresholds,
      source: {glucoseSamples, insulinSummary: {quality: 'unavailable'}},
    });

    expect(overview.validSampleCount).toBe(sampleCount);
    expect(overview.minimumGlucoseMgDl).toBe(70);
    expect(overview.maximumGlucoseMgDl).toBe(269);
    // One integrity pass (finite + positive) and one extraction, regardless of
    // how many descriptive metrics the caller requests. No clock-time budget.
    expect(valueReads).toBeLessThanOrEqual(sampleCount * 3);
  });

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

  it('keeps cadence validation before threshold and insulin validation', () => {
    const period = getLocalDayPeriod(localNoon(2026, 0, 15));
    const input = {
      period,
      expectedSampleIntervalMs: 0,
      thresholds: {...thresholds, targetMinMgDl: NaN},
      source: {
        glucoseSamples: [],
        insulinSummary: {
          quality: 'available' as const,
          basalUnits: -1,
          bolusUnits: 2,
        },
      },
    };

    expect(() => buildDailyOverview(input)).toThrow(TrendsOverviewInputError);
    expect(() => buildDailyOverview(input)).toThrow('Expected sample interval');
    expect(() =>
      buildDailyOverview({...input, expectedSampleIntervalMs: 5 * 60_000}),
    ).toThrow('Range threshold');
    expect(() =>
      buildDailyOverview({
        ...input,
        period: {...period, startMs: period.startMs + 1},
      }),
    ).toThrow(DailyOverviewInputError);
  });
});
