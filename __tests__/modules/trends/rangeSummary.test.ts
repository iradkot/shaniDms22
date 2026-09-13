import {
  buildTrendsOverview,
  buildTrendsRangeSummary,
  TrendsOverviewInputError,
  type BuildTrendsOverviewInput,
} from 'app/modules/trends';

const input: BuildTrendsOverviewInput = {
  period: {startMs: 0, endMs: 24 * 60 * 60_000},
  expectedSampleIntervalMs: 5 * 60_000,
  thresholds: {
    veryLowMaxMgDl: 54,
    targetMinMgDl: 70,
    targetMaxMgDl: 180,
    highMaxMgDl: 250,
  },
  samples: [],
};

describe('Trends range summary', () => {
  it('shares integrity and range results with the full overview without mutating input', () => {
    const samples = Object.freeze([
      {timestampMs: 5 * 60_000, valueMgDl: 180},
      {timestampMs: 0, valueMgDl: 70},
      {timestampMs: 5 * 60_000, valueMgDl: 300},
      {timestampMs: 10 * 60_000, valueMgDl: NaN},
      {timestampMs: 10 * 60_000, valueMgDl: 181},
      {timestampMs: 15 * 60_000, valueMgDl: 69},
      {timestampMs: -1, valueMgDl: 100},
      {timestampMs: input.period.endMs, valueMgDl: 100},
      {timestampMs: Infinity, valueMgDl: 100},
      {timestampMs: 20 * 60_000, valueMgDl: 0},
    ].map(sample => Object.freeze(sample)));
    const before = samples.slice();
    const summary = buildTrendsRangeSummary({...input, samples});
    const overview = buildTrendsOverview({...input, samples});

    expect(summary.ranges).toEqual({
      veryLowPercent: 0,
      lowPercent: 25,
      targetPercent: 50,
      highPercent: 25,
      veryHighPercent: 0,
    });
    expect(summary.ranges).toEqual(overview.ranges);
    expect(summary.sampleSet).toMatchObject({
      validSampleCount: overview.validSampleCount,
      excludedSampleCount: overview.excludedSampleCount,
      duplicateSampleCount: overview.duplicateSampleCount,
      expectedSampleCount: overview.expectedSampleCount,
      coveragePercent: overview.coveragePercent,
      coverageQuality: overview.coverageQuality,
      durationQuality: overview.durationQuality,
      interpretationQuality: overview.interpretationQuality,
      largestGapMs: overview.largestGapMs,
      lastReadingTimestampMs: overview.lastReadingTimestampMs,
    });
    expect(summary.sampleSet).toMatchObject({
      validSampleCount: 4,
      excludedSampleCount: 5,
      duplicateSampleCount: 1,
      valuesMgDl: [70, 180, 181, 69],
    });
    expect(samples).toEqual(before);
  });

  it('keeps empty readings unknown rather than reporting zero percent', () => {
    expect(buildTrendsRangeSummary(input)).toMatchObject({
      ranges: undefined,
      sampleSet: {validSampleCount: 0, interpretationQuality: 'no-data'},
    });
  });

  it('retains all bucket inclusivity and rounding at custom thresholds', () => {
    const result = buildTrendsRangeSummary({
      ...input,
      thresholds: {
        veryLowMaxMgDl: 50,
        targetMinMgDl: 80,
        targetMaxMgDl: 160,
        highMaxMgDl: 260,
      },
      samples: [49, 50, 80, 160, 260, 261].map((valueMgDl, index) => ({
        timestampMs: index * 5 * 60_000,
        valueMgDl,
      })),
    });
    expect(result.ranges).toEqual({
      veryLowPercent: 16.67,
      lowPercent: 16.67,
      targetPercent: 33.33,
      highPercent: 16.67,
      veryHighPercent: 16.67,
    });
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid interval %s', interval => {
    expect(() =>
      buildTrendsRangeSummary({...input, expectedSampleIntervalMs: interval}),
    ).toThrow(TrendsOverviewInputError);
  });

  it.each([0, 180, NaN, Infinity])(
    'rejects invalid or unordered thresholds (%s)',
    targetMinMgDl => {
      expect(() =>
        buildTrendsRangeSummary({
          ...input,
          thresholds: {...input.thresholds, targetMinMgDl},
        }),
      ).toThrow(TrendsOverviewInputError);
    },
  );

  it.each([
    {startMs: NaN, endMs: 1},
    {startMs: 0, endMs: Infinity},
    {startMs: 1, endMs: 1},
    {startMs: 2, endMs: 1},
  ])('rejects an invalid period %j', period => {
    expect(() => buildTrendsRangeSummary({...input, period})).toThrow(
      TrendsOverviewInputError,
    );
  });
});
