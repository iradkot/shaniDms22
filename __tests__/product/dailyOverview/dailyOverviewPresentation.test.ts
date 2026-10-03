import {
  formatDailyPeriodLabel,
  formatDailyWindow,
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
