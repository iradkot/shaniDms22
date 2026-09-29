import {
  buildElapsedGlucoseSummary,
  buildTrendsRangeSummary,
  TrendsOverviewInputError,
} from 'app/modules/trends';
import fixtures from '../../fixtures/daily-glucose-intervals.json';

const startMs = Date.parse('2026-09-27T00:00:00Z');
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const input = {
  period: {startMs, endMs: startMs + 600_000},
  expectedSampleIntervalMs: 300_000,
  thresholds,
  samples: [
    {timestampMs: startMs, valueMgDl: 100},
    {timestampMs: startMs + 60_000, valueMgDl: 200},
  ],
};

describe('elapsed daily glucose evidence', () => {
  it.each(fixtures)('$name', fixture => {
    const summary = buildElapsedGlucoseSummary({
      ...input,
      period: {startMs, endMs: startMs + fixture.durationMs},
      samples: fixture.samples.map(sample => ({
        timestampMs: startMs + sample.offsetMs,
        valueMgDl: sample.valueMgDl,
      })),
    });
    expect(summary.observedMs).toBe(fixture.expected.observedMs);
    expect(summary.coveragePercent).toBe(fixture.expected.coveragePercent);
    expect(summary.ranges).toEqual(fixture.expected.ranges ?? undefined);
    expect(summary.coverageQuality).toBe(
      summary.observedMs === 0
        ? 'no-data'
        : summary.coveragePercent >= 70
        ? 'adequate'
        : 'low',
    );
  });

  it('respects an explicit one-minute cadence without changing general Trends statistics', () => {
    expect(
      buildElapsedGlucoseSummary({...input, expectedSampleIntervalMs: 60_000}),
    ).toMatchObject({
      observedMs: 120_000,
      coveragePercent: 20,
      ranges: {targetPercent: 50},
    });
    expect(buildTrendsRangeSummary(input)).toMatchObject({
      sampleSet: {coveragePercent: 100},
      ranges: {targetPercent: 50},
    });
  });

  it('reuses period, cadence and threshold validation', () => {
    expect(() =>
      buildElapsedGlucoseSummary({...input, period: {startMs, endMs: startMs}}),
    ).toThrow(TrendsOverviewInputError);
    expect(() =>
      buildElapsedGlucoseSummary({...input, expectedSampleIntervalMs: 0}),
    ).toThrow('Expected sample interval');
    expect(() =>
      buildElapsedGlucoseSummary({
        ...input,
        thresholds: {...thresholds, targetMinMgDl: 0},
      }),
    ).toThrow('Glucose range thresholds');
  });
});
