import type {
  DayGraphCalendarSnapshot,
  DayGraphPeriod,
} from '../../modules/dayGraph';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_MS = 7 * DAY_MS;

const cancellationError = (): Error => {
  const error = new Error('The calendar glucose request was cancelled.');
  error.name = 'AbortError';
  return error;
};

/** Bounded glucose-only reads; an unavailable chunk must never imply empty days. */
export const loadCalendarGlucoseRange = async (input: {
  readonly period: DayGraphPeriod;
  readonly loadChunk: (
    period: DayGraphPeriod,
  ) => Promise<DayGraphCalendarSnapshot>;
  readonly assertCurrent?: () => void;
  readonly signal?: AbortSignal;
}): Promise<DayGraphCalendarSnapshot> => {
  const {dayStartMs, dayEndMs} = input.period;
  let cancelled = false;
  const assertActive = (): void => {
    if (cancelled || input.signal?.aborted) {
      throw cancellationError();
    }
    input.assertCurrent?.();
  };
  assertActive();
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
      assertActive();
      const index = cursor++;
      try {
        const chunk = chunks[index]!;
        const result = await input.loadChunk(chunk);
        assertActive();
        results[index] = {
          ...result,
          glucoseSamples: result.glucoseSamples.filter(
            sample =>
              sample.timestampMs >= chunk.dayStartMs &&
              sample.timestampMs < chunk.dayEndMs,
          ),
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          cancelled = true;
          throw error;
        }
        results[index] = undefined;
      }
      // Scope changes are not ordinary missing-data failures: reject the whole load.
      assertActive();
    }
  };
  const signal = input.signal;
  let removeAbortListener = () => {};
  const cancellation = signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => {
          cancelled = true;
          reject(cancellationError());
        };
        signal.addEventListener('abort', onAbort);
        removeAbortListener = () =>
          signal.removeEventListener('abort', onAbort);
      })
    : undefined;
  try {
    const workers = Promise.all(
      Array.from({length: Math.min(2, chunks.length)}, worker),
    );
    // Native transport may not support abort; release the caller immediately,
    // then let active reads settle without scheduling any remaining chunks.
    await (cancellation ? Promise.race([workers, cancellation]) : workers);
  } finally {
    removeAbortListener();
  }
  assertActive();
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
