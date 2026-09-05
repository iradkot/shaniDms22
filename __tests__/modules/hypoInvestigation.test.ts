import {
  buildHypoInvestigation,
  HypoInvestigationInputError,
} from 'app/modules/hypoInvestigation';

const MINUTE_MS = 60 * 1000;
const period = {startMs: 0, endMs: 60 * MINUTE_MS};

const build = (
  values: readonly {timestampMs: number; valueMgDl: number}[],
) =>
  buildHypoInvestigation({
    period,
    samples: values,
    expectedSampleIntervalMs: 5 * MINUTE_MS,
    lowThresholdMgDl: 70,
    veryLowThresholdMgDl: 54,
  });

describe('buildHypoInvestigation', () => {
  it('groups consecutive readings below the low threshold into factual events', () => {
    const result = build([
      {timestampMs: 0, valueMgDl: 90},
      {timestampMs: 5 * MINUTE_MS, valueMgDl: 69},
      {timestampMs: 10 * MINUTE_MS, valueMgDl: 52},
      {timestampMs: 15 * MINUTE_MS, valueMgDl: 60},
      {timestampMs: 20 * MINUTE_MS, valueMgDl: 75},
    ]);

    expect(result.events).toEqual([
      expect.objectContaining({
        id: `hypo:${5 * MINUTE_MS}`,
        startMs: 5 * MINUTE_MS,
        endMs: 15 * MINUTE_MS,
        nadirTimestampMs: 10 * MINUTE_MS,
        nadirMgDl: 52,
        sampleCount: 3,
        observedSpanMinutes: 10,
        severity: 'very-low',
      }),
    ]);
    expect(result.summary).toEqual({
      eventCount: 1,
      veryLowEventCount: 1,
      lowReadingCount: 3,
    });
  });

  it('treats an exact low threshold reading as in range and an exact very-low threshold as low', () => {
    const result = build([
      {timestampMs: 5 * MINUTE_MS, valueMgDl: 70},
      {timestampMs: 10 * MINUTE_MS, valueMgDl: 54},
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(
      expect.objectContaining({nadirMgDl: 54, severity: 'low'}),
    );
  });

  it('splits low readings when the source has a gap longer than 20 minutes', () => {
    const result = build([
      {timestampMs: 5 * MINUTE_MS, valueMgDl: 65},
      {timestampMs: 30 * MINUTE_MS, valueMgDl: 64},
    ]);

    expect(result.events.map(event => event.startMs)).toEqual([
      30 * MINUTE_MS,
      5 * MINUTE_MS,
    ]);
  });

  it('deduplicates exact timestamps and reports excluded source rows', () => {
    const result = build([
      {timestampMs: 5 * MINUTE_MS, valueMgDl: 65},
      {timestampMs: 5 * MINUTE_MS, valueMgDl: 40},
      {timestampMs: -1, valueMgDl: 40},
      {timestampMs: 10 * MINUTE_MS, valueMgDl: Number.NaN},
    ]);

    expect(result.events[0]).toEqual(
      expect.objectContaining({nadirMgDl: 65, sampleCount: 1}),
    );
    expect(result.dataQuality).toEqual(
      expect.objectContaining({
        validSampleCount: 1,
        duplicateSampleCount: 1,
        excludedSampleCount: 2,
      }),
    );
  });

  it('rejects unordered thresholds and invalid event gaps', () => {
    expect(() =>
      buildHypoInvestigation({
        period,
        samples: [],
        expectedSampleIntervalMs: 5 * MINUTE_MS,
        lowThresholdMgDl: 54,
        veryLowThresholdMgDl: 54,
      }),
    ).toThrow(HypoInvestigationInputError);

    expect(() =>
      buildHypoInvestigation({
        period,
        samples: [],
        expectedSampleIntervalMs: 5 * MINUTE_MS,
        lowThresholdMgDl: 70,
        veryLowThresholdMgDl: 54,
        eventGapMs: 0,
      }),
    ).toThrow(HypoInvestigationInputError);
  });
});
