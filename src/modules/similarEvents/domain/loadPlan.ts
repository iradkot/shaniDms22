import type {TrendsPeriod} from '../../trends';
import {SimilarEventsInputError} from './analyzeSimilarEvents';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SIMILAR_EVENTS_HISTORY_DURATION_MS = 90 * DAY_MS;
export const DEFAULT_SIMILAR_EVENTS_HISTORY_CHUNK_DURATION_MS = 14 * DAY_MS;

export interface CreateSimilarEventsLoadPlanInput {
  readonly focusPeriod: TrendsPeriod;
  readonly historyDurationMs?: number;
  readonly historyChunkDurationMs?: number;
}

export interface SimilarEventsLoadPlan {
  readonly focusPeriod: TrendsPeriod;
  readonly historyPeriod: TrendsPeriod;
  readonly historyChunks: readonly TrendsPeriod[];
}

const positiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

/**
 * Creates bounded half-open reads. Chunks touch without overlapping, so a
 * source can page a long history without inventing boundary duplicates.
 */
export const createSimilarEventsLoadPlan = (
  input: CreateSimilarEventsLoadPlanInput,
): SimilarEventsLoadPlan => {
  if (
    !Number.isFinite(input.focusPeriod.startMs) ||
    !Number.isFinite(input.focusPeriod.endMs) ||
    input.focusPeriod.endMs <= input.focusPeriod.startMs
  ) {
    throw new SimilarEventsInputError(
      'Similar Events requires an increasing finite focused period.',
    );
  }
  const historyDurationMs =
    input.historyDurationMs ?? DEFAULT_SIMILAR_EVENTS_HISTORY_DURATION_MS;
  const historyChunkDurationMs =
    input.historyChunkDurationMs ??
    DEFAULT_SIMILAR_EVENTS_HISTORY_CHUNK_DURATION_MS;
  if (!positiveFinite(historyDurationMs)) {
    throw new SimilarEventsInputError('History duration must be positive.');
  }
  if (!positiveFinite(historyChunkDurationMs)) {
    throw new SimilarEventsInputError(
      'History chunk duration must be positive.',
    );
  }

  const historyPeriod: TrendsPeriod = {
    startMs: input.focusPeriod.startMs - historyDurationMs,
    endMs: input.focusPeriod.startMs,
  };
  const historyChunks: TrendsPeriod[] = [];
  for (
    let startMs = historyPeriod.startMs;
    startMs < historyPeriod.endMs;
    startMs += historyChunkDurationMs
  ) {
    historyChunks.push({
      startMs,
      endMs: Math.min(startMs + historyChunkDurationMs, historyPeriod.endMs),
    });
  }
  return {focusPeriod: input.focusPeriod, historyPeriod, historyChunks};
};
