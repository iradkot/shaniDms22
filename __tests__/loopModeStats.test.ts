import {
  buildLoopModeEventsFromDeviceStatus,
  computeLoopModeStats,
} from '../src/containers/MainTabsNavigator/Containers/Trends/hooks/useLoopModeStats';

describe('computeLoopModeStats', () => {
  it('splits minutes between open and closed and computes BG/TIR per mode', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-01T04:00:00Z'); // 240 min

    const events = [
      {
        timestamp: new Date('2026-04-01T00:00:00Z').getTime(),
        mode: 'open' as const,
        basalMode: 'temp' as const,
      },
      {
        timestamp: new Date('2026-04-01T01:00:00Z').getTime(),
        mode: 'open' as const,
        basalMode: 'planned' as const,
      },
      {
        timestamp: new Date('2026-04-01T02:00:00Z').getTime(),
        mode: 'closed' as const,
        basalMode: 'suspended' as const,
      },
      {
        timestamp: new Date('2026-04-01T03:00:00Z').getTime(),
        mode: 'closed' as const,
        basalMode: 'planned' as const,
      },
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

    expect(stats.tempBasalMinutes).toBe(60);
    expect(stats.suspendedMinutes).toBe(60);
    expect(stats.plannedBasalMinutes).toBe(120);

    expect(stats.diagnostics.eventsFetched).toBe(4);
    expect(stats.diagnostics.openSamples).toBe(2);
    expect(stats.diagnostics.closedSamples).toBe(2);
    expect(stats.diagnostics.basalEvents).toBe(4);
  });

  it('ignores invalid BG samples instead of leaking NaN into averages', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-01T01:00:00Z');

    const stats = computeLoopModeStats({
      start,
      end,
      events: [
        {
          timestamp: start.getTime(),
          mode: 'closed',
          basalMode: 'temp',
        },
      ],
      bgData: [
        {date: start.getTime() + 5 * 60000, sgv: NaN},
        {date: start.getTime() + 10 * 60000, sgv: 0},
        {date: start.getTime() + 15 * 60000, sgv: 120},
      ] as any[],
    });

    expect(stats.closedAvgBg).toBe(120);
    expect(stats.closedTirPct).toBe(100);
    expect(stats.diagnostics.closedSamples).toBe(1);
  });

  it('does not carry stale loop state across long device-status gaps', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-01T02:00:00Z');

    const stats = computeLoopModeStats({
      start,
      end,
      maxCarryForwardMinutes: 20,
      events: [
        {
          timestamp: start.getTime(),
          mode: 'closed',
          basalMode: 'temp',
        },
      ],
      bgData: [
        {date: start.getTime() + 10 * 60000, sgv: 120},
        {date: start.getTime() + 30 * 60000, sgv: 130},
      ] as any[],
    });

    expect(stats.closedMinutes).toBe(20);
    expect(stats.unknownMinutes).toBe(100);
    expect(stats.closedAvgBg).toBe(120);
    expect(stats.diagnostics.closedSamples).toBe(1);
  });
});

describe('buildLoopModeEventsFromDeviceStatus', () => {
  it('classifies enacted Loop status as closed and recommendation-only status as open', () => {
    const events = buildLoopModeEventsFromDeviceStatus([
      {
        created_at: '2026-04-01T00:00:00Z',
        loop: {
          automaticDoseRecommendation: {
            tempBasalAdjustment: {rate: 0, duration: 30},
          },
        },
      },
      {
        created_at: '2026-04-01T00:05:00Z',
        loop: {
          enacted: {
            received: true,
            rate: 1.3,
            duration: 30,
          },
        },
      },
      {
        created_at: '2026-04-01T00:10:00Z',
        loop: {
          enacted: {
            received: true,
            rate: 0,
            duration: 30,
          },
        },
      },
    ] as any[]);

    expect(events.map(e => e.mode)).toEqual(['open', 'closed', 'closed']);
    expect(events.map(e => e.basalMode)).toEqual([
      'suspended',
      'temp',
      'suspended',
    ]);
  });
});
