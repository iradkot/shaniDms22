import {MAX_RANGE_DAYS} from '../constants';

/**
 * Extract a "range days" number from user text (e.g. "last 3 months" → 90).
 * Returns null if no recognisable duration pattern is found.
 */
export function parseRangeDaysFromText(text: string): number | null {
  const lower = (text ?? '').toLowerCase();

  const month = lower.match(/(\d{1,2})\s*(month|months)/);
  if (month) return clampRange(Number(month[1]) * 30);

  const week = lower.match(/(\d{1,2})\s*(week|weeks)/);
  if (week) return clampRange(Number(week[1]) * 7);

  const day = lower.match(/(\d{1,3})\s*(day|days)/);
  if (day) return clampRange(Number(day[1]));

  // Basic Hebrew support: "חודש" / "חודשים".
  const hebMonth = (text ?? '').match(/(\d{1,2})\s*(חודש|חודשים)/);
  if (hebMonth) return clampRange(Number(hebMonth[1]) * 30);

  return null;
}

/** Does the text look like a question about hypers / highs? */
export function looksLikeHyperQuestion(text: string): boolean {
  const lower = (text ?? '').toLowerCase();
  return (
    lower.includes('hyper') ||
    lower.includes('hypers') ||
    lower.includes('high') ||
    lower.includes('highs') ||
    lower.includes('above range') ||
    lower.includes('היפר') ||
    lower.includes('גבוה')
  );
}

/** Does the text look like a question about hypos / lows? */
export function looksLikeHypoQuestion(text: string): boolean {
  const lower = (text ?? '').toLowerCase();
  return (
    lower.includes('hypo') ||
    lower.includes('hypos') ||
    lower.includes('low') ||
    lower.includes('lows') ||
    lower.includes('היפו') ||
    lower.includes('נמוך')
  );
}

/** Does the user want a count and/or dates? */
export function wantsCountWithDates(text: string): boolean {
  const lower = (text ?? '').toLowerCase();
  return (
    lower.includes('how many') ||
    lower.includes('count') ||
    lower.includes('כמה') ||
    lower.includes('מתי') ||
    lower.includes('dates') ||
    lower.includes('תאריכים')
  );
}

/**
 * Strip trailing LLM filler phrases like "one moment please…" from a response.
 */
export function stripFillerSuffix(text: string): string {
  return text
    .replace(
      /\s*(?:one moment(?: please)?\.?|one moment please\.?|hang on\.?|hold on\.?|just a moment\.?)+\s*$/i,
      '',
    )
    .trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clampRange(days: number): number {
  return Math.max(1, Math.min(MAX_RANGE_DAYS, days));
}
