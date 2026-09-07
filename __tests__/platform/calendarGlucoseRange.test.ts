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
  it('rejects a pre-aborted request before starting any chunks', async () => {
    const controller = new AbortController();
    controller.abort();
    const loadChunk = jest.fn(async () => snapshot(1));
    await expect(
      loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: DAY},
        signal: controller.signal,
        loadChunk,
      }),
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(loadChunk).not.toHaveBeenCalled();
  });

  it('rejects cancellation immediately and stops queued chunks even when active native reads ignore abort', async () => {
    const controller = new AbortController();
    const finish: (() => void)[] = [];
    const loadChunk = jest.fn(async period => {
      await new Promise<void>(resolve => finish.push(resolve));
      return snapshot(period.dayStartMs);
    });
    const request = loadCalendarGlucoseRange({
      period: {dayStartMs: 0, dayEndMs: 31 * DAY},
      signal: controller.signal,
      loadChunk,
    });
    expect(loadChunk).toHaveBeenCalledTimes(2);
    controller.abort();
    await expect(request).rejects.toMatchObject({name: 'AbortError'});
    finish.forEach(resolve => resolve());
    await Promise.resolve();
    await Promise.resolve();
    expect(loadChunk).toHaveBeenCalledTimes(2);
  });

  it('never converts an adapter AbortError into a partial success', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    await expect(
      loadCalendarGlucoseRange({
        period: {dayStartMs: 0, dayEndMs: 14 * DAY},
        loadChunk: async period => {
          if (period.dayStartMs > 0) {
            throw abortError;
          }
          return snapshot(1);
        },
      }),
    ).rejects.toMatchObject({name: 'AbortError'});
  });

  it('removes its abort listener after a successful load', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    await loadCalendarGlucoseRange({
      period: {dayStartMs: 0, dayEndMs: DAY},
      signal: controller.signal,
      loadChunk: async () => snapshot(1),
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

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
