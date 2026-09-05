import {
  TrendsOverviewInputError,
  buildMatchedPeriodComparison,
  buildTrendsOverview,
  previousMatchedPeriod,
} from 'app/modules/trends';

const FIVE_MINUTES = 5 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const samples = (startMs: number, values: readonly number[]) =>
  values.map((valueMgDl, index) => ({
    timestampMs: startMs + index * FIVE_MINUTES,
    valueMgDl,
  }));

describe('Trends Overview domain', () => {
  it('keeps short-period descriptive metrics but withholds representative GMI and GRI', () => {
    const overview = buildTrendsOverview({
      period: {startMs: 1_000_000, endMs: 1_000_000 + HOUR},
      expectedSampleIntervalMs: FIVE_MINUTES,
      thresholds,
      samples: samples(1_000_000, [53, 54, 55, 69, 70, 180, 181, 250, 251]),
    });

    expect(overview).toMatchObject({
      validSampleCount: 9,
      expectedSampleCount: 12,
      coveragePercent: 75,
      coverageQuality: 'adequate',
      durationQuality: 'short',
      interpretationQuality: 'partial',
      meanGlucoseMgDl: 129.22,
      gmiPercent: undefined,
      gmiFormulaVersion: undefined,
      gri: undefined,
      coefficientOfVariationPercent: expect.any(Number),
      ranges: {
        veryLowPercent: 11.11,
        lowPercent: 33.33,
        targetPercent: 22.22,
        highPercent: 22.22,
        veryHighPercent: 11.11,
      },
    });
    expect(overview.coefficientOfVariationPercent).toBeCloseTo(62.54, 1);
  });

  it('filters invalid and out-of-period samples without presenting empty data as zero glucose', () => {
    const startMs = 5_000_000;
    const overview = buildTrendsOverview({
      period: {startMs, endMs: startMs + HOUR},
      expectedSampleIntervalMs: FIVE_MINUTES,
      thresholds,
      samples: [
        {timestampMs: startMs - 1, valueMgDl: 100},
        {timestampMs: startMs, valueMgDl: Number.NaN},
        {timestampMs: startMs + FIVE_MINUTES, valueMgDl: -1},
        {timestampMs: startMs + HOUR, valueMgDl: 120},
      ],
    });

    expect(overview).toEqual({
      period: {startMs, endMs: startMs + HOUR},
      thresholds,
      timeZoneOffsetMinutes: 0,
      daysWithData: 0,
      validSampleCount: 0,
      excludedSampleCount: 4,
      duplicateSampleCount: 0,
      expectedSampleCount: 12,
      coveragePercent: 0,
      coverageQuality: 'no-data',
      durationQuality: 'short',
      interpretationQuality: 'no-data',
      largestGapMs: undefined,
      lastReadingTimestampMs: undefined,
      ranges: undefined,
      meanGlucoseMgDl: undefined,
      gmiPercent: undefined,
      gmiFormulaVersion: undefined,
      gri: undefined,
      coefficientOfVariationPercent: undefined,
    });
  });

  it('passes the representative gate at exactly 14 days and 70% coverage', () => {
    const startMs = 20 * DAY;
    const expectedSampleIntervalMs = DAY / 10;
    const overview = buildTrendsOverview({
      period: {startMs, endMs: startMs + 14 * DAY},
      expectedSampleIntervalMs,
      thresholds,
      samples: samples(
        startMs,
        Array(98)
          .fill(0)
          .map((_, index) => (index % 2 === 0 ? 100 : 200)),
      ).map((sample, index) => ({
        ...sample,
        timestampMs: startMs + index * expectedSampleIntervalMs,
      })),
    });

    expect(overview).toMatchObject({
      validSampleCount: 98,
      expectedSampleCount: 140,
      coveragePercent: 70,
      coverageQuality: 'adequate',
      durationQuality: 'representative',
      interpretationQuality: 'representative',
      gmiPercent: 6.9,
      gmiFormulaVersion: 'gmi-2018',
      gri: {
        formulaVersion: 'gri-2022',
        hypoglycemiaComponent: 0,
        hyperglycemiaComponent: 25,
        rawScore: 40,
        score: 40,
      },
    });
  });

  it('does not let rounded display coverage pass the 70 percent gate', () => {
    const startMs = 30 * DAY;
    const expectedSampleCount = 20_001;
    const expectedSampleIntervalMs =
      (14 * DAY) / expectedSampleCount;
    const overview = buildTrendsOverview({
      period: {startMs, endMs: startMs + 14 * DAY},
      expectedSampleIntervalMs,
      thresholds,
      samples: Array.from({length: 14_000}, (_, index) => ({
        timestampMs: startMs + index * expectedSampleIntervalMs,
        valueMgDl: 120,
      })),
    });

    expect(overview.coveragePercent).toBe(70);
    expect(overview.coverageQuality).toBe('low');
    expect(overview.interpretationQuality).toBe('partial');
    expect(overview.gmiPercent).toBeUndefined();
    expect(overview.gri).toBeUndefined();
  });

  it('does not let duplicate timestamps inflate coverage or change metric weighting', () => {
    const startMs = 40 * DAY;
    const period = {startMs, endMs: startMs + 14 * DAY};
    const uniqueSamples = Array.from({length: 14}, (_, index) => ({
      timestampMs: startMs + index * DAY,
      valueMgDl: index === 0 ? 100 : 120,
    }));
    const overview = buildTrendsOverview({
      period,
      expectedSampleIntervalMs: DAY,
      thresholds,
      samples: [
        ...uniqueSamples,
        {timestampMs: uniqueSamples[0]!.timestampMs, valueMgDl: 300},
      ],
    });

    expect(overview).toMatchObject({
      validSampleCount: 14,
      duplicateSampleCount: 1,
      excludedSampleCount: 0,
      coveragePercent: 100,
      meanGlucoseMgDl: 118.57,
      lastReadingTimestampMs: startMs + 13 * DAY,
      largestGapMs: DAY,
    });
  });

  it('counts local calendar days with evidence using the disclosed offset', () => {
    const period = {startMs: 0, endMs: 2 * DAY};
    const overview = buildTrendsOverview({
      period,
      expectedSampleIntervalMs: DAY,
      thresholds,
      timeZoneOffsetMinutes: 120,
      samples: [
        {timestampMs: 21 * HOUR, valueMgDl: 100},
        {timestampMs: 23 * HOUR, valueMgDl: 120},
      ],
    });

    expect(overview.daysWithData).toBe(2);
    expect(overview.timeZoneOffsetMinutes).toBe(120);
  });

  it('uses published canonical GRI boundaries independently of custom display thresholds', () => {
    const startMs = 60 * DAY;
    const values = [
      ...Array(5).fill(53),
      ...Array(10).fill(54),
      ...Array(50).fill(100),
      ...Array(20).fill(250),
      ...Array(15).fill(251),
    ];
    const expectedSampleIntervalMs = (14 * DAY) / values.length;
    const overview = buildTrendsOverview({
      period: {startMs, endMs: startMs + 14 * DAY},
      expectedSampleIntervalMs,
      thresholds: {
        veryLowMaxMgDl: 60,
        targetMinMgDl: 80,
        targetMaxMgDl: 170,
        highMaxMgDl: 220,
      },
      samples: values.map((valueMgDl, index) => ({
        timestampMs: startMs + index * expectedSampleIntervalMs,
        valueMgDl,
      })),
    });

    expect(overview.gri).toEqual({
      formulaVersion: 'gri-2022',
      hypoglycemiaComponent: 13,
      hyperglycemiaComponent: 25,
      rawScore: 79,
      score: 79,
    });
    expect(overview.ranges).not.toEqual({
      veryLowPercent: 5,
      lowPercent: 10,
      targetPercent: 50,
      highPercent: 20,
      veryHighPercent: 15,
    });
  });

  it('caps GRI at 100 after retaining the raw score', () => {
    const startMs = 80 * DAY;
    const overview = buildTrendsOverview({
      period: {startMs, endMs: startMs + 14 * DAY},
      expectedSampleIntervalMs: DAY,
      thresholds,
      samples: Array.from({length: 14}, (_, index) => ({
        timestampMs: startMs + index * DAY,
        valueMgDl: 40,
      })),
    });

    expect(overview.gri).toMatchObject({rawScore: 300, score: 100});
  });

  it('builds an adjacent equal-duration comparison and withholds deltas when coverage is low', () => {
    const currentPeriod = {startMs: 2 * HOUR, endMs: 3 * HOUR};
    expect(previousMatchedPeriod(currentPeriod)).toEqual({
      startMs: HOUR,
      endMs: 2 * HOUR,
    });

    const comparison = buildMatchedPeriodComparison({
      current: {
        period: currentPeriod,
        expectedSampleIntervalMs: FIVE_MINUTES,
        thresholds,
        samples: samples(currentPeriod.startMs, Array(12).fill(120)),
      },
      previous: {
        period: previousMatchedPeriod(currentPeriod),
        expectedSampleIntervalMs: FIVE_MINUTES,
        thresholds,
        samples: samples(HOUR, Array(6).fill(100)),
      },
    });

    expect(comparison.current.coverageQuality).toBe('adequate');
    expect(comparison.previous.coverageQuality).toBe('low');
    expect(comparison.comparable).toBe(false);
    expect(comparison.deltas).toBeUndefined();
  });

  it('returns neutral signed deltas only for equal representative periods', () => {
    const currentPeriod = {startMs: 28 * DAY, endMs: 42 * DAY};
    const comparison = buildMatchedPeriodComparison({
      current: {
        period: currentPeriod,
        expectedSampleIntervalMs: DAY,
        thresholds,
        samples: Array.from({length: 14}, (_, index) => ({
          timestampMs: currentPeriod.startMs + index * DAY,
          valueMgDl: 120,
        })),
      },
      previous: {
        period: previousMatchedPeriod(currentPeriod),
        expectedSampleIntervalMs: DAY,
        thresholds,
        samples: Array.from({length: 14}, (_, index) => ({
          timestampMs: 14 * DAY + index * DAY,
          valueMgDl: 100,
        })),
      },
    });

    expect(comparison.comparable).toBe(true);
    expect(comparison.deltas).toEqual({
      meanGlucoseMgDl: 20,
      gmiPercentagePoints: 0.5,
      veryLowRangePercentagePoints: 0,
      lowRangePercentagePoints: 0,
      targetRangePercentagePoints: 0,
      highRangePercentagePoints: 0,
      veryHighRangePercentagePoints: 0,
      coefficientOfVariationPercentagePoints: 0,
    });
  });

  it('rejects invalid periods, sampling intervals, and unordered thresholds', () => {
    const valid = {
      period: {startMs: 0, endMs: HOUR},
      expectedSampleIntervalMs: FIVE_MINUTES,
      thresholds,
      samples: [],
    } as const;

    expect(() =>
      buildTrendsOverview({...valid, period: {startMs: HOUR, endMs: HOUR}}),
    ).toThrow(TrendsOverviewInputError);
    expect(() =>
      buildTrendsOverview({...valid, expectedSampleIntervalMs: 0}),
    ).toThrow(TrendsOverviewInputError);
    expect(() =>
      buildTrendsOverview({
        ...valid,
        thresholds: {...thresholds, targetMinMgDl: 54},
      }),
    ).toThrow(TrendsOverviewInputError);
  });
});
