import {
  PreviousDaySummaryInputError,
  buildPreviousDaySummary,
  createZonedPreviousDayCalendar,
  getLatestPreviousDayAnchor,
  getPreviousDaySummaryWindow,
  movePreviousDayAnchor,
} from 'app/modules/previousDaySummary';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localTime = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number => new Date(year, month, day, hour, minute).getTime();

describe('Previous Day Summary domain', () => {
  it('compares the interpreted 24-hour day with the previous equal window and exposes coverage', () => {
    const hourMs = 60 * 60 * 1000;
    const nowMs = localTime(2026, 7, 30, 10);
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 29, 0),
      nowMs,
    });
    const referenceWindow = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 28, 0),
      nowMs,
    });
    const samples = (startMs: number, count: number, valueMgDl: number) =>
      Array.from({length: count}, (_, index) => ({
        timestampMs: startMs + index * hourMs,
        valueMgDl,
      }));

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: hourMs,
      thresholds,
      source: {
        glucoseSamples: samples(window.period.startMs, 30, 140),
        insulinSummary: {quality: 'unavailable'},
        events: [],
      },
      comparison: {
        window: referenceWindow,
        source: {
          glucoseSamples: samples(referenceWindow.period.startMs, 30, 120),
          insulinSummary: {quality: 'unavailable'},
          events: [],
        },
      },
    });

    expect(summary).toMatchObject({
      evidence: {
        observedPeriod: window.period,
        interpretedPeriod: {
          startMs: localTime(2026, 7, 29, 6),
          endMs: localTime(2026, 7, 30, 6),
        },
        openingNightIsContextOnly: true,
        closingNightComplete: true,
      },
      comparison: {
        status: 'available',
        quality: 'adequate',
        current: {
          period: {
            startMs: localTime(2026, 7, 29, 6),
            endMs: localTime(2026, 7, 30, 6),
          },
          coveragePercent: 100,
          meanGlucoseMgDl: 140,
        },
        reference: {
          period: {
            startMs: localTime(2026, 7, 28, 6),
            endMs: localTime(2026, 7, 29, 6),
          },
          coveragePercent: 100,
          meanGlucoseMgDl: 120,
        },
        deltas: {
          meanGlucoseMgDl: 20,
          targetRangePercentagePoints: 0,
          lowRangePercentagePoints: 0,
          highRangePercentagePoints: 0,
        },
      },
    });
  });

  it('summarizes the observed two-hour glucose window after each recorded meal without assigning cause', () => {
    const halfHourMs = 30 * 60 * 1000;
    const nowMs = localTime(2026, 7, 30, 10);
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 29, 0),
      nowMs,
    });
    const mealStartMs = localTime(2026, 7, 29, 12);

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: halfHourMs,
      thresholds,
      source: {
        glucoseSamples: [100, 130, 160, 120].map((valueMgDl, index) => ({
          timestampMs: mealStartMs + index * halfHourMs,
          valueMgDl,
        })),
        insulinSummary: {quality: 'unavailable'},
        events: [
          {
            id: 'meal-1',
            kind: 'meal',
            timestampMs: mealStartMs,
            title: 'Lunch',
          },
        ],
      },
    });

    expect(summary.mealOutcomes).toEqual([
      {
        status: 'available',
        quality: 'adequate',
        event: expect.objectContaining({id: 'meal-1', title: 'Lunch'}),
        observedPeriod: {
          startMs: mealStartMs,
          endMs: mealStartMs + 2 * 60 * 60 * 1000,
        },
        observationWindowMinutes: 120,
        windowComplete: true,
        validSampleCount: 4,
        expectedSampleCount: 4,
        coveragePercent: 100,
        startGlucoseMgDl: 100,
        peakGlucoseMgDl: 160,
        endGlucoseMgDl: 120,
        observedPeakRiseMgDl: 60,
        observedEndChangeMgDl: 20,
      },
    ]);
  });

  it('returns neutral interpreted observations and exactly one non-therapy focus without a score', () => {
    const hourMs = 60 * 60 * 1000;
    const nowMs = localTime(2026, 7, 30, 10);
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 29, 0),
      nowMs,
    });
    const referenceWindow = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 28, 0),
      nowMs,
    });
    const samples = (
      period: {startMs: number; endMs: number},
      valueAt: (timestampMs: number) => number,
    ) =>
      Array.from(
        {length: (period.endMs - period.startMs) / hourMs},
        (_, index) => {
          const timestampMs = period.startMs + index * hourMs;
          return {timestampMs, valueMgDl: valueAt(timestampMs)};
        },
      );

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: hourMs,
      thresholds,
      source: {
        glucoseSamples: samples(window.period, timestampMs =>
          timestampMs >= window.segments[2].period.startMs
            ? 60
            : timestampMs >= window.segments[1].period.startMs
            ? 200
            : 110,
        ),
        insulinSummary: {quality: 'unavailable'},
        events: [],
      },
      comparison: {
        window: referenceWindow,
        source: {
          glucoseSamples: samples(referenceWindow.period, () => 120),
          insulinSummary: {quality: 'unavailable'},
          events: [],
        },
      },
    });

    expect({
      insights: summary.insights,
      suggestedFocus: summary.suggestedFocus,
      exposesScore: 'score' in summary,
    }).toEqual({
      insights: expect.arrayContaining([
        {
          kind: 'segment-low-observation',
          segment: 'closing-night',
          percentage: 100,
        },
        expect.objectContaining({
          kind: 'matched-comparison-observation',
          quality: 'adequate',
        }),
      ]),
      suggestedFocus: {
        kind: 'review-low-context',
        segment: 'closing-night',
      },
      exposesScore: false,
    });
  });

  it('builds the latest local summary as yesterday 00:00 through today 06:00', () => {
    const nowMs = localTime(2026, 7, 30, 10);
    const anchorDayStartMs = getLatestPreviousDayAnchor(nowMs);
    const window = getPreviousDaySummaryWindow({anchorDayStartMs, nowMs});

    expect(anchorDayStartMs).toBe(localTime(2026, 7, 29, 0));
    expect(window.period).toEqual({
      startMs: localTime(2026, 7, 29, 0),
      endMs: localTime(2026, 7, 30, 6),
    });
    expect(window.isPartial).toBe(false);
    expect(window.segments).toEqual([
      expect.objectContaining({
        kind: 'incoming-night',
        period: {
          startMs: localTime(2026, 7, 29, 0),
          endMs: localTime(2026, 7, 29, 6),
        },
        isPartial: false,
      }),
      expect.objectContaining({
        kind: 'day',
        period: {
          startMs: localTime(2026, 7, 29, 6),
          endMs: localTime(2026, 7, 29, 22),
        },
        isPartial: false,
      }),
      expect.objectContaining({
        kind: 'closing-night',
        period: {
          startMs: localTime(2026, 7, 29, 22),
          endMs: localTime(2026, 7, 30, 6),
        },
        isPartial: false,
      }),
    ]);
  });

  it('ends an in-progress closing night at now and never includes future data', () => {
    const nowMs = localTime(2026, 7, 30, 3, 20);
    const anchorDayStartMs = getLatestPreviousDayAnchor(nowMs);
    const window = getPreviousDaySummaryWindow({anchorDayStartMs, nowMs});

    expect(window.period.endMs).toBe(nowMs);
    expect(window.isPartial).toBe(true);
    expect(window.segments[2]).toMatchObject({
      kind: 'closing-night',
      period: {
        startMs: localTime(2026, 7, 29, 22),
        endMs: nowMs,
      },
      isPartial: true,
    });

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: 60 * 60 * 1000,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: nowMs - 10 * 60 * 1000, valueMgDl: 120},
          {timestampMs: nowMs + 10 * 60 * 1000, valueMgDl: 300},
        ],
        insulinSummary: {quality: 'unavailable'},
        events: [],
      },
    });

    expect(summary.overall.validSampleCount).toBe(1);
    expect(summary.overall.meanGlucoseMgDl).toBe(120);
    expect(summary.segments[2].validSampleCount).toBe(1);
  });

  it('uses shared glucose integrity and puts exact 06:00/22:00 boundaries in the later segment', () => {
    const nowMs = localTime(2026, 7, 30, 10);
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: localTime(2026, 7, 29, 0),
      nowMs,
    });
    const six = localTime(2026, 7, 29, 6);
    const twentyTwo = localTime(2026, 7, 29, 22);

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: 60 * 60 * 1000,
      thresholds,
      source: {
        glucoseSamples: [
          {timestampMs: window.period.startMs, valueMgDl: 53},
          {timestampMs: six, valueMgDl: 70},
          {timestampMs: six, valueMgDl: 300},
          {timestampMs: twentyTwo, valueMgDl: 181},
          {timestampMs: window.period.endMs, valueMgDl: 120},
        ],
        insulinSummary: {
          quality: 'available',
          basalUnits: 8.25,
          bolusUnits: 3.75,
        },
        events: [
          {id: 'meal-1', kind: 'meal', timestampMs: six, title: 'Breakfast'},
          {
            id: 'activity-1',
            kind: 'activity',
            timestampMs: twentyTwo,
            title: 'Walk',
          },
          {
            id: 'future',
            kind: 'alert',
            timestampMs: window.period.endMs,
            title: 'Outside',
          },
        ],
      },
    });

    expect(summary.overall).toMatchObject({
      validSampleCount: 3,
      duplicateSampleCount: 1,
      excludedSampleCount: 1,
      ranges: {lowPercent: 33.33, targetPercent: 33.33, highPercent: 33.33},
      meanGlucoseMgDl: 101.33,
    });
    expect(summary.segments[0]).toMatchObject({validSampleCount: 1});
    expect(summary.segments[1]).toMatchObject({
      validSampleCount: 1,
      events: [expect.objectContaining({id: 'meal-1'})],
    });
    expect(summary.segments[2]).toMatchObject({
      validSampleCount: 1,
      events: [expect.objectContaining({id: 'activity-1'})],
    });
    expect(summary.insulinSummary).toEqual({
      quality: 'available',
      basalUnits: 8.25,
      bolusUnits: 3.75,
      totalUnits: 12,
    });
    expect(summary.events.map(event => event.id)).toEqual([
      'meal-1',
      'activity-1',
    ]);
  });

  it('keeps unavailable insulin explicit and does not turn it into zero', () => {
    const nowMs = localTime(2026, 7, 30, 10);
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: getLatestPreviousDayAnchor(nowMs),
      nowMs,
    });

    const summary = buildPreviousDaySummary({
      window,
      expectedSampleIntervalMs: 5 * 60 * 1000,
      thresholds,
      source: {
        glucoseSamples: [],
        insulinSummary: {quality: 'unavailable'},
        events: [],
      },
    });

    expect(summary.insulinSummary).toEqual({quality: 'unavailable'});
    expect(summary.overall.ranges).toBeUndefined();
    expect(summary.overall.meanGlucoseMgDl).toBeUndefined();
  });

  it('rejects future anchors and invalid authoritative insulin totals', () => {
    const nowMs = localTime(2026, 7, 30, 10);

    expect(() =>
      getPreviousDaySummaryWindow({
        anchorDayStartMs: localTime(2026, 7, 30, 0),
        nowMs,
      }),
    ).toThrow(PreviousDaySummaryInputError);

    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: getLatestPreviousDayAnchor(nowMs),
      nowMs,
    });
    expect(() =>
      buildPreviousDaySummary({
        window,
        expectedSampleIntervalMs: 5 * 60 * 1000,
        thresholds,
        source: {
          glucoseSamples: [],
          insulinSummary: {
            quality: 'available',
            basalUnits: Number.NaN,
            bolusUnits: 2,
          },
          events: [],
        },
      }),
    ).toThrow(PreviousDaySummaryInputError);
  });

  it('moves by local calendar days and keeps 00/06/22 boundaries across DST', () => {
    const calendar = createZonedPreviousDayCalendar('America/New_York');
    const springAnchor = calendar.startOfDay(Date.UTC(2026, 2, 8, 12));
    const springWindow = getPreviousDaySummaryWindow({
      anchorDayStartMs: springAnchor,
      nowMs: Date.UTC(2026, 2, 10, 12),
      calendar,
    });

    expect(
      springWindow.segments.map(segment => [
        new Intl.DateTimeFormat('en-u-hc-h23', {
          hour: 'numeric',
          timeZone: 'America/New_York',
        }).format(segment.period.startMs),
        new Intl.DateTimeFormat('en-u-hc-h23', {
          hour: 'numeric',
          timeZone: 'America/New_York',
        }).format(segment.period.endMs),
      ]),
    ).toEqual([
      ['00', '06'],
      ['06', '22'],
      ['22', '06'],
    ]);
    expect(springWindow.period.endMs - springWindow.period.startMs).toBe(
      29 * 60 * 60 * 1000,
    );
    expect(movePreviousDayAnchor(springAnchor, 1, calendar)).toBe(
      calendar.startOfDay(Date.UTC(2026, 2, 9, 12)),
    );

    const fallAnchor = calendar.startOfDay(Date.UTC(2026, 10, 1, 12));
    const fallWindow = getPreviousDaySummaryWindow({
      anchorDayStartMs: fallAnchor,
      nowMs: Date.UTC(2026, 10, 3, 12),
      calendar,
    });
    expect(fallWindow.period.endMs - fallWindow.period.startMs).toBe(
      31 * 60 * 60 * 1000,
    );
  });
});
