import {extractHypoEvents} from '../src/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';

// Minimal unit test to protect the core hypo-event extraction we rely on for AI context.
describe('Hypo Detective context prerequisites', () => {
  it('extractHypoEvents groups contiguous low samples into events', () => {
    const lowThreshold = 60;

    const bgData = [
      {date: 0, sgv: 100},
      {date: 5 * 60_000, sgv: 58},
      {date: 10 * 60_000, sgv: 55},
      {date: 15 * 60_000, sgv: 62}, // exit
      {date: 50 * 60_000, sgv: 59},
      {date: 55 * 60_000, sgv: 57},
      {date: 60 * 60_000, sgv: 80},
    ] as any[];

    const events = extractHypoEvents({bgData: bgData as any, lowThreshold});
    expect(events.length).toBe(2);
    expect(events[0].nadirSgv).toBe(57);
    expect(events[1].nadirSgv).toBe(55);
  });
});
