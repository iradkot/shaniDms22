import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
  getLocalDayPeriod,
  selectRecordedInsulinComparison,
} from 'app/modules/dailyOverview';
import {buildRecordedInsulinSummary} from 'app/services/insulin/recordedInsulin';

describe('daily insulin comparisons', () => {
  it('does not compare a 30% basal subtotal with a more complete day as daily usage', () => {
    expect(
      selectRecordedInsulinComparison(
        {
          quality: 'partial',
          basalUnits: 6.8,
          bolusUnits: 33.85,
          basalCoveragePercent: 30,
        },
        {
          quality: 'partial',
          basalUnits: 27.15,
          bolusUnits: 33.85,
          basalCoveragePercent: 90,
        },
      ),
    ).toMatchObject({metric: 'bolus', deltaUnits: 0});
  });
  it('does not treat equal incomplete coverage as matching delivery intervals', () => {
    expect(
      selectRecordedInsulinComparison(
        {
          quality: 'partial',
          basalUnits: 6.8,
          bolusUnits: 33.85,
          basalCoveragePercent: 30,
        },
        {
          quality: 'partial',
          basalUnits: 20,
          bolusUnits: 33.85,
          basalCoveragePercent: 30,
        },
      ),
    ).toMatchObject({metric: 'bolus', deltaUnits: 0});
  });
  it('compares only known bolus when recorded basal coverage is partial', () => {
    const startMs = new Date(2026, 9, 4).getTime();
    const endMs = startMs + 3 * 3_600_000;
    const summary = (amount: number) =>
      buildRecordedInsulinSummary(
        [
          {
            eventType: 'Correction Bolus',
            created_at: new Date(startMs + 1_000).toISOString(),
            insulin: 2,
          },
          {
            eventType: 'Temp Basal',
            enteredBy: 'loop://phone',
            created_at: new Date(startMs).toISOString(),
            duration: 60,
            amount,
          },
        ],
        {startMs, endMs},
        endMs,
      );
    const result = selectRecordedInsulinComparison(summary(1.8), summary(1));
    expect(result).toMatchObject({
      metric: 'bolus',
      currentUnits: 2,
      baselineUnits: 2,
    });
    expect(result?.deltaUnits).toBe(0);
  });
  it('keeps a finite weekly mean when summing large source values would overflow', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const previous = Array.from({length: 7}, () => ({
      quality: 'available' as const,
      basalUnits: 1e308,
      bolusUnits: 0,
    }));
    expect(
      Number.isFinite(
        buildDailyInsulinComparison(windows, previous).weekAverage?.totalUnits,
      ),
    ).toBe(true);
  });
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
    }));
    expect(buildDailyInsulinComparison(windows, previous)).toMatchObject({
      yesterday: {totalUnits: 0},
      weekDays: 7,
      weekAverage: {
        basalUnits: 3,
        bolusUnits: 6,
        totalUnits: 9,
      },
    });
  });

  it('keeps the independently known bolus when basal evidence is malformed', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const result = buildDailyInsulinComparison(windows, [
      {quality: 'available', basalUnits: Number.NaN, bolusUnits: 1},
    ]);
    expect(result).toMatchObject({
      status: 'available',
      weekDays: 1,
      yesterday: {quality: 'partial', bolusUnits: 1},
    });
    expect(result.yesterday).not.toHaveProperty('totalUnits');
    expect(result.weekAverage).toBeUndefined();
  });

  it('preserves the seven-day recorded basal subtotal and its average coverage', () => {
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const windows = getDailyInsulinComparisonWindows({
      period: getLocalDayPeriod(asOfMs),
      asOfMs,
    });
    const result = buildDailyInsulinComparison(
      windows,
      Array.from({length: 7}, (_, index) => ({
        quality: 'partial' as const,
        basalUnits: 2,
        bolusUnits: index,
        basalCoveredMs: 3_600_000,
        basalCoveragePercent: 10,
      })),
    );
    expect(result.weekAverage).toMatchObject({
      quality: 'partial',
      basalUnits: 2,
      bolusUnits: 3,
      basalCoveragePercent: 10,
      basalCoveredMs: 3_600_000,
    });
    expect(result.weekAverage).not.toHaveProperty('totalUnits');
    expect(
      selectRecordedInsulinComparison(
        {quality: 'partial', bolusUnits: 5},
        result.weekAverage,
      ),
    ).toEqual({
      metric: 'bolus',
      currentUnits: 5,
      baselineUnits: 3,
      deltaUnits: 2,
    });
  });

  it('rejects implicit legacy estimates and compares known bolus with partial basal', () => {
    const complete = {
      quality: 'available' as const,
      basalUnits: 4,
      bolusUnits: 2,
    };
    expect(
      selectRecordedInsulinComparison(complete, {
        ...complete,
        basalEstimated: true,
      }),
    ).toMatchObject({metric: 'bolus', deltaUnits: 0});
    expect(
      selectRecordedInsulinComparison(complete, {
        ...complete,
        basalCoveragePercent: 50,
      }),
    ).toMatchObject({metric: 'bolus'});
    expect(
      selectRecordedInsulinComparison(complete, {...complete, basalUnits: 3}),
    ).toMatchObject({metric: 'total', deltaUnits: 1});
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const result = buildDailyInsulinComparison(
      getDailyInsulinComparisonWindows({
        period: getLocalDayPeriod(asOfMs),
        asOfMs,
      }),
      [{...complete, basalCoveragePercent: 50}],
    );
    expect(result.yesterday).toMatchObject({quality: 'partial'});
    expect(result.yesterday).not.toHaveProperty('totalUnits');
  });

  it('compares explicit estimated total while retaining partial recorded evidence', () => {
    const source = (basalUnits: number, estimatedBasalUnits: number) => ({
      quality: 'partial' as const,
      basalUnits,
      bolusUnits: 2,
      estimatedBasalUnits,
      estimatedTotalUnits: estimatedBasalUnits + 2,
      basalCoveragePercent: 33,
      basalCoveredMs: 3_600_000,
    });
    const current = source(1.8, 3.8);
    const baseline = source(1, 3);
    const result = selectRecordedInsulinComparison(current, baseline);
    expect(result?.metric).toBe('estimatedTotal');
    expect(result?.currentUnits).toBeCloseTo(5.8);
    expect(result?.baselineUnits).toBe(5);
    expect(result?.deltaUnits).toBeCloseTo(0.8);
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const history = buildDailyInsulinComparison(
      getDailyInsulinComparisonWindows({
        period: getLocalDayPeriod(asOfMs),
        asOfMs,
      }),
      Array.from({length: 7}, () => baseline),
    );
    expect(history.weekAverage).toMatchObject({
      quality: 'partial',
      basalUnits: 1,
      bolusUnits: 2,
      estimatedBasalUnits: 3,
      estimatedTotalUnits: 5,
      basalCoveragePercent: 33,
    });
    expect(history.weekAverage).not.toHaveProperty('totalUnits');
    expect(
      selectRecordedInsulinComparison(current, history.weekAverage)?.deltaUnits,
    ).toBeCloseTo(0.8);
  });

  it('requires seven valid estimates and rejects inconsistent or overflowing sums', () => {
    const source = {
      quality: 'partial' as const,
      basalUnits: 1,
      bolusUnits: 2,
      basalCoveragePercent: 33,
      basalCoveredMs: 3_600_000,
      estimatedBasalUnits: 3,
      estimatedTotalUnits: 5,
    };
    expect(
      selectRecordedInsulinComparison(source, {
        ...source,
        estimatedTotalUnits: 99,
      })?.metric,
    ).toBe('bolus');
    expect(
      selectRecordedInsulinComparison(source, {
        ...source,
        estimatedBasalUnits: Number.NaN,
      })?.metric,
    ).toBe('bolus');
    expect(
      selectRecordedInsulinComparison(
        {quality: 'available', basalUnits: 1e308, bolusUnits: 1e308},
        {quality: 'available', basalUnits: 1e308, bolusUnits: 1e308},
      ),
    ).toMatchObject({metric: 'bolus', currentUnits: 1e308, deltaUnits: 0});
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const history = buildDailyInsulinComparison(
      getDailyInsulinComparisonWindows({
        period: getLocalDayPeriod(asOfMs),
        asOfMs,
      }),
      Array.from({length: 7}, (_, index) =>
        index === 0 ? {...source, estimatedTotalUnits: 99} : source,
      ),
    );
    expect(history.weekAverage).toMatchObject({
      quality: 'partial',
      basalUnits: 1,
      bolusUnits: 2,
    });
    expect(history.weekAverage).not.toHaveProperty('estimatedTotalUnits');
  });

  it('compares a complete actual total with an estimated total using an estimated basis', () => {
    const actual = {
      quality: 'available' as const,
      basalUnits: 4,
      bolusUnits: 2,
      estimatedBasalUnits: 100,
      estimatedTotalUnits: 102,
    };
    const estimated = {
      quality: 'partial' as const,
      basalUnits: 1,
      bolusUnits: 2,
      basalCoveragePercent: 33,
      basalCoveredMs: 3_600_000,
      estimatedBasalUnits: 3,
      estimatedTotalUnits: 5,
    };
    expect(selectRecordedInsulinComparison(actual, estimated)).toEqual({
      metric: 'estimatedTotal',
      currentUnits: 6,
      baselineUnits: 5,
      deltaUnits: 1,
    });
    expect(selectRecordedInsulinComparison(estimated, actual)).toEqual({
      metric: 'estimatedTotal',
      currentUnits: 5,
      baselineUnits: 6,
      deltaUnits: -1,
    });
    const asOfMs = new Date(2026, 0, 15, 12).getTime();
    const history = buildDailyInsulinComparison(
      getDailyInsulinComparisonWindows({
        period: getLocalDayPeriod(asOfMs),
        asOfMs,
      }),
      Array.from({length: 7}, (_, index) => (index < 4 ? actual : estimated)),
    );
    expect(history.weekAverage?.quality).toBe('partial');
    expect(history.weekAverage?.estimatedBasalUnits).toBeCloseTo(25 / 7);
    expect(history.weekAverage?.estimatedTotalUnits).toBeCloseTo(39 / 7);
    expect(history.weekAverage?.basalUnits).toBeCloseTo(19 / 7);
    expect(history.weekAverage?.basalCoveragePercent).toBeCloseTo(499 / 7);
    expect(history.weekAverage).not.toHaveProperty('totalUnits');
    expect(
      selectRecordedInsulinComparison(actual, history.weekAverage)?.metric,
    ).toBe('estimatedTotal');
    expect(
      selectRecordedInsulinComparison(actual, history.weekAverage)?.deltaUnits,
    ).toBeCloseTo(3 / 7);
  });
});
