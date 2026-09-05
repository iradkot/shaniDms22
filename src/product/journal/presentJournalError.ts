import type {JournalError, JournalResult} from '../../modules/journal';

export type JournalPresentationLocale = 'en' | 'he';

const COPY = {
  en: {
    invalid: 'Some details are invalid. Check the form and try again.',
    notFound: 'This item is no longer available.',
    changed: 'This item changed elsewhere. Reopen it before editing.',
    external: 'The linked Nightscout record is not available right now.',
    linked: 'That Nightscout record is already linked to another item.',
    ongoing: 'Finish the current activity before starting another one.',
    concurrent: 'More than one ongoing activity needs to be resolved.',
    lifecycle: 'This item is already in a different Trash state.',
    offline: 'There is no connection right now. Your local data is unchanged.',
    storage: 'The change could not be saved on this device.',
    media: 'The image could not be saved on this device.',
    sync: 'The change is local, but sync needs attention.',
    permission: 'This account is not allowed to make that change.',
    cancelled: 'The change was cancelled.',
    unexpected: 'Something went wrong. Your local data was not changed.',
  },
  he: {
    invalid: 'חלק מהפרטים אינם תקינים. בדקו את הטופס ונסו שוב.',
    notFound: 'הפריט הזה כבר אינו זמין.',
    changed: 'הפריט השתנה במקום אחר. פתחו אותו מחדש לפני עריכה.',
    external: 'הרשומה המקושרת מ־Nightscout אינה זמינה כרגע.',
    linked: 'הרשומה הזו מ־Nightscout כבר מקושרת לפריט אחר.',
    ongoing: 'צריך לסיים את הפעילות הנוכחית לפני שמתחילים חדשה.',
    concurrent: 'יש כמה פעילויות בתהליך שצריך להסדיר.',
    lifecycle: 'הפריט כבר נמצא במצב אחר של סל המחזור.',
    offline: 'אין חיבור כרגע. המידע המקומי לא השתנה.',
    storage: 'לא הצלחנו לשמור את השינוי במכשיר.',
    media: 'לא הצלחנו לשמור את התמונה במכשיר.',
    sync: 'השינוי נשמר מקומית, אבל הסנכרון דורש תשומת לב.',
    permission: 'לחשבון הזה אין הרשאה לבצע את השינוי.',
    cancelled: 'השינוי בוטל.',
    unexpected: 'משהו השתבש. המידע המקומי לא השתנה.',
  },
} as const;

/** Converts stable domain codes into safe, localized product copy. */
export const presentJournalError = (
  error: JournalError,
  locale: JournalPresentationLocale,
): string => {
  const copy = COPY[locale];
  switch (error.code) {
    case 'journal.invalid_input':
      return copy.invalid;
    case 'journal.not_found':
      return copy.notFound;
    case 'journal.revision_conflict':
      return copy.changed;
    case 'journal.external_record_unidentified':
    case 'journal.external_record_unavailable':
      return copy.external;
    case 'journal.external_record_already_linked':
      return copy.linked;
    case 'journal.ongoing_activity_exists':
      return copy.ongoing;
    case 'journal.concurrent_ongoing_activity':
      return copy.concurrent;
    case 'journal.already_trashed':
    case 'journal.not_trashed':
      return copy.lifecycle;
    case 'journal.offline':
      return copy.offline;
    case 'journal.storage_unavailable':
      return copy.storage;
    case 'journal.media_unavailable':
      return copy.media;
    case 'journal.sync_failed':
      return copy.sync;
    case 'journal.permission_denied':
      return copy.permission;
    case 'journal.cancelled':
      return copy.cancelled;
  }
};

export type PresentedJournalActionResult<T> =
  | {readonly ok: true; readonly value: T}
  | {
      readonly ok: false;
      readonly message: string;
      /** Present only for a handled domain failure; thrown internals stay hidden. */
      readonly error?: JournalError;
    };

/** Always resolves and guarantees product copy for both errors and throws. */
export const runPresentedJournalAction = async <T>(
  action: () => Promise<JournalResult<T>>,
  locale: JournalPresentationLocale,
): Promise<PresentedJournalActionResult<T>> => {
  try {
    const result = await action();
    return result.ok
      ? result
      : {
          ok: false,
          message: presentJournalError(result.error, locale),
          error: result.error,
        };
  } catch {
    return {ok: false, message: COPY[locale].unexpected};
  }
};
