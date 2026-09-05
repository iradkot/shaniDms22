import {
  createExternalRecordKey,
  ExternalRecordKey,
  NightscoutSourceId,
} from './identifiers';
import {
  collectIssues,
  invalid,
  issue,
  isRecord,
  ParseResult,
  parseFiniteNumber,
  parseOptionalString,
  parsePositiveNumber,
  parseTimestampMs,
  valid,
  ValidationIssue,
  ValidationPathSegment,
  VALIDATION_ISSUE_CODES,
} from './validation';

export interface ExternalIdentifiers {
  readonly _id?: string;
  readonly identifier?: string;
  readonly syncIdentifier?: string;
}

export type ExternalIdentityNamespace = keyof ExternalIdentifiers;

export interface ExternalStableIdentity {
  readonly namespace: ExternalIdentityNamespace;
  readonly value: string;
}

interface DecodedExternalRecordBase {
  readonly nightscoutSourceId: NightscoutSourceId;
  readonly identifiers: ExternalIdentifiers;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface IdentifiedExternalRecord extends DecodedExternalRecordBase {
  readonly identityStatus: 'identified';
  readonly recordKey: ExternalRecordKey;
  readonly primaryIdentity: ExternalStableIdentity;
}

export interface UnidentifiedExternalRecord extends DecodedExternalRecordBase {
  readonly identityStatus: 'unidentified';
  readonly recordKey: null;
  readonly primaryIdentity: null;
}

export type DecodedExternalRecord =
  | IdentifiedExternalRecord
  | UnidentifiedExternalRecord;

export interface ExternalRecordReference {
  readonly nightscoutSourceId: NightscoutSourceId;
  readonly recordKey: ExternalRecordKey;
  readonly identifiers: ExternalIdentifiers;
}

export type CarbPurpose = 'meal' | 'low_treatment' | 'unknown';

// V1 supports one carb identity plus one supporting treatment while staying
// within Firestore's strict-rule expression budget for an atomic write pair.
export const JOURNAL_MAX_EXTERNAL_LINKS_PER_EVENT = 2;

export interface ReportedCarbohydrateRole {
  readonly kind: 'reported_carbohydrate';
  readonly purpose: CarbPurpose;
}

export type SupportingTreatmentPurpose = 'bolus' | 'correction' | 'other';

export interface SupportingTreatmentRole {
  readonly kind: 'supporting_treatment';
  readonly purpose: SupportingTreatmentPurpose;
}

export interface ExternalActivityRole {
  readonly kind: 'activity';
}

export interface ExternalCarbRecordSnapshot {
  readonly kind: 'carbohydrate';
  readonly externalCarbTime: number;
  readonly externalEntryTime?: number;
  readonly carbohydratesGrams: number;
  readonly eventType?: string;
  readonly enteredBy?: string;
}

export interface ExternalTreatmentRecordSnapshot {
  readonly kind: 'treatment';
  readonly treatmentTime: number;
  readonly externalEntryTime?: number;
  readonly insulinUnits?: number;
  readonly eventType?: string;
  readonly enteredBy?: string;
}

export interface ExternalActivityRecordSnapshot {
  readonly kind: 'activity';
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly eventType?: string;
  readonly enteredBy?: string;
}

export type ExternalRecordSnapshot =
  | ExternalCarbRecordSnapshot
  | ExternalTreatmentRecordSnapshot
  | ExternalActivityRecordSnapshot;

export type ExternalRecordUnavailableReason =
  | 'deleted'
  | 'not_found'
  | 'source_unavailable'
  | 'unknown';

export interface ReadLinkedExternalRecordInput {
  readonly record: ExternalRecordReference;
  readonly lastKnown: ExternalRecordSnapshot;
}

export type ReadLinkedExternalRecordResult =
  | {
      readonly kind: 'available';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalRecordSnapshot;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: ExternalRecordUnavailableReason;
    };

export type ExternalRecordAvailability<TSnapshot> =
  | {
      readonly kind: 'available';
      readonly checkedAt: number;
      readonly snapshot: TSnapshot;
    }
  | {
      readonly kind: 'unavailable';
      readonly checkedAt: number;
      readonly reason: ExternalRecordUnavailableReason;
      readonly lastKnown?: TSnapshot;
    };

export interface ExternalEventLink<TRole, TSnapshot> {
  readonly record: ExternalRecordReference;
  readonly role: TRole;
  readonly linkedAt: number;
  readonly external: ExternalRecordAvailability<TSnapshot>;
}

function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  namespace: ExternalIdentityNamespace,
  path: readonly ValidationPathSegment[],
): ParseResult<string | undefined> {
  return parseOptionalString(record[namespace], [...path, namespace]);
}

function choosePrimaryIdentity(
  identifiers: ExternalIdentifiers,
): ExternalStableIdentity | undefined {
  if (identifiers._id !== undefined) {
    return {namespace: '_id', value: identifiers._id};
  }
  if (identifiers.identifier !== undefined) {
    return {namespace: 'identifier', value: identifiers.identifier};
  }
  if (identifiers.syncIdentifier !== undefined) {
    return {namespace: 'syncIdentifier', value: identifiers.syncIdentifier};
  }
  return undefined;
}

export function decodeExternalRecordPayload(
  value: unknown,
  nightscoutSourceId: NightscoutSourceId,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<DecodedExternalRecord> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external record object.',
      ),
    ]);
  }

  const nightscoutId = readIdentifier(value, '_id', path);
  const identifier = readIdentifier(value, 'identifier', path);
  const syncIdentifier = readIdentifier(value, 'syncIdentifier', path);
  const issues = collectIssues(nightscoutId, identifier, syncIdentifier);
  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!nightscoutId.ok) {
    return nightscoutId;
  }
  if (!identifier.ok) {
    return identifier;
  }
  if (!syncIdentifier.ok) {
    return syncIdentifier;
  }

  const identifiers: ExternalIdentifiers = {
    ...(nightscoutId.value === undefined ? {} : {_id: nightscoutId.value}),
    ...(identifier.value === undefined ? {} : {identifier: identifier.value}),
    ...(syncIdentifier.value === undefined
      ? {}
      : {syncIdentifier: syncIdentifier.value}),
  };
  const primaryIdentity = choosePrimaryIdentity(identifiers);

  if (primaryIdentity === undefined) {
    return valid({
      identityStatus: 'unidentified',
      nightscoutSourceId,
      identifiers,
      recordKey: null,
      primaryIdentity: null,
      raw: value,
    });
  }

  return valid({
    identityStatus: 'identified',
    nightscoutSourceId,
    identifiers,
    recordKey: createExternalRecordKey(
      nightscoutSourceId,
      primaryIdentity.namespace,
      primaryIdentity.value,
    ),
    primaryIdentity,
    raw: value,
  });
}

export function toExternalRecordReference(
  record: DecodedExternalRecord,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ExternalRecordReference> {
  if (record.identityStatus === 'unidentified') {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        path,
        'A record without stable external identity cannot form a live link.',
      ),
    ]);
  }

  return valid({
    nightscoutSourceId: record.nightscoutSourceId,
    recordKey: record.recordKey,
    identifiers: record.identifiers,
  });
}

function sameStableIdentity(
  left: ExternalIdentifiers,
  right: ExternalIdentifiers,
): boolean {
  return (
    (left._id !== undefined && left._id === right._id) ||
    (left.identifier !== undefined && left.identifier === right.identifier) ||
    (left.syncIdentifier !== undefined &&
      left.syncIdentifier === right.syncIdentifier)
  );
}

export function areExactExternalDuplicates(
  left: DecodedExternalRecord | ExternalRecordReference,
  right: DecodedExternalRecord | ExternalRecordReference,
): boolean {
  if (
    left.nightscoutSourceId !== right.nightscoutSourceId ||
    ('identityStatus' in left && left.identityStatus === 'unidentified') ||
    ('identityStatus' in right && right.identityStatus === 'unidentified')
  ) {
    return false;
  }

  return sameStableIdentity(left.identifiers, right.identifiers);
}

function readOptionalTimestamp(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number | undefined> {
  return value === undefined || value === null
    ? valid(undefined)
    : parseTimestampMs(value, path);
}

function readOptionalNumber(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number | undefined> {
  return value === undefined || value === null
    ? valid(undefined)
    : parseFiniteNumber(value, path);
}

export function parseExternalCarbRecordSnapshot(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ExternalCarbRecordSnapshot> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external carbohydrate snapshot object.',
      ),
    ]);
  }

  const carbTime = parseTimestampMs(value.externalCarbTime, [
    ...path,
    'externalCarbTime',
  ]);
  const entryTime = readOptionalTimestamp(value.externalEntryTime, [
    ...path,
    'externalEntryTime',
  ]);
  const carbohydrates = parsePositiveNumber(value.carbohydratesGrams, [
    ...path,
    'carbohydratesGrams',
  ]);
  const eventType = parseOptionalString(value.eventType, [
    ...path,
    'eventType',
  ]);
  const enteredBy = parseOptionalString(value.enteredBy, [
    ...path,
    'enteredBy',
  ]);
  const issues = collectIssues(
    carbTime,
    entryTime,
    carbohydrates,
    eventType,
    enteredBy,
  );
  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!carbTime.ok) {
    return carbTime;
  }
  if (!entryTime.ok) {
    return entryTime;
  }
  if (!carbohydrates.ok) {
    return carbohydrates;
  }
  if (!eventType.ok) {
    return eventType;
  }
  if (!enteredBy.ok) {
    return enteredBy;
  }

  return valid({
    kind: 'carbohydrate',
    externalCarbTime: carbTime.value,
    ...(entryTime.value === undefined
      ? {}
      : {externalEntryTime: entryTime.value}),
    carbohydratesGrams: carbohydrates.value,
    ...(eventType.value === undefined ? {} : {eventType: eventType.value}),
    ...(enteredBy.value === undefined ? {} : {enteredBy: enteredBy.value}),
  });
}

export function parseExternalTreatmentRecordSnapshot(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ExternalTreatmentRecordSnapshot> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external treatment snapshot object.',
      ),
    ]);
  }

  const treatmentTime = parseTimestampMs(value.treatmentTime, [
    ...path,
    'treatmentTime',
  ]);
  const entryTime = readOptionalTimestamp(value.externalEntryTime, [
    ...path,
    'externalEntryTime',
  ]);
  const insulin = readOptionalNumber(value.insulinUnits, [
    ...path,
    'insulinUnits',
  ]);
  const eventType = parseOptionalString(value.eventType, [
    ...path,
    'eventType',
  ]);
  const enteredBy = parseOptionalString(value.enteredBy, [
    ...path,
    'enteredBy',
  ]);
  const issues = collectIssues(
    treatmentTime,
    entryTime,
    insulin,
    eventType,
    enteredBy,
  );
  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!treatmentTime.ok) {
    return treatmentTime;
  }
  if (!entryTime.ok) {
    return entryTime;
  }
  if (!insulin.ok) {
    return insulin;
  }
  if (!eventType.ok) {
    return eventType;
  }
  if (!enteredBy.ok) {
    return enteredBy;
  }
  if (insulin.value !== undefined && insulin.value < 0) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
        [...path, 'insulinUnits'],
        'Insulin units cannot be negative.',
      ),
    ]);
  }

  return valid({
    kind: 'treatment',
    treatmentTime: treatmentTime.value,
    ...(entryTime.value === undefined
      ? {}
      : {externalEntryTime: entryTime.value}),
    ...(insulin.value === undefined ? {} : {insulinUnits: insulin.value}),
    ...(eventType.value === undefined ? {} : {eventType: eventType.value}),
    ...(enteredBy.value === undefined ? {} : {enteredBy: enteredBy.value}),
  });
}

export function parseExternalActivityRecordSnapshot(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ExternalActivityRecordSnapshot> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external activity snapshot object.',
      ),
    ]);
  }
  if (value.kind !== 'activity') {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        [...path, 'kind'],
        'Expected an activity snapshot kind.',
      ),
    ]);
  }
  const startedAt = parseTimestampMs(value.startedAt, [...path, 'startedAt']);
  const endedAt = readOptionalTimestamp(value.endedAt, [...path, 'endedAt']);
  const eventType = parseOptionalString(value.eventType, [
    ...path,
    'eventType',
  ]);
  const enteredBy = parseOptionalString(value.enteredBy, [
    ...path,
    'enteredBy',
  ]);
  const issues = collectIssues(startedAt, endedAt, eventType, enteredBy);
  if (
    startedAt.ok &&
    endedAt.ok &&
    endedAt.value !== undefined &&
    endedAt.value < startedAt.value
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'endedAt'],
        'An external activity cannot end before it starts.',
      ),
    );
  }
  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!startedAt.ok) {
    return startedAt;
  }
  if (!endedAt.ok) {
    return endedAt;
  }
  if (!eventType.ok) {
    return eventType;
  }
  if (!enteredBy.ok) {
    return enteredBy;
  }
  return valid({
    kind: 'activity',
    startedAt: startedAt.value,
    ...(endedAt.value === undefined ? {} : {endedAt: endedAt.value}),
    ...(eventType.value === undefined ? {} : {eventType: eventType.value}),
    ...(enteredBy.value === undefined ? {} : {enteredBy: enteredBy.value}),
  });
}

export function validateExternalLinksFromOneSource(
  links: readonly ExternalEventLink<unknown, unknown>[],
  nightscoutSourceId: NightscoutSourceId,
  path: readonly ValidationPathSegment[] = ['externalLinks'],
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (links.length > JOURNAL_MAX_EXTERNAL_LINKS_PER_EVENT) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
        path,
        `At most ${JOURNAL_MAX_EXTERNAL_LINKS_PER_EVENT} external records may be linked to one Journal event.`,
      ),
    );
  }

  links.forEach((link, index) => {
    if (link.record.nightscoutSourceId !== nightscoutSourceId) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.INVARIANT,
          [...path, index, 'record', 'nightscoutSourceId'],
          'An external link must belong to the Workspace Nightscout source.',
        ),
      );
    }

    const duplicateIndex = links.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex < index &&
        areExactExternalDuplicates(candidate.record, link.record),
    );
    if (duplicateIndex >= 0) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.DUPLICATE,
          [...path, index, 'record'],
          `The same stable external record is already linked at index ${duplicateIndex}.`,
        ),
      );
    }
  });

  return issues;
}
