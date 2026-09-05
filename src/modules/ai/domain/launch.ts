import {getAiSpecialistDefinition} from './specialists';
import type {
  AiConversationFocus,
  AiConversationLaunch,
  AiLocale,
  AiSpecialistId,
} from './types';

const validId = (value: string): boolean => value.trim().length > 0;
const validTimestamp = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const formatDate = (timestampMs: number, locale: AiLocale): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestampMs));

const describeFocus = (
  focus: AiConversationFocus,
  locale: AiLocale,
): string | undefined => {
  const he = locale === 'he';
  switch (focus.kind) {
    case 'day':
      return validTimestamp(focus.dayStartMs)
        ? he
          ? `יום ממוקד: ${formatDate(focus.dayStartMs, locale)}.`
          : `Focused day: ${formatDate(focus.dayStartMs, locale)}.`
        : undefined;
    case 'period':
      return validTimestamp(focus.startMs) &&
        validTimestamp(focus.endMs) &&
        focus.endMs > focus.startMs
        ? he
          ? `תקופה ממוקדת: ${formatDate(focus.startMs, locale)} עד ${formatDate(
              focus.endMs,
              locale,
            )}.`
          : `Focused period: ${formatDate(
              focus.startMs,
              locale,
            )} to ${formatDate(focus.endMs, locale)}.`
        : undefined;
    case 'journal-entry':
      if (!validId(focus.entryId)) {
        return undefined;
      }
      return he
        ? `${focus.entryKind === 'meal' ? 'ארוחה' : 'פעילות'} ממוקדת: ${
            focus.entryId
          }.`
        : `Focused ${focus.entryKind}: ${focus.entryId}.`;
    case 'external-record':
      if (!validId(focus.recordId)) {
        return undefined;
      }
      return he
        ? `רשומת מקור ממוקדת (${focus.recordKind}): ${focus.recordId}.`
        : `Focused source record (${focus.recordKind}): ${focus.recordId}.`;
    case 'alert-occurrence':
      if (!validId(focus.occurrenceId)) {
        return undefined;
      }
      return he
        ? `התראה ממוקדת: ${focus.occurrenceId}.`
        : `Focused alert occurrence: ${focus.occurrenceId}.`;
    case 'loop-change':
      if (!validId(focus.changeId)) {
        return undefined;
      }
      return he
        ? `שינוי הגדרת Loop ממוקד: ${focus.changeId}.`
        : `Focused Loop setting change: ${focus.changeId}.`;
    case 'ai-conversation':
      if (!validId(focus.conversationId)) {
        return undefined;
      }
      return he
        ? `שיחה שממשיכים: ${focus.conversationId}.`
        : `Conversation to continue: ${focus.conversationId}.`;
  }
};

/**
 * Builds one visible launch fact. The returned text is safe to show verbatim;
 * adapters must never prepend an undisclosed instruction before sending it.
 */
export const createAiConversationLaunch = (input: {
  readonly specialist: AiSpecialistId;
  readonly locale: AiLocale;
  readonly focus?: AiConversationFocus;
}): AiConversationLaunch => {
  const definition = getAiSpecialistDefinition(input.specialist);
  const focus = input.focus
    ? describeFocus(input.focus, input.locale)
    : undefined;
  const specialistTitle = definition.copy[input.locale].title;

  return {
    specialist: input.specialist,
    ...(focus === undefined
      ? {}
      : {visibleContext: `${specialistTitle} · ${focus}`}),
  };
};
