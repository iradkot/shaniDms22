import {computeLoopModeStats} from '../src/containers/MainTabsNavigator/Containers/Trends/hooks/useLoopModeStats';

describe('computeLoopModeStats', () => {
  it('splits minutes between open and closed and computes BG/TIR per mode', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-01T04:00:00Z'); // 240 min

    const events = [
      {timestamp: new Date('2026-04-01T00:00:00Z').getTime(), mode: 'open' as const},
      {timestamp: new Date('2026-04-01T02:00:00Z').getTime(), mode: 'closed' as const},
    ];

    const bgData = [
      {date: new Date('2026-04-01T00:30:00Z').getTime(), sgv: 200}, // open
      {date: new Date('2026-04-01T01:00:00Z').getTime(), sgv: 140}, // open
      {date: new Date('2026-04-01T02:30:00Z').getTime(), sgv: 120}, // closed
      {date: new Date('2026-04-01T03:00:00Z').getTime(), sgv: 80}, // closed
    ] as any[];

    const stats = computeLoopModeStats({start, end, bgData, events});

    expect(stats.openMinutes).toBe(120);
    expect(stats.closedMinutes).toBe(120);
    expect(stats.openPct).toBeCloseTo(50, 1);
    expect(stats.closedPct).toBeCloseTo(50, 1);

    expect(stats.openAvgBg).toBeCloseTo(170, 0);
    expect(stats.closedAvgBg).toBeCloseTo(100, 0);

    // Open has one in-range (140) out of two samples => 50%
    expect(stats.openTirPct).toBeCloseTo(50, 1);
    // Closed has both samples in-range => 100%
    expect(stats.closedTirPct).toBeCloseTo(100, 1);

    expect(stats.diagnostics.eventsFetched).toBe(2);
    expect(stats.diagnostics.openSamples).toBe(2);
    expect(stats.diagnostics.closedSamples).toBe(2);
  });
});
