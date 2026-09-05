import type {DayGraphDataSource} from 'app/modules/dayGraph';
import {loadEventOutcomeFromDayGraph} from 'app/product/eventOutcomes';

describe('Event Outcome Day Graph adapter', () => {
  it('uses the shared factual source and excludes the subject timeline item from overlap', async () => {
    const start = 1_700_000_000_000;
    const loadDayGraph = jest.fn(async () => ({
      glucoseSamples: [
        {
          identity: {sourceId: 'ns', recordId: 'a'},
          timestampMs: start - 5 * 60_000,
          valueMgDl: 100,
        },
        {
          identity: {sourceId: 'ns', recordId: 'b'},
          timestampMs: start,
          valueMgDl: 105,
        },
      ],
      timelineItems: [
        {
          kind: 'journal-meal' as const,
          identity: {sourceId: 'journal', recordId: 'meal-a'},
          sourceLabel: 'Journal',
          timestampMs: start,
          title: 'Meal',
        },
      ],
      freshness: {kind: 'fresh' as const, fetchedAtMs: start},
    }));
    const source: DayGraphDataSource = {loadDayGraph};

    const result = await loadEventOutcomeFromDayGraph({
      dataSource: source,
      subject: {kind: 'meal', id: 'meal-a', startedAtMs: start},
    });

    expect(loadDayGraph).toHaveBeenCalledWith({
      dayStartMs: start - 30 * 60_000,
      dayEndMs: start + 3 * 60 * 60_000 + 1,
    });
    expect(result.quality.overlapCount).toBe(0);
  });
});
