import {
  analyzeSimilarGlucoseEvents,
  SimilarEventsInputError,
  type SimilarEventsAnalysisInput,
} from '../../../src/modules/similarEvents';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const baseInput = (): SimilarEventsAnalysisInput => ({
  focusPeriod: {startMs: 10 * DAY_MS, endMs: 10 * DAY_MS + 30 * MINUTE_MS},
  historyPeriod: {startMs: 0, endMs: 10 * DAY_MS},
  focalSamples: [
    {timestampMs: 10 * DAY_MS, valueMgDl: 66},
    {timestampMs: 10 * DAY_MS + 5 * MINUTE_MS, valueMgDl: 61},
    {timestampMs: 10 * DAY_MS + 10 * MINUTE_MS, valueMgDl: 75},
  ],
  historySamples: [
    {timestampMs: DAY_MS, valueMgDl: 65},
    {timestampMs: DAY_MS + 5 * MINUTE_MS, valueMgDl: 60},
    {timestampMs: DAY_MS + 10 * MINUTE_MS, valueMgDl: 90},
    {timestampMs: 2 * DAY_MS, valueMgDl: 205},
    {timestampMs: 2 * DAY_MS + 5 * MINUTE_MS, valueMgDl: 220},
  ],
  expectedSampleIntervalMs: 5 * MINUTE_MS,
  eventGapMs: 15 * MINUTE_MS,
  timeZoneOffsetMinutes: 0,
  thresholds: {lowBelowMgDl: 70, highAboveMgDl: 180},
});

describe('analyzeSimilarGlucoseEvents', () => {
  it('matches only historical events with the focused threshold-defined type', () => {
    const result = analyzeSimilarGlucoseEvents(baseInput());

    expect(result.focusedEvent?.type).toBe('low');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.event).toMatchObject({
      type: 'low',
      startMs: DAY_MS,
      endMs: DAY_MS + 5 * MINUTE_MS,
      extremeMgDl: 60,
    });
  });

  it('ranks matches with a versioned, inspectable descriptive formula', () => {
    const input = baseInput();
    const result = analyzeSimilarGlucoseEvents({
      ...input,
      historySamples: [
        ...input.historySamples,
        {timestampMs: 3 * DAY_MS + 6 * 60 * MINUTE_MS, valueMgDl: 50},
      ],
    });

    expect(result.formula).toEqual({
      version: 'similar-glucose-events-v1',
      weights: {timeOfDay: 0.4, extremeGlucose: 0.4, observedSpan: 0.2},
      fullDifference: {
        timeOfDayMinutes: 720,
        extremeGlucoseMgDl: 100,
        observedSpanMinutes: 180,
      },
    });
    expect(result.matches.map(match => match.scorePercent)).toEqual([
      99.6,
      75.04,
    ]);
    expect(result.matches[0]?.similarity).toEqual({
      timeOfDayDifferenceMinutes: 0,
      extremeDifferenceMgDl: 1,
      observedSpanDifferenceMinutes: 0,
      components: {
        timeOfDay: 1,
        extremeGlucose: 0.99,
        observedSpan: 1,
      },
    });
  });

  it('reports focal and history coverage instead of hiding missing readings', () => {
    const result = analyzeSimilarGlucoseEvents(baseInput());

    expect(result.dataQuality.focus).toMatchObject({
      validSampleCount: 3,
      expectedSampleCount: 6,
      coveragePercent: 50,
      coverageQuality: 'low',
    });
    expect(result.dataQuality.history.coverageQuality).toBe('low');
    expect(result.dataQuality.requiresWarning).toBe(true);
  });

  it('splits events at non-qualifying readings and sample gaps', () => {
    const input = baseInput();
    const result = analyzeSimilarGlucoseEvents({
      ...input,
      historySamples: [
        {timestampMs: DAY_MS, valueMgDl: 69},
        {timestampMs: DAY_MS + 5 * MINUTE_MS, valueMgDl: 70},
        {timestampMs: DAY_MS + 10 * MINUTE_MS, valueMgDl: 68},
        {timestampMs: DAY_MS + 30 * MINUTE_MS, valueMgDl: 67},
        {timestampMs: DAY_MS + 35 * MINUTE_MS, valueMgDl: 180},
      ],
    });

    expect(result.matches.map(match => match.event.sampleCount)).toEqual([
      1,
      1,
      1,
    ]);
  });

  it('rejects an overlapping history window so the focal event cannot match itself', () => {
    const input = baseInput();

    expect(() =>
      analyzeSimilarGlucoseEvents({
        ...input,
        historyPeriod: {
          startMs: input.focusPeriod.startMs - DAY_MS,
          endMs: input.focusPeriod.endMs,
        },
      }),
    ).toThrow(SimilarEventsInputError);
  });

  it('uses the shortest circular local-clock difference across midnight', () => {
    const focusStartMs = 10 * DAY_MS + 23 * 60 * MINUTE_MS + 50 * MINUTE_MS;
    const result = analyzeSimilarGlucoseEvents({
      focusPeriod: {startMs: focusStartMs, endMs: 11 * DAY_MS},
      historyPeriod: {startMs: 0, endMs: focusStartMs},
      focalSamples: [
        {timestampMs: focusStartMs + 5 * MINUTE_MS, valueMgDl: 60},
      ],
      historySamples: [
        {timestampMs: DAY_MS + 5 * MINUTE_MS, valueMgDl: 60},
      ],
      expectedSampleIntervalMs: 5 * MINUTE_MS,
      thresholds: {lowBelowMgDl: 70, highAboveMgDl: 180},
      timeZoneOffsetMinutes: 0,
    });

    expect(result.matches[0]?.similarity.timeOfDayDifferenceMinutes).toBe(10);
  });
});
