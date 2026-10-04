import {
  formatDailyPeriodLabel,
  formatDailyWindow,
  recordedInsulinDisplay,
} from 'app/product/dailyOverview/dailyOverviewPresentation';

describe('daily period labels', () => {
  it('labels a complete historical day through24:00, not the next day00:00', () => {
    const period = {
      startMs: new Date(2026, 8, 27).getTime(),
      endMs: new Date(2026, 8, 28).getTime(),
    };
    expect(formatDailyPeriodLabel(period, 'Selected day')).toBe(
      'Selected day · 27/9 · 00:00–24:00',
    );
  });
  it('keeps an empty midnight window distinct from a completed day', () => {
    const startMs = new Date(2026, 8, 28).getTime();
    expect(formatDailyWindow({startMs, endMs: startMs})).toBe('00:00–00:00');
  });
});

describe('daily insulin display', () => {
  it('keeps recorded temp basal in a partial subtotal alongside an explicit estimate', () => {
    expect(
      recordedInsulinDisplay({
        quality: 'partial',
        basalUnits: 1.8,
        bolusUnits: 2,
        basalCoveragePercent: 33,
        estimatedBasalUnits: 3.8,
        estimatedTotalUnits: 5.8,
      }),
    ).toMatchObject({
      basal: 1.8,
      bolus: 2,
      subtotal: 3.8,
      total: undefined,
      estimatedBasal: 3.8,
      estimatedTotal: 5.8,
      basalCoveragePercent: 33,
    });
  });

  it('rejects malformed estimates and overflowing recorded totals without hiding bolus', () => {
    expect(
      recordedInsulinDisplay({
        quality: 'partial',
        basalUnits: 1,
        bolusUnits: 2,
        estimatedBasalUnits: 3,
        estimatedTotalUnits: 99,
      }),
    ).toMatchObject({subtotal: 3, estimatedTotal: undefined});
    expect(
      recordedInsulinDisplay({
        quality: 'available',
        basalUnits: 1e308,
        bolusUnits: 1e308,
      }),
    ).toMatchObject({total: undefined, subtotal: undefined, bolus: 1e308});
  });
});
