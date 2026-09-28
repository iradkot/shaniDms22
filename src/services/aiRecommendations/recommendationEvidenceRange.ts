import type {AiRecommendationStart} from '../../modules/ai/domain/recommendations';
import {recommendationRangeDays} from './recommendationOrchestrator';

const DAY_MS = 86_400_000;

/** A selected date is evidence scope, not merely a label in the prompt. */
export const recommendationEvidenceRange = (
  input: AiRecommendationStart,
  nowMs: number,
) => {
  const explicitPeriod = input.focus?.kind === 'day' || input.focus?.kind === 'period';
  let endMs = nowMs;
  let startMs = nowMs - recommendationRangeDays(input.request) * DAY_MS;
  if (input.focus?.kind === 'day') {
    startMs = input.focus.dayStartMs;
    const nextDay = new Date(startMs);
    nextDay.setDate(nextDay.getDate() + 1);
    endMs = Math.min(nowMs, nextDay.getTime());
  } else if (input.focus?.kind === 'period') {
    startMs = input.focus.startMs;
    endMs = Math.min(nowMs, input.focus.endMs);
  }
  if (
    !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs ||
    endMs - startMs > 30 * DAY_MS
  ) {
    throw new Error('Recommendation evidence needs a valid past period of at most 30 days.');
  }
  return {startMs, endMs, days: (endMs - startMs) / DAY_MS, explicitPeriod};
};
