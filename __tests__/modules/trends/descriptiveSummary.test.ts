import {
  buildTrendsDescriptiveSummary,
  buildTrendsOverview,
  buildTrendsRangeSummary,
  TrendsOverviewInputError,
  type BuildTrendsRangeSummaryInput,
} from 'app/modules/trends';

const input: BuildTrendsRangeSummaryInput = {
  period: {startMs: 0, endMs: 60 * 60_000},
  expectedSampleIntervalMs: 5 * 60_000,
  thresholds: {
    veryLowMaxMgDl: 50,
    targetMinMgDl: 80,
    targetMaxMgDl: 160,
    highMaxMgDl: 260,
  },
  samples: [],
};

describe('Trends descriptive summary', () => {
  it('shares integrity, weighting, rounding and extremes without representative metrics', () => {
    const samples = Object.freeze(
      [
        {timestampMs: 5 * 60_000, valueMgDl: 160},
        {timestampMs: 0, valueMgDl: 50},
        {timestampMs: 5 * 60_000, valueMgDl: 300},
        {timestampMs: 10 * 60_000, valueMgDl: NaN},
        {timestampMs: 10 * 60_000, valueMgDl: 260},
        {timestampMs: 15 * 60_000, valueMgDl: 80},
        {timestampMs: -1, valueMgDl: 100},
        {timestampMs: input.period.endMs, valueMgDl: 100},
        {timestampMs: Infinity, valueMgDl: 100},
        {timestampMs: 20 * 60_000, valueMgDl: 0},
      ].map(sample => Object.freeze(sample)),
    );
    const summary = buildTrendsDescriptiveSummary({...input, samples});
    const rangeSummary = buildTrendsRangeSummary({...input, samples});
    const overview = buildTrendsOverview({...input, samples});

    expect(summary).toEqual({
      ...rangeSummary,
      meanGlucoseMgDl: 137.5,
      minimumGlucoseMgDl: 50,
      maximumGlucoseMgDl: 260,
      coefficientOfVariationPercent: 59.17,
    });
    expect(summary.meanGlucoseMgDl).toBe(overview.meanGlucoseMgDl);
    expect(summary.coefficientOfVariationPercent).toBe(
      overview.coefficientOfVariationPercent,
    );
    expect(summary.sampleSet).toMatchObject({
      validSampleCount: 4,
      excludedSampleCount: 5,
      duplicateSampleCount: 1,
      valuesMgDl: [50, 160, 260, 80],
    });
    expect(summary).not.toHaveProperty('rawMean');
    expect(summary).not.toHaveProperty('gmiPercent');
    expect(summary).not.toHaveProperty('gri');
    expect(summary).not.toHaveProperty('daysWithData');
  });

  it('keeps unavailable values undefined instead of inventing zero measurements', () => {
    expect(buildTrendsDescriptiveSummary(input)).toMatchObject({
      ranges: undefined,
      meanGlucoseMgDl: undefined,
      minimumGlucoseMgDl: undefined,
      maximumGlucoseMgDl: undefined,
      coefficientOfVariationPercent: undefined,
      sampleSet: {validSampleCount: 0, coverageQuality: 'no-data'},
    });
  });

  it('handles one reading with zero variation and identical observed extremes', () => {
    expect(
      buildTrendsDescriptiveSummary({
        ...input,
        samples: [{timestampMs: 0, valueMgDl: 123.456}],
      }),
    ).toMatchObject({
      meanGlucoseMgDl: 123.46,
      minimumGlucoseMgDl: 123.456,
      maximumGlucoseMgDl: 123.456,
      coefficientOfVariationPercent: 0,
    });
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid cadence %s', interval => {
    expect(() =>
      buildTrendsDescriptiveSummary({
        ...input,
        expectedSampleIntervalMs: interval,
      }),
    ).toThrow(TrendsOverviewInputError);
  });

  it('retains the Trends period-before-threshold-before-cadence validation order', () => {
    const invalid = {
      ...input,
      expectedSampleIntervalMs: 0,
      thresholds: {...input.thresholds, targetMinMgDl: NaN},
    };
    expect(() =>
      buildTrendsDescriptiveSummary({
        ...invalid,
        period: {startMs: 1, endMs: 1},
      }),
    ).toThrow('period must end');
    expect(() => buildTrendsDescriptiveSummary(invalid)).toThrow(
      'Range threshold',
    );
  });
});
