import {loadCalendarGlucoseRange} from 'app/platform/nightscout/loadCalendarGlucoseRange';

const DAY = 24 * 60 * 60 * 1000;
const snapshot = (timestampMs: number) => ({
  glucoseSamples: [
    {
      identity: {sourceId: 'source', recordId: String(timestampMs)},
      timestampMs,
      valueMgDl: 120,
    },
  ],
  freshness: {kind: 'fresh' as const, fetchedAtMs: 10},
  complete: true,
});

describe('calendar glucose range loading', () => {
  it('limits requests to seven days and two concurrent reads, including a DST-length month', async () => {
    let active = 0;
    let maximumActive = 0;
    const chunks: number[] = [];
    const result = await loadCalendarGlucoseRange({
      period: {dayStartMs: 0, dayEndMs: 31 * DAY + 60 * 60 * 1000},
      loadChunk: async period => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        chunks.push(period.dayEndMs - period.dayStartMs);
        await Promise.resolve();
        active -= 1;
        return snapshot(period.dayStartMs);
      },
    });
    expect(maximumActive).toBe(2);
    expect(chunks).toHaveLength(5);
    expect(Math.max(...chunks)).toBe(7 * DAY);
    expect(chunks.reduce((sum, value) => sum + value, 0)).toBe(
      31 * DAY + 60 * 60 * 1000,
    );
    expect(result.complete).toBe(true);
    expect(result.glucoseSamples).toHaveLength(5);
  });

  it('keeps successful chunks but never labels a partially failed range complete', async () => {
    const result = await loadCalendarGlucoseRange({
      period: {dayStartMs: 0, dayEndMs: 14 * DAY},
      loadChunk: async period => {
        if (period.dayStartMs > 0) {
          throw new Error('offline');
        }
        return snapshot(1);
      },
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.complete).toBe(false);
    expect(result.freshness).toEqual({kind: 'stale', fetchedAtMs: 10});
  });

  it('assigns chunk-boundary glucose only to its half-open requested chunk', async () => {
    const result = await loadCalendarGlucoseRange({
      period: {dayStartMs: 0, dayEndMs: 14 * DAY},
      loadChunk: async () => snapshot(7 * DAY),
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.glucoseSamples[0]?.timestampMs).toBe(7 * DAY);
  });

  it('does not turn stale or incomplete empty reads into a known empty range', async () => {
    for (const input of [
      {...snapshot(1), glucoseSamples: [], complete: false},
      {
        ...snapshot(1),
        glucoseSamples: [],
        freshness: {kind: 'stale' as const, fetchedAtMs: 9},
      },
    ]) {
      const result = await loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: DAY},
        loadChunk: async () => input,
      });
      expect(result.complete).toBe(false);
      expect(result.freshness.kind).toBe('stale');
    }
  });

  it('rejects complete failure, invalid bounds, and a changed source', async () => {
    await expect(
      loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: DAY},
        loadChunk: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('unavailable');
    await expect(
      loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: 33 * DAY},
        loadChunk: async () => snapshot(1),
      }),
    ).rejects.toThrow('range');
    let changed = false;
    await expect(
      loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: 14 * DAY},
        assertCurrent: () => {
          if (changed) {
            throw new Error('source changed');
          }
        },
        loadChunk: async () => {
          changed = true;
          return snapshot(1);
        },
      }),
    ).rejects.toThrow('source changed');
  });
});
