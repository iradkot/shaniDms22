import {extractHypoEvents} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';

describe('hypoInvestigation.utils', () => {
  it('extracts distinct events with 20-min gap splitting', () => {
    const low = 70;
    const base = 1_700_000_000_000;

    const bgData = [
      // Event 1: 2 points below threshold
      {date: base + 0, sgv: 65} as any,
      {date: base + 5 * 60_000, sgv: 60} as any,
      {date: base + 10 * 60_000, sgv: 80} as any,

      // Gap > 20 minutes
      {date: base + 40 * 60_000, sgv: 68} as any,
      {date: base + 45 * 60_000, sgv: 72} as any,
    ];

    const events = extractHypoEvents({bgData, lowThreshold: low});

    expect(events.length).toBe(2);
    expect(events[1].nadirSgv).toBe(60);
    expect(events[0].nadirSgv).toBe(68);
  });
});
