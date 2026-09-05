import {
  parseActivityEntryId,
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../domain/identifiers';
import type {
  ActivityEntryId,
  MealEntryId,
  Revision,
} from '../domain/identifiers';
import type {JournalTombstone} from '../domain/tombstones';
import {
  invalid,
  isRecord,
  issue,
  valid,
  VALIDATION_ISSUE_CODES,
} from '../domain/validation';
import type {ParseResult, ValidationIssue} from '../domain/validation';
import {decodeRemoteJournalDocument} from './remoteDocumentCodec';
import {
  JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
  type RemoteJournalChange,
  type RemoteJournalPurgeChange,
} from './remoteChangeTypes';

const knownKeys = (
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): readonly ValidationIssue[] =>
  Object.keys(value)
    .filter(key => !allowed.includes(key))
    .map(key =>
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        [key],
        'Unknown remote Journal change field.',
      ),
    );

const nonEmptyString = (value: unknown, field: string): ParseResult<string> =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 512
    ? valid(value)
    : invalid([
        issue(
          VALIDATION_ISSUE_CODES.INVALID_FORMAT,
          [field],
          `Expected a non-empty ${field}.`,
        ),
      ]);

const changedFields = (value: unknown): ParseResult<readonly string[]> => {
  if (!Array.isArray(value) || value.length === 0) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.REQUIRED,
        ['changedFields'],
        'A remote Journal change needs changed fields.',
      ),
    ]);
  }
  const fields = value.filter(
    (field): field is string =>
      typeof field === 'string' && field.trim().length > 0,
  );
  if (
    fields.length !== value.length ||
    new Set(fields).size !== fields.length
  ) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        ['changedFields'],
        'Remote Journal changed fields must be unique non-empty strings.',
      ),
    ]);
  }
  return valid(fields);
};

const baseRevision = (value: unknown): ParseResult<Revision | null> =>
  value === null ? valid(null) : parseRevision(value, ['baseRevision']);

const decodePurge = (
  value: Readonly<Record<string, unknown>>,
): ParseResult<RemoteJournalPurgeChange> => {
  const unknown = knownKeys(value, [
    'schemaVersion',
    'changeKind',
    'operationId',
    'baseRevision',
    'localRevision',
    'changedFields',
    'scope',
    'tombstone',
  ]);
  if (
    unknown.length > 0 ||
    !isRecord(value.scope) ||
    !isRecord(value.tombstone)
  ) {
    return invalid(
      unknown.length > 0
        ? unknown
        : [
            issue(
              VALIDATION_ISSUE_CODES.INVALID_TYPE,
              ['scope'],
              'Expected purge scope and tombstone objects.',
            ),
          ],
    );
  }
  const operationId = nonEmptyString(value.operationId, 'operationId');
  const base = baseRevision(value.baseRevision);
  const revision = parseRevision(value.localRevision, ['localRevision']);
  const fields = changedFields(value.changedFields);
  const owner = parseProductUserId(value.scope.ownerProductUserId, [
    'scope',
    'ownerProductUserId',
  ]);
  const workspaceId = parseWorkspaceId(value.scope.workspaceId, [
    'scope',
    'workspaceId',
  ]);
  const sourceId = parseNightscoutSourceId(value.scope.nightscoutSourceId, [
    'scope',
    'nightscoutSourceId',
  ]);
  const tombstone = value.tombstone;
  const entityKind = tombstone.entityKind;
  const entityId =
    entityKind === 'meal'
      ? parseMealEntryId(tombstone.entityId, ['tombstone', 'entityId'])
      : entityKind === 'activity'
      ? parseActivityEntryId(tombstone.entityId, ['tombstone', 'entityId'])
      : invalid<never>([
          issue(
            VALIDATION_ISSUE_CODES.INVALID_VALUE,
            ['tombstone', 'entityKind'],
            'Unknown Journal entity kind.',
          ),
        ]);
  const tombstoneRevision = parseRevision(tombstone.revision, [
    'tombstone',
    'revision',
  ]);
  const purgedAt =
    Number.isSafeInteger(tombstone.purgedAt) &&
    (tombstone.purgedAt as number) > 0
      ? valid(tombstone.purgedAt as number)
      : invalid<number>([
          issue(
            VALIDATION_ISSUE_CODES.INVALID_VALUE,
            ['tombstone', 'purgedAt'],
            'Expected a positive purge timestamp.',
          ),
        ]);
  const issues = [
    ...(!operationId.ok ? operationId.issues : []),
    ...(!base.ok ? base.issues : []),
    ...(!revision.ok ? revision.issues : []),
    ...(!fields.ok ? fields.issues : []),
    ...(!owner.ok ? owner.issues : []),
    ...(!workspaceId.ok ? workspaceId.issues : []),
    ...(!sourceId.ok ? sourceId.issues : []),
    ...(!entityId.ok ? entityId.issues : []),
    ...(!tombstoneRevision.ok ? tombstoneRevision.issues : []),
    ...(!purgedAt.ok ? purgedAt.issues : []),
  ];
  if (
    tombstone.kind !== 'journal_tombstone' ||
    (fields.ok && (fields.value.length !== 1 || fields.value[0] !== 'purge')) ||
    (revision.ok &&
      tombstoneRevision.ok &&
      revision.value !== tombstoneRevision.value) ||
    (revision.ok &&
      base.ok &&
      base.value !== null &&
      base.value >= revision.value)
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['tombstone'],
        'The purge envelope and tombstone do not match.',
      ),
    );
  }
  if (
    issues.length > 0 ||
    !operationId.ok ||
    !base.ok ||
    !revision.ok ||
    !fields.ok ||
    !owner.ok ||
    !workspaceId.ok ||
    !sourceId.ok ||
    !entityId.ok ||
    !tombstoneRevision.ok ||
    !purgedAt.ok ||
    (entityKind !== 'meal' && entityKind !== 'activity')
  ) {
    return invalid(issues);
  }
  const decodedTombstone: JournalTombstone =
    entityKind === 'meal'
      ? {
          kind: 'journal_tombstone',
          entityKind,
          entityId: entityId.value as MealEntryId,
          purgedAt: purgedAt.value,
          revision: tombstoneRevision.value,
        }
      : {
          kind: 'journal_tombstone',
          entityKind,
          entityId: entityId.value as ActivityEntryId,
          purgedAt: purgedAt.value,
          revision: tombstoneRevision.value,
        };
  return valid<RemoteJournalPurgeChange>({
    schemaVersion: JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
    changeKind: 'purge',
    operationId: operationId.value,
    baseRevision: base.value,
    localRevision: revision.value,
    changedFields: fields.value,
    scope: {
      ownerProductUserId: owner.value,
      workspaceId: workspaceId.value,
      nightscoutSourceId: sourceId.value,
    },
    tombstone: decodedTombstone,
  });
};

export const decodeRemoteJournalChange = (
  value: unknown,
): ParseResult<RemoteJournalChange> => {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        [],
        'Expected a remote Journal change object.',
      ),
    ]);
  }
  if (value.schemaVersion !== JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        ['schemaVersion'],
        'Unsupported remote Journal change schema version.',
      ),
    ]);
  }
  if (value.changeKind === 'purge') {
    return decodePurge(value);
  }
  if (value.changeKind !== 'upsert') {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        ['changeKind'],
        'Unknown remote Journal change kind.',
      ),
    ]);
  }
  const unknown = knownKeys(value, [
    'schemaVersion',
    'changeKind',
    'operationId',
    'baseRevision',
    'localRevision',
    'changedFields',
    'document',
  ]);
  const operationId = nonEmptyString(value.operationId, 'operationId');
  const base = baseRevision(value.baseRevision);
  const revision = parseRevision(value.localRevision, ['localRevision']);
  const fields = changedFields(value.changedFields);
  const document = decodeRemoteJournalDocument(value.document);
  const issues = [
    ...unknown,
    ...(!operationId.ok ? operationId.issues : []),
    ...(!base.ok ? base.issues : []),
    ...(!revision.ok ? revision.issues : []),
    ...(!fields.ok ? fields.issues : []),
    ...(!document.ok ? document.issues : []),
  ];
  if (
    revision.ok &&
    document.ok &&
    revision.value !== document.value.revision
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['localRevision'],
        'The change revision must match its document.',
      ),
    );
  }
  if (
    revision.ok &&
    base.ok &&
    base.value !== null &&
    base.value >= revision.value
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['baseRevision'],
        'The base revision must precede the local revision.',
      ),
    );
  }
  if (
    issues.length > 0 ||
    !operationId.ok ||
    !base.ok ||
    !revision.ok ||
    !fields.ok ||
    !document.ok
  ) {
    return invalid(issues);
  }
  return valid<RemoteJournalChange>({
    schemaVersion: JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
    changeKind: 'upsert',
    operationId: operationId.value,
    baseRevision: base.value,
    localRevision: revision.value,
    changedFields: fields.value,
    document: document.value,
  });
};
