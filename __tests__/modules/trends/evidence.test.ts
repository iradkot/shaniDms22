import {buildTrendsEvidenceMetadata} from 'app/modules/trends';

const MINUTE_MS = 60 * 1000;

describe('Trends evidence metadata', () => {
  it('classifies freshness against the end of the evidence period', () => {
    expect(
      buildTrendsEvidenceMetadata({
        period: {startMs: 0, endMs: 60 * MINUTE_MS},
        coveragePercent: 75,
        coverageQuality: 'adequate',
        daysWithData: 1,
        expectedSampleIntervalMs: 5 * MINUTE_MS,
        lastReadingTimestampMs: 52 * MINUTE_MS,
        targetRange: {minMgDl: 70, maxMgDl: 180},
        timeZoneOffsetMinutes: 120,
      }),
    ).toEqual({
      period: {startMs: 0, endMs: 60 * MINUTE_MS},
      coveragePercent: 75,
      coverageQuality: 'adequate',
      daysWithData: 1,
      lastReadingTimestampMs: 52 * MINUTE_MS,
      targetRange: {minMgDl: 70, maxMgDl: 180},
      timeZoneOffsetMinutes: 120,
      freshness: 'current',
      ageAtPeriodEndMs: 8 * MINUTE_MS,
    });

    expect(
      buildTrendsEvidenceMetadata({
        period: {startMs: 0, endMs: 60 * MINUTE_MS},
        coveragePercent: 20,
        coverageQuality: 'low',
        daysWithData: 1,
        expectedSampleIntervalMs: 5 * MINUTE_MS,
        lastReadingTimestampMs: 20 * MINUTE_MS,
        targetRange: {minMgDl: 70, maxMgDl: 180},
        timeZoneOffsetMinutes: 120,
      }).freshness,
    ).toBe('stale');
  });

  it('reports no data without inventing a freshness timestamp', () => {
    expect(
      buildTrendsEvidenceMetadata({
        period: {startMs: 0, endMs: 60 * MINUTE_MS},
        coveragePercent: 0,
        coverageQuality: 'no-data',
        daysWithData: 0,
        expectedSampleIntervalMs: 5 * MINUTE_MS,
        lastReadingTimestampMs: undefined,
        targetRange: {minMgDl: 70, maxMgDl: 180},
        timeZoneOffsetMinutes: 120,
      }),
    ).toMatchObject({freshness: 'no-data', ageAtPeriodEndMs: undefined});
  });

  it('rejects impossible day counts, offsets, and target ranges', () => {
    const valid = {
      period: {startMs: 0, endMs: 60 * MINUTE_MS},
      coveragePercent: 75,
      coverageQuality: 'adequate' as const,
      daysWithData: 1,
      expectedSampleIntervalMs: 5 * MINUTE_MS,
      lastReadingTimestampMs: 52 * MINUTE_MS,
      targetRange: {minMgDl: 70, maxMgDl: 180},
      timeZoneOffsetMinutes: 120,
    };

    expect(() =>
      buildTrendsEvidenceMetadata({...valid, daysWithData: -1}),
    ).toThrow('days with data');
    expect(() =>
      buildTrendsEvidenceMetadata({...valid, timeZoneOffsetMinutes: 841}),
    ).toThrow('time-zone offset');
    expect(() =>
      buildTrendsEvidenceMetadata({
        ...valid,
        targetRange: {minMgDl: 180, maxMgDl: 70},
      }),
    ).toThrow('target range');
  });
});
