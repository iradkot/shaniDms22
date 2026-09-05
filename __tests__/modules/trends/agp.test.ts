import {buildAgpProfile} from 'app/modules/trends/domain/agp';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

describe('AGP domain', () => {
  it('keeps individual local days visible with their own coverage and gaps', () => {
    const profile = buildAgpProfile({
      period: {startMs: 0, endMs: 3 * DAY_MS},
      expectedSampleIntervalMs: 12 * HOUR_MS,
      timeZoneOffsetMinutes: 0,
      samples: [
        {timestampMs: HOUR_MS, valueMgDl: 100},
        {timestampMs: 13 * HOUR_MS, valueMgDl: 120},
        {timestampMs: 2 * DAY_MS + 6 * HOUR_MS, valueMgDl: 140},
      ],
    });

    expect(profile.dailyProfiles).toHaveLength(3);
    expect(profile.dailyProfiles[0]).toMatchObject({
      dayStartMs: 0,
      dayEndMs: DAY_MS,
      sampleCount: 2,
      expectedSampleCount: 2,
      coveragePercent: 100,
      coverageQuality: 'adequate',
    });
    expect(profile.dailyProfiles[0]?.points).toEqual([
      {timestampMs: HOUR_MS, minuteOfDay: 60, valueMgDl: 100},
      {timestampMs: 13 * HOUR_MS, minuteOfDay: 780, valueMgDl: 120},
    ]);
    expect(profile.dailyProfiles[1]).toMatchObject({
      dayStartMs: DAY_MS,
      dayEndMs: 2 * DAY_MS,
      sampleCount: 0,
      coveragePercent: 0,
      coverageQuality: 'no-data',
      largestGapMs: DAY_MS,
    });
    expect(profile.dailyProfiles[2]).toMatchObject({
      sampleCount: 1,
      expectedSampleCount: 2,
      coveragePercent: 50,
      coverageQuality: 'low',
    });
  });

  it('builds representative hourly percentiles from a complete 14-day period', () => {
    const profile = buildAgpProfile({
      period: {startMs: 0, endMs: 14 * DAY_MS},
      expectedSampleIntervalMs: DAY_MS,
      timeZoneOffsetMinutes: 0,
      samples: [
        ...[40, 80, 120, 160, 200].map((valueMgDl, day) => ({
          timestampMs: day * DAY_MS + HOUR_MS,
          valueMgDl,
        })),
        ...Array.from({length: 9}, (_, index) => ({
          timestampMs: (index + 5) * DAY_MS + 2 * HOUR_MS,
          valueMgDl: 110,
        })),
      ],
    });

    expect(profile.quality).toEqual(
      expect.objectContaining({
        validSampleCount: 14,
        coveragePercent: 100,
        coverageQuality: 'adequate',
        durationQuality: 'representative',
        interpretationQuality: 'representative',
      }),
    );
    expect(profile.buckets[1]).toEqual({
      hour: 1,
      sampleCount: 5,
      p10MgDl: 56,
      p25MgDl: 80,
      medianMgDl: 120,
      p75MgDl: 160,
      p90MgDl: 184,
    });
  });

  it('does not let display rounding pass coverage below 70 percent', () => {
    const period = {startMs: 0, endMs: 14 * DAY_MS};
    const expectedSampleCount = 20_001;
    const expectedSampleIntervalMs =
      (period.endMs - period.startMs) / expectedSampleCount;
    const samples = Array.from({length: 14_000}, (_, index) => ({
      timestampMs: index * expectedSampleIntervalMs,
      valueMgDl: 120,
    }));

    const profile = buildAgpProfile({
      period,
      expectedSampleIntervalMs,
      timeZoneOffsetMinutes: 0,
      samples,
    });

    expect(profile.quality.coveragePercent).toBe(70);
    expect(profile.quality.coverageQuality).toBe('low');
    expect(profile.quality.interpretationQuality).toBe('partial');
  });

  it('passes the representative gate at exactly 14 days and 70 percent', () => {
    const period = {startMs: 0, endMs: 14 * DAY_MS};
    const expectedSampleIntervalMs = (period.endMs - period.startMs) / 100;
    const profile = buildAgpProfile({
      period,
      expectedSampleIntervalMs,
      timeZoneOffsetMinutes: 0,
      samples: Array.from({length: 70}, (_, index) => ({
        timestampMs: index * expectedSampleIntervalMs,
        valueMgDl: 120,
      })),
    });

    expect(profile.quality).toEqual(
      expect.objectContaining({
        coveragePercent: 70,
        coverageQuality: 'adequate',
        durationQuality: 'representative',
        interpretationQuality: 'representative',
      }),
    );
  });

  it('keeps a complete seven-day profile visible but marks it as short', () => {
    const profile = buildAgpProfile({
      period: {startMs: 0, endMs: 7 * DAY_MS},
      expectedSampleIntervalMs: DAY_MS,
      timeZoneOffsetMinutes: 0,
      samples: Array.from({length: 7}, (_, day) => ({
        timestampMs: day * DAY_MS + 3 * HOUR_MS,
        valueMgDl: 100 + day,
      })),
    });

    expect(profile.quality).toEqual(
      expect.objectContaining({
        coveragePercent: 100,
        coverageQuality: 'adequate',
        durationQuality: 'short',
        interpretationQuality: 'partial',
      }),
    );
    expect(profile.buckets[3]?.sampleCount).toBe(7);
  });

  it('deduplicates timestamps, excludes invalid records, and never fills empty hours', () => {
    const profile = buildAgpProfile({
      period: {startMs: 0, endMs: 14 * DAY_MS},
      expectedSampleIntervalMs: 7 * DAY_MS,
      timeZoneOffsetMinutes: 0,
      samples: [
        {timestampMs: HOUR_MS, valueMgDl: 100},
        {timestampMs: HOUR_MS, valueMgDl: 300},
        {timestampMs: DAY_MS + HOUR_MS, valueMgDl: 200},
        {timestampMs: -1, valueMgDl: 120},
        {timestampMs: 2 * DAY_MS, valueMgDl: Number.NaN},
      ],
    });

    expect(profile.quality).toEqual(
      expect.objectContaining({
        validSampleCount: 2,
        duplicateSampleCount: 1,
        excludedSampleCount: 2,
        coveragePercent: 100,
      }),
    );
    expect(profile.buckets[1]?.medianMgDl).toBe(150);
    expect(profile.buckets[0]).toEqual({
      hour: 0,
      sampleCount: 0,
      p10MgDl: undefined,
      p25MgDl: undefined,
      medianMgDl: undefined,
      p75MgDl: undefined,
      p90MgDl: undefined,
    });
  });

  it('assigns readings to the requested local clock hour', () => {
    const profile = buildAgpProfile({
      period: {startMs: 0, endMs: 14 * DAY_MS},
      expectedSampleIntervalMs: 14 * DAY_MS,
      timeZoneOffsetMinutes: 120,
      samples: [{timestampMs: 23 * HOUR_MS + 30 * MINUTE_MS, valueMgDl: 123}],
    });

    expect(profile.buckets[1]?.medianMgDl).toBe(123);
    expect(profile.buckets[23]?.sampleCount).toBe(0);
  });

  it('rejects invalid periods, cadence, and time-zone offsets', () => {
    const valid = {
      period: {startMs: 0, endMs: 14 * DAY_MS},
      expectedSampleIntervalMs: DAY_MS,
      timeZoneOffsetMinutes: 0,
      samples: [],
    } as const;

    expect(() =>
      buildAgpProfile({...valid, period: {startMs: DAY_MS, endMs: DAY_MS}}),
    ).toThrow(/period/);
    expect(() =>
      buildAgpProfile({...valid, expectedSampleIntervalMs: 0}),
    ).toThrow(/sample interval/);
    expect(() =>
      buildAgpProfile({...valid, timeZoneOffsetMinutes: 841}),
    ).toThrow(/time-zone offset/);
  });
});
