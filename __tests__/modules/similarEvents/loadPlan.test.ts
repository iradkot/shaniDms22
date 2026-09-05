import {createSimilarEventsLoadPlan} from '../../../src/modules/similarEvents';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('createSimilarEventsLoadPlan', () => {
  it('builds a default 90-day history from contiguous bounded chunks', () => {
    const plan = createSimilarEventsLoadPlan({
      focusPeriod: {startMs: 100 * DAY_MS, endMs: 100 * DAY_MS + 30 * 60 * 1000},
    });

    expect(plan.historyPeriod).toEqual({
      startMs: 10 * DAY_MS,
      endMs: 100 * DAY_MS,
    });
    expect(plan.historyChunks).toHaveLength(7);
    expect(plan.historyChunks[0]).toEqual({
      startMs: 10 * DAY_MS,
      endMs: 24 * DAY_MS,
    });
    expect(plan.historyChunks[plan.historyChunks.length - 1]).toEqual({
      startMs: 94 * DAY_MS,
      endMs: 100 * DAY_MS,
    });
    plan.historyChunks.slice(1).forEach((chunk, index) => {
      expect(chunk.startMs).toBe(plan.historyChunks[index]?.endMs);
      expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(14 * DAY_MS);
    });
  });
});
