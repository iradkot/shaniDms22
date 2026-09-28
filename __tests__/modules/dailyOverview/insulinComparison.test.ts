import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
  getLocalDayPeriod,
} from 'app/modules/dailyOverview';

describe('daily insulin comparisons', () => {
  it('uses the same local clock across the preceding seven dates, including a DST transition', () => {
    const asOfMs = new Date(2026, 2, 9, 12, 34, 56, 123).getTime();
    const period = getLocalDayPeriod(asOfMs);
    const windows = getDailyInsulinComparisonWindows({period, asOfMs});
    expect(windows.current).toEqual({startMs: period.startMs, endMs: asOfMs});
    expect(windows.isPartialDay).toBe(true);
    expect(windows.previousDays).toHaveLength(7);
    windows.previousDays.forEach((window, index) => {
      expect(window.startMs).toBe(new Date(2026, 2, 8 - index).getTime());
      expect(window.endMs).toBe(
        new Date(2026, 2, 8 - index, 12, 34, 56, 123).getTime(),
      );
    });
  });

  it('compares complete local days when navigating to a past day', () => {
    const period = getLocalDayPeriod(new Date(2026, 10, 1, 12).getTime());
    const windows = getDailyInsulinComparisonWindows({
      period,
      asOfMs: new Date(2026, 10, 5, 9).getTime(),
    });
    expect(windows.current).toEqual(period);
    expect(windows.isPartialDay).toBe(false);
    windows.previousDays.forEach(window =>
      expect(window).toEqual(getLocalDayPeriod(window.startMs)),
    );
  });

  it('keeps yesterday usable without fabricating an average from six available days', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const previous = Array.from({length: 7}, (_, index) =>
      index === 3
        ? {quality: 'unavailable' as const}
        : {quality: 'available' as const, basalUnits: 8, bolusUnits: 4},
    );
    expect(buildDailyInsulinComparison(windows, previous)).toMatchObject({
      status: 'available',
      weekDays: 6,
      yesterday: {totalUnits: 12},
    });
    expect(
      buildDailyInsulinComparison(windows, previous).weekAverage,
    ).toBeUndefined();
  });

  it('averages all seven complete days and preserves valid zero insulin', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const previous = Array.from({length: 7}, (_, index) => ({
      quality: 'available' as const,
      basalUnits: index,
      bolusUnits: index * 2,
      basalEstimated: true,
    }));
    expect(buildDailyInsulinComparison(windows, previous)).toMatchObject({
      yesterday: {totalUnits: 0},
      weekDays: 7,
      weekAverage: {
        basalUnits: 3,
        bolusUnits: 6,
        totalUnits: 9,
        basalEstimated: true,
      },
    });
  });

  it('does not expose malformed source values as a comparison', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const result = buildDailyInsulinComparison(windows, [
      {quality: 'available', basalUnits: Number.NaN, bolusUnits: 1},
    ]);
    expect(result).toMatchObject({status: 'unavailable', weekDays: 0});
    expect(result.yesterday).toBeUndefined();
    expect(result.weekAverage).toBeUndefined();
  });
});
