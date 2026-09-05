import {JOURNAL_ERROR_CODES, journalError} from '../contracts/result';
import type {JournalResult} from '../contracts/result';
import type {FieldChange, JournalListQuery} from '../domain/journal';
import type {Revision} from '../domain/identifiers';
import type {MealImageInput, MealImageSnapshot} from '../domain/meals';
import {VALIDATION_ISSUE_CODES, ValidationIssue} from '../domain/validation';
import type {ParseResult, ValidationPathSegment} from '../domain/validation';

export const validationIssue = (
  path: readonly ValidationPathSegment[],
  message: string,
): ValidationIssue => ({
  code: VALIDATION_ISSUE_CODES.INVARIANT,
  path,
  message,
});

export const invalidInput = <T>(
  issues: readonly ValidationIssue[],
): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.INVALID_INPUT,
    message: 'The Journal change is invalid.',
    retryable: false,
    issues,
  });

const JOURNAL_CURSOR_PATTERN = /^journal-offset:(0|[1-9]\d*)$/;

/** Shared runtime validation for the public Meal and Activity list Interface. */
export const validateJournalListQuery = (
  query: JournalListQuery | undefined,
): JournalResult<never> | undefined => {
  if (query === undefined) {
    return undefined;
  }

  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    return invalidInput([
      validationIssue([], 'The list query must be an object.'),
    ]);
  }

  const issues: ValidationIssue[] = [];
  const timeRange = query.timeRange;
  if (
    timeRange !== undefined &&
    (!Number.isSafeInteger(timeRange.fromInclusive) ||
      timeRange.fromInclusive <= 0 ||
      !Number.isSafeInteger(timeRange.toExclusive) ||
      timeRange.toExclusive <= timeRange.fromInclusive)
  ) {
    issues.push(
      validationIssue(
        ['timeRange'],
        'The list time range must contain safe timestamps and a later end.',
      ),
    );
  }

  if (
    query.limit !== undefined &&
    (!Number.isSafeInteger(query.limit) || query.limit <= 0)
  ) {
    issues.push(validationIssue(['limit'], 'The list limit must be positive.'));
  }

  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== 'string' ||
      !JOURNAL_CURSOR_PATTERN.test(query.cursor) ||
      !Number.isSafeInteger(
        Number(query.cursor.slice('journal-offset:'.length)),
      ))
  ) {
    issues.push(
      validationIssue(['cursor'], 'The list cursor is invalid or expired.'),
    );
  }

  if (
    query.includeTrashed !== undefined &&
    typeof query.includeTrashed !== 'boolean'
  ) {
    issues.push(
      validationIssue(['includeTrashed'], 'Expected a true or false value.'),
    );
  }

  return issues.length === 0 ? undefined : invalidInput(issues);
};

export const parseFailure = <T>(
  result: ParseResult<unknown>,
): JournalResult<T> | undefined =>
  result.ok ? undefined : invalidInput(result.issues);

export const storageFailure = <T>(error: unknown): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE,
    message:
      error instanceof Error
        ? `The local Journal could not be saved: ${error.message}`
        : 'The local Journal could not be saved.',
    retryable: true,
  });

export const mediaFailure = <T>(error: unknown): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.MEDIA_UNAVAILABLE,
    message:
      error instanceof Error
        ? `The meal image could not be stored locally: ${error.message}`
        : 'The meal image could not be stored locally.',
    retryable: true,
  });

export const nextRevision = (revision: Revision): Revision => {
  const value = revision + 1;
  if (!Number.isSafeInteger(value)) {
    throw new Error('Journal revision overflow.');
  }
  return value as Revision;
};

export const initialRevision = (): Revision => 1 as Revision;

export const applyFieldChange = <T>(
  current: T | undefined,
  change: FieldChange<T> | undefined,
): T | undefined => {
  if (change === undefined) {
    return current;
  }
  if (change.kind === 'set') {
    return change.value;
  }
  if (change.kind === 'clear') {
    return undefined;
  }
  throw new Error('Unknown Journal FieldChange kind.');
};

export const validateFieldChanges = (
  input: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  fields.forEach(field => {
    const value = input[field];
    if (value === undefined) {
      return;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push(
        validationIssue([field], 'Expected a set or clear field change.'),
      );
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    if (record.kind === 'set') {
      if (!Object.prototype.hasOwnProperty.call(record, 'value')) {
        issues.push(
          validationIssue([field, 'value'], 'A set value is required.'),
        );
      }
      return;
    }
    if (record.kind !== 'clear') {
      issues.push(
        validationIssue([field, 'kind'], 'Expected "set" or "clear".'),
      );
    }
  });
  return issues;
};

export const changedFields = (
  input: Readonly<Record<string, unknown>>,
  candidates: readonly string[],
): readonly string[] => candidates.filter(field => input[field] !== undefined);

export const imageSnapshotAsInput = (
  image: MealImageSnapshot,
): MealImageInput => {
  const uri =
    image.syncState.kind === 'available'
      ? image.syncState.localUri ?? image.syncState.displayUri
      : image.syncState.localUri;
  return {
    uri,
    mimeType: image.mimeType,
    ...(image.fileName === undefined ? {} : {fileName: image.fileName}),
    ...(image.byteSize === undefined ? {} : {byteSize: image.byteSize}),
    ...(image.widthPx === undefined ? {} : {widthPx: image.widthPx}),
    ...(image.heightPx === undefined ? {} : {heightPx: image.heightPx}),
  };
};
