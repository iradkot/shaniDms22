import {
  invalid,
  issue,
  ParseResult,
  parseNonNegativeInteger,
  parseRequiredString,
  valid,
  ValidationPathSegment,
  VALIDATION_ISSUE_CODES,
} from './validation';

declare const productUserIdBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const nightscoutSourceIdBrand: unique symbol;
declare const mealEntryIdBrand: unique symbol;
declare const activityEntryIdBrand: unique symbol;
declare const revisionBrand: unique symbol;
declare const externalRecordKeyBrand: unique symbol;
declare const journalConflictIdBrand: unique symbol;

export type ProductUserId = string & {
  readonly [productUserIdBrand]: 'ProductUserId';
};
export type WorkspaceId = string & {
  readonly [workspaceIdBrand]: 'WorkspaceId';
};
export type NightscoutSourceId = string & {
  readonly [nightscoutSourceIdBrand]: 'NightscoutSourceId';
};
export type MealEntryId = string & {
  readonly [mealEntryIdBrand]: 'MealEntryId';
};
export type ActivityEntryId = string & {
  readonly [activityEntryIdBrand]: 'ActivityEntryId';
};
export type Revision = number & {readonly [revisionBrand]: 'Revision'};
export type ExternalRecordKey = string & {
  readonly [externalRecordKeyBrand]: 'ExternalRecordKey';
};
export type JournalConflictId = string & {
  readonly [journalConflictIdBrand]: 'JournalConflictId';
};

type StringBrandParser<T extends string> = (
  value: unknown,
  path?: readonly ValidationPathSegment[],
) => ParseResult<T>;

function parseBrandedString<T extends string>(
  value: unknown,
  path: readonly ValidationPathSegment[],
  brandAfterValidation: (validValue: string) => T,
): ParseResult<T> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.value !== parsed.value.trim()) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_FORMAT,
        path,
        'Identifiers cannot start or end with whitespace.',
      ),
    ]);
  }

  return valid(brandAfterValidation(parsed.value));
}

// The assertions below happen only after the shared runtime validation above.
export const parseProductUserId: StringBrandParser<ProductUserId> = (
  value,
  path = [],
) => parseBrandedString(value, path, validValue => validValue as ProductUserId);

export const parseWorkspaceId: StringBrandParser<WorkspaceId> = (
  value,
  path = [],
) => parseBrandedString(value, path, validValue => validValue as WorkspaceId);

export const parseNightscoutSourceId: StringBrandParser<NightscoutSourceId> = (
  value,
  path = [],
) =>
  parseBrandedString(
    value,
    path,
    validValue => validValue as NightscoutSourceId,
  );

export const parseMealEntryId: StringBrandParser<MealEntryId> = (
  value,
  path = [],
) => parseBrandedString(value, path, validValue => validValue as MealEntryId);

export const parseActivityEntryId: StringBrandParser<ActivityEntryId> = (
  value,
  path = [],
) =>
  parseBrandedString(value, path, validValue => validValue as ActivityEntryId);

export const parseExternalRecordKey: StringBrandParser<ExternalRecordKey> = (
  value,
  path = [],
) =>
  parseBrandedString(
    value,
    path,
    validValue => validValue as ExternalRecordKey,
  );

export const parseJournalConflictId: StringBrandParser<JournalConflictId> = (
  value,
  path = [],
) =>
  parseBrandedString(
    value,
    path,
    validValue => validValue as JournalConflictId,
  );

export function parseRevision(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<Revision> {
  const parsed = parseNonNegativeInteger(value, path);
  return parsed.ok ? valid(parsed.value as Revision) : parsed;
}

export function createExternalRecordKey(
  sourceId: NightscoutSourceId,
  namespace: '_id' | 'identifier' | 'syncIdentifier',
  identity: string,
): ExternalRecordKey {
  const serialised = `${encodeURIComponent(
    sourceId,
  )}:${namespace}:${encodeURIComponent(identity)}`;
  return serialised as ExternalRecordKey;
}
