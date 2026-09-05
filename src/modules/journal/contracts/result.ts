import {ActivityEntryId, MealEntryId, Revision} from '../domain/identifiers';
import {ValidationIssue} from '../domain/validation';

export const JOURNAL_ERROR_CODES = {
  INVALID_INPUT: 'journal.invalid_input',
  NOT_FOUND: 'journal.not_found',
  REVISION_CONFLICT: 'journal.revision_conflict',
  EXTERNAL_RECORD_UNIDENTIFIED: 'journal.external_record_unidentified',
  EXTERNAL_RECORD_ALREADY_LINKED: 'journal.external_record_already_linked',
  EXTERNAL_RECORD_UNAVAILABLE: 'journal.external_record_unavailable',
  ONGOING_ACTIVITY_EXISTS: 'journal.ongoing_activity_exists',
  CONCURRENT_ONGOING_ACTIVITY: 'journal.concurrent_ongoing_activity',
  ALREADY_TRASHED: 'journal.already_trashed',
  NOT_TRASHED: 'journal.not_trashed',
  OFFLINE: 'journal.offline',
  STORAGE_UNAVAILABLE: 'journal.storage_unavailable',
  MEDIA_UNAVAILABLE: 'journal.media_unavailable',
  SYNC_FAILED: 'journal.sync_failed',
  PERMISSION_DENIED: 'journal.permission_denied',
  CANCELLED: 'journal.cancelled',
} as const;

export type JournalErrorCode =
  (typeof JOURNAL_ERROR_CODES)[keyof typeof JOURNAL_ERROR_CODES];

interface JournalErrorBase<TCode extends JournalErrorCode> {
  readonly code: TCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type JournalError =
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.INVALID_INPUT> & {
      readonly retryable: false;
      readonly issues: readonly ValidationIssue[];
    })
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.NOT_FOUND> & {
      readonly retryable: false;
      readonly entity: 'meal' | 'activity' | 'external_record' | 'conflict';
    })
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.REVISION_CONFLICT> & {
      readonly retryable: false;
      readonly expected: Revision;
      readonly actual: Revision;
      readonly conflictingFields: readonly string[];
    })
  | (JournalErrorBase<
      typeof JOURNAL_ERROR_CODES.EXTERNAL_RECORD_UNIDENTIFIED
    > & {readonly retryable: false})
  | (JournalErrorBase<
      typeof JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED
    > & {
      readonly retryable: false;
      readonly linkedEntryId: MealEntryId | ActivityEntryId;
    })
  | JournalErrorBase<typeof JOURNAL_ERROR_CODES.EXTERNAL_RECORD_UNAVAILABLE>
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.ONGOING_ACTIVITY_EXISTS> & {
      readonly retryable: false;
      readonly activityId: ActivityEntryId;
    })
  | (JournalErrorBase<
      typeof JOURNAL_ERROR_CODES.CONCURRENT_ONGOING_ACTIVITY
    > & {
      readonly retryable: false;
      readonly activityIds: readonly ActivityEntryId[];
    })
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.ALREADY_TRASHED> & {
      readonly retryable: false;
    })
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.NOT_TRASHED> & {
      readonly retryable: false;
    })
  | JournalErrorBase<typeof JOURNAL_ERROR_CODES.OFFLINE>
  | JournalErrorBase<typeof JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE>
  | JournalErrorBase<typeof JOURNAL_ERROR_CODES.MEDIA_UNAVAILABLE>
  | JournalErrorBase<typeof JOURNAL_ERROR_CODES.SYNC_FAILED>
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.PERMISSION_DENIED> & {
      readonly retryable: false;
    })
  | (JournalErrorBase<typeof JOURNAL_ERROR_CODES.CANCELLED> & {
      readonly retryable: false;
    });

export type JournalResult<T, TError extends JournalError = JournalError> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: TError};

export function journalOk<T>(value: T): JournalResult<T, never> {
  return {ok: true, value};
}

export function journalError<TError extends JournalError>(
  error: TError,
): JournalResult<never, TError> {
  return {ok: false, error};
}
