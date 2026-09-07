import type {
  DayGraphCalendarSnapshot,
  DayGraphPeriod,
} from '../../modules/dayGraph';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_MS = 7 * DAY_MS;

/** Bounded glucose-only reads; an unavailable chunk must never imply empty days. */
export const loadCalendarGlucoseRange = async (input: {
  readonly period: DayGraphPeriod;
  readonly loadChunk: (
    period: DayGraphPeriod,
  ) => Promise<DayGraphCalendarSnapshot>;
  readonly assertCurrent?: () => void;
}): Promise<DayGraphCalendarSnapshot> => {
  const {dayStartMs, dayEndMs} = input.period;
  if (
    !Number.isSafeInteger(dayStartMs) ||
    !Number.isSafeInteger(dayEndMs) ||
    dayEndMs <= dayStartMs ||
    dayEndMs - dayStartMs > 32 * DAY_MS
  ) {
    throw new Error('Calendar glucose requires a valid month-sized range.');
  }
  const chunks: DayGraphPeriod[] = [];
  for (let startMs = dayStartMs; startMs < dayEndMs; startMs += CHUNK_MS) {
    chunks.push({
      dayStartMs: startMs,
      dayEndMs: Math.min(startMs + CHUNK_MS, dayEndMs),
    });
  }
  const results: (DayGraphCalendarSnapshot | undefined)[] = new Array(
    chunks.length,
  );
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < chunks.length) {
      input.assertCurrent?.();
      const index = cursor++;
      try {
        const chunk = chunks[index]!;
        const result = await input.loadChunk(chunk);
        results[index] = {
          ...result,
          glucoseSamples: result.glucoseSamples.filter(
            sample =>
              sample.timestampMs >= chunk.dayStartMs &&
              sample.timestampMs < chunk.dayEndMs,
          ),
        };
      } catch {
        results[index] = undefined;
      }
      // Scope changes are not ordinary missing-data failures: reject the whole load.
      input.assertCurrent?.();
    }
  };
  await Promise.all(Array.from({length: Math.min(2, chunks.length)}, worker));
  input.assertCurrent?.();
  const available = results.filter(
    (result): result is DayGraphCalendarSnapshot => result !== undefined,
  );
  if (available.length === 0) {
    throw new Error('Calendar glucose is unavailable.');
  }
  const complete =
    available.length === chunks.length &&
    available.every(
      result => result.complete && result.freshness.kind === 'fresh',
    );
  const fetchedAtMs = Math.min(
    ...available.map(result => result.freshness.fetchedAtMs),
  );
  return {
    glucoseSamples: available.flatMap(result => result.glucoseSamples),
    complete,
    freshness: {kind: complete ? 'fresh' : 'stale', fetchedAtMs},
  };
};
