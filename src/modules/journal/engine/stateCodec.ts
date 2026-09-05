import {
  parseActivityEntryId,
  parseExternalRecordKey,
  parseJournalConflictId,
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../domain/identifiers';
import type {
  ActivityEntryId,
  MealEntryId,
  NightscoutSourceId,
  Revision,
} from '../domain/identifiers';
import {
  parseExternalActivityRecordSnapshot,
  parseExternalCarbRecordSnapshot,
  parseExternalTreatmentRecordSnapshot,
} from '../domain/externalRecords';
import type {
  ExternalActivityRecordSnapshot,
  ExternalRecordAvailability,
  ExternalRecordReference,
  ExternalTreatmentRecordSnapshot,
  ReportedCarbohydrateRole,
  SupportingTreatmentRole,
} from '../domain/externalRecords';
import {
  parseActivityCategory,
  parseActivityIntensity,
  parseCaptureActivityInput,
  validateActivitySnapshot,
} from '../domain/activities';
import type {
  ActivityExternalEventLink,
  ActivitySnapshot,
} from '../domain/activities';
import type {
  FieldChange,
  JournalLifecycleState,
  JournalSyncState,
  JournalWorkspaceScope,
} from '../domain/journal';
import {
  deriveReportedCarbohydrates,
  parseCaptureMealInput,
  parseMealCarbohydrates,
  parseMealImageInput,
  validateMealSnapshot,
} from '../domain/meals';
import type {
  MealExternalEventLink,
  MealImageInput,
  MealImageSnapshot,
  MealImageSyncState,
  MealSnapshot,
} from '../domain/meals';
import type {ParseResult} from '../domain/validation';
import {parseRequiredString, parseStringArray} from '../domain/validation';
import type {
  ActivityConflictDetectedValues,
  ActivityConflictProposal,
  JournalDetectedFieldValue,
  MealConflictDetectedValues,
  MealConflictProposal,
} from '../domain/conflicts';
import type {JournalTombstone} from '../domain/tombstones';
import {
  JOURNAL_STATE_SCHEMA_VERSION,
  JournalEntityMetadata,
  JournalFieldConflictRecord,
  JournalOutboxOperation,
  JournalRevisionRecord,
  PersistedJournalState,
} from './types';
import {parseConflictExternalReference} from './conflictResolution';

export type JournalStateDecodeResult =
  | {readonly ok: true; readonly value: PersistedJournalState}
  | {readonly ok: false; readonly reason: string};

class DecodeFailure extends Error {}

type UnknownRecord = Readonly<Record<string, unknown>>;

const failure = (path: string, message: string): never => {
  throw new DecodeFailure(`${path}: ${message}`);
};

const recordAt = (value: unknown, path: string): UnknownRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failure(path, 'expected an object');
  }
  return value as UnknownRecord;
};

const arrayAt = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return failure(path, 'expected an array');
  }
  return value;
};

const stringAt = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failure(path, 'expected a non-empty string');
  }
  return value;
};

const booleanAt = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    return failure(path, 'expected a boolean');
  }
  return value;
};

const timestampAt = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return failure(path, 'expected a positive millisecond timestamp');
  }
  return value as number;
};

const finiteAt = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return failure(path, 'expected a finite number');
  }
  return value;
};

const optionalString = (value: unknown, path: string): string | undefined =>
  value === undefined ? undefined : stringAt(value, path);

const optionalTimestamp = (value: unknown, path: string): number | undefined =>
  value === undefined ? undefined : timestampAt(value, path);

const parsedAt = <T>(result: ParseResult<T>, path: string): T => {
  if (!result.ok) {
    return failure(
      path,
      result.issues.map(issue => issue.message).join('; ') || 'invalid value',
    );
  }
  return result.value;
};

const sameScope = (
  left: JournalWorkspaceScope,
  right: JournalWorkspaceScope,
): boolean =>
  left.productUserId === right.productUserId &&
  left.workspaceId === right.workspaceId &&
  left.nightscoutSourceId === right.nightscoutSourceId;

const decodeScope = (value: unknown, path: string): JournalWorkspaceScope => {
  const object = recordAt(value, path);
  return {
    productUserId: parsedAt(
      parseProductUserId(object.productUserId),
      `${path}.productUserId`,
    ),
    workspaceId: parsedAt(
      parseWorkspaceId(object.workspaceId),
      `${path}.workspaceId`,
    ),
    nightscoutSourceId: parsedAt(
      parseNightscoutSourceId(object.nightscoutSourceId),
      `${path}.nightscoutSourceId`,
    ),
  };
};

const decodeRevision = (value: unknown, path: string): Revision => {
  const revision = parsedAt(parseRevision(value), path);
  return revision > 0
    ? revision
    : failure(path, 'stored entity revisions start at one');
};

const decodeLifecycle = (
  value: unknown,
  path: string,
): JournalLifecycleState => {
  const object = recordAt(value, path);
  if (object.kind === 'active') {
    return {kind: 'active'};
  }
  if (object.kind === 'trashed') {
    const trashedAt = timestampAt(object.trashedAt, `${path}.trashedAt`);
    const purgeAfter = timestampAt(object.purgeAfter, `${path}.purgeAfter`);
    if (purgeAfter <= trashedAt) {
      return failure(`${path}.purgeAfter`, 'must be after trashedAt');
    }
    return {kind: 'trashed', trashedAt, purgeAfter};
  }
  return failure(`${path}.kind`, 'unknown lifecycle state');
};

const decodeSyncState = (value: unknown, path: string): JournalSyncState => {
  const object = recordAt(value, path);
  switch (object.kind) {
    case 'local_only':
      return {kind: 'local_only'};
    case 'pending': {
      const operationCount = finiteAt(
        object.operationCount,
        `${path}.operationCount`,
      );
      if (!Number.isSafeInteger(operationCount) || operationCount < 1) {
        return failure(`${path}.operationCount`, 'must be a positive integer');
      }
      return {
        kind: 'pending',
        queuedAt: timestampAt(object.queuedAt, `${path}.queuedAt`),
        operationCount,
      };
    }
    case 'syncing':
      return {
        kind: 'syncing',
        startedAt: timestampAt(object.startedAt, `${path}.startedAt`),
      };
    case 'synced':
      return {
        kind: 'synced',
        syncedAt: timestampAt(object.syncedAt, `${path}.syncedAt`),
        syncedRevision: decodeRevision(
          object.syncedRevision,
          `${path}.syncedRevision`,
        ),
      };
    case 'failed': {
      const code = stringAt(object.code, `${path}.code`);
      if (
        code !== 'journal.sync.network' &&
        code !== 'journal.sync.permission' &&
        code !== 'journal.sync.storage' &&
        code !== 'journal.sync.remote_rejected' &&
        code !== 'journal.sync.unknown'
      ) {
        return failure(`${path}.code`, 'unknown sync failure code');
      }
      return {
        kind: 'failed',
        failedAt: timestampAt(object.failedAt, `${path}.failedAt`),
        code,
        retryable: booleanAt(object.retryable, `${path}.retryable`),
        message: stringAt(object.message, `${path}.message`),
      };
    }
    case 'conflict':
      return {
        kind: 'conflict',
        detectedAt: timestampAt(object.detectedAt, `${path}.detectedAt`),
        conflictingFields: decodeStringArray(
          object.conflictingFields,
          `${path}.conflictingFields`,
        ),
      };
    default:
      return failure(`${path}.kind`, 'unknown sync state');
  }
};

const decodeStringArray = (value: unknown, path: string): readonly string[] => {
  const items = arrayAt(value, path).map((item, index) =>
    stringAt(item, `${path}[${index}]`),
  );
  if (new Set(items).size !== items.length) {
    return failure(path, 'contains duplicate values');
  }
  return items;
};

const decodeReference = (
  value: unknown,
  path: string,
): ExternalRecordReference => {
  const object = recordAt(value, path);
  const identifiersObject = recordAt(object.identifiers, `${path}.identifiers`);
  const identifiers = {
    ...(identifiersObject._id === undefined
      ? {}
      : {_id: stringAt(identifiersObject._id, `${path}.identifiers._id`)}),
    ...(identifiersObject.identifier === undefined
      ? {}
      : {
          identifier: stringAt(
            identifiersObject.identifier,
            `${path}.identifiers.identifier`,
          ),
        }),
    ...(identifiersObject.syncIdentifier === undefined
      ? {}
      : {
          syncIdentifier: stringAt(
            identifiersObject.syncIdentifier,
            `${path}.identifiers.syncIdentifier`,
          ),
        }),
  };
  if (Object.keys(identifiers).length === 0) {
    return failure(`${path}.identifiers`, 'needs a stable external identity');
  }
  return {
    nightscoutSourceId: parsedAt(
      parseNightscoutSourceId(object.nightscoutSourceId),
      `${path}.nightscoutSourceId`,
    ),
    recordKey: parsedAt(
      parseExternalRecordKey(object.recordKey),
      `${path}.recordKey`,
    ),
    identifiers,
  };
};

const decodeActivityExternalSnapshot = (
  value: unknown,
  path: string,
): ExternalActivityRecordSnapshot => {
  const object = recordAt(value, path);
  if (object.kind !== 'activity') {
    return failure(`${path}.kind`, 'expected activity');
  }
  const startedAt = timestampAt(object.startedAt, `${path}.startedAt`);
  const endedAt = optionalTimestamp(object.endedAt, `${path}.endedAt`);
  if (endedAt !== undefined && endedAt < startedAt) {
    return failure(`${path}.endedAt`, 'cannot precede startedAt');
  }
  const eventType = optionalString(object.eventType, `${path}.eventType`);
  const enteredBy = optionalString(object.enteredBy, `${path}.enteredBy`);
  return {
    kind: 'activity',
    startedAt,
    ...(endedAt === undefined ? {} : {endedAt}),
    ...(eventType === undefined ? {} : {eventType}),
    ...(enteredBy === undefined ? {} : {enteredBy}),
  };
};

const decodeAvailability = <TSnapshot>(
  value: unknown,
  path: string,
  decodeSnapshot: (candidate: unknown, candidatePath: string) => TSnapshot,
): ExternalRecordAvailability<TSnapshot> => {
  const object = recordAt(value, path);
  const checkedAt = timestampAt(object.checkedAt, `${path}.checkedAt`);
  if (object.kind === 'available') {
    return {
      kind: 'available',
      checkedAt,
      snapshot: decodeSnapshot(object.snapshot, `${path}.snapshot`),
    };
  }
  if (object.kind === 'unavailable') {
    const reason = object.reason;
    if (
      reason !== 'deleted' &&
      reason !== 'not_found' &&
      reason !== 'source_unavailable' &&
      reason !== 'unknown'
    ) {
      return failure(`${path}.reason`, 'unknown availability reason');
    }
    const lastKnown =
      object.lastKnown === undefined
        ? undefined
        : decodeSnapshot(object.lastKnown, `${path}.lastKnown`);
    return {
      kind: 'unavailable',
      checkedAt,
      reason,
      ...(lastKnown === undefined ? {} : {lastKnown}),
    };
  }
  return failure(`${path}.kind`, 'unknown external availability');
};

const decodeSupportingRole = (
  value: unknown,
  path: string,
): SupportingTreatmentRole => {
  const object = recordAt(value, path);
  if (object.kind !== 'supporting_treatment') {
    return failure(`${path}.kind`, 'expected supporting_treatment');
  }
  if (
    object.purpose !== 'bolus' &&
    object.purpose !== 'correction' &&
    object.purpose !== 'other'
  ) {
    return failure(`${path}.purpose`, 'unknown supporting treatment purpose');
  }
  return {kind: 'supporting_treatment', purpose: object.purpose};
};

const decodeMealLink = (
  value: unknown,
  path: string,
): MealExternalEventLink => {
  const object = recordAt(value, path);
  const roleObject = recordAt(object.role, `${path}.role`);
  const common = {
    record: decodeReference(object.record, `${path}.record`),
    linkedAt: timestampAt(object.linkedAt, `${path}.linkedAt`),
  };

  if (roleObject.kind === 'reported_carbohydrate') {
    if (
      roleObject.purpose !== 'meal' &&
      roleObject.purpose !== 'low_treatment' &&
      roleObject.purpose !== 'unknown'
    ) {
      return failure(`${path}.role.purpose`, 'unknown carbohydrate purpose');
    }
    const role: ReportedCarbohydrateRole = {
      kind: 'reported_carbohydrate',
      purpose: roleObject.purpose,
    };
    return {
      ...common,
      role,
      external: decodeAvailability(
        object.external,
        `${path}.external`,
        (candidate, candidatePath) =>
          parsedAt(parseExternalCarbRecordSnapshot(candidate), candidatePath),
      ),
    };
  }

  const role = decodeSupportingRole(roleObject, `${path}.role`);
  return {
    ...common,
    role,
    external: decodeAvailability(
      object.external,
      `${path}.external`,
      (candidate, candidatePath) =>
        parsedAt(
          parseExternalTreatmentRecordSnapshot(candidate),
          candidatePath,
        ),
    ),
  };
};

const decodeActivityLink = (
  value: unknown,
  path: string,
): ActivityExternalEventLink => {
  const object = recordAt(value, path);
  const roleObject = recordAt(object.role, `${path}.role`);
  const common = {
    record: decodeReference(object.record, `${path}.record`),
    linkedAt: timestampAt(object.linkedAt, `${path}.linkedAt`),
  };
  if (roleObject.kind === 'activity') {
    return {
      ...common,
      role: {kind: 'activity'},
      external: decodeAvailability(
        object.external,
        `${path}.external`,
        decodeActivityExternalSnapshot,
      ),
    };
  }
  const role = decodeSupportingRole(roleObject, `${path}.role`);
  return {
    ...common,
    role,
    external: decodeAvailability<ExternalTreatmentRecordSnapshot>(
      object.external,
      `${path}.external`,
      (candidate, candidatePath) =>
        parsedAt(
          parseExternalTreatmentRecordSnapshot(candidate),
          candidatePath,
        ),
    ),
  };
};

const decodeImageSync = (value: unknown, path: string): MealImageSyncState => {
  const object = recordAt(value, path);
  switch (object.kind) {
    case 'local_only':
      return {
        kind: 'local_only',
        localUri: stringAt(object.localUri, `${path}.localUri`),
      };
    case 'upload_pending': {
      const pendingObjectName = optionalString(
        object.objectName,
        `${path}.objectName`,
      );
      return {
        kind: 'upload_pending',
        localUri: stringAt(object.localUri, `${path}.localUri`),
        ...(pendingObjectName === undefined
          ? {}
          : {objectName: pendingObjectName}),
      };
    }
    case 'available': {
      const localUri = optionalString(object.localUri, `${path}.localUri`);
      const objectName = optionalString(
        object.objectName,
        `${path}.objectName`,
      );
      const objectPath = optionalString(
        object.objectPath,
        `${path}.objectPath`,
      );
      return {
        kind: 'available',
        ...(localUri === undefined ? {} : {localUri}),
        ...(objectName === undefined ? {} : {objectName}),
        ...(objectPath === undefined ? {} : {objectPath}),
        displayUri: stringAt(object.displayUri, `${path}.displayUri`),
        thumbnailUri: stringAt(object.thumbnailUri, `${path}.thumbnailUri`),
      };
    }
    case 'failed': {
      const failedObjectName = optionalString(
        object.objectName,
        `${path}.objectName`,
      );
      return {
        kind: 'failed',
        localUri: stringAt(object.localUri, `${path}.localUri`),
        ...(failedObjectName === undefined
          ? {}
          : {objectName: failedObjectName}),
        message: stringAt(object.message, `${path}.message`),
        retryable: booleanAt(object.retryable, `${path}.retryable`),
      };
    }
    default:
      return failure(`${path}.kind`, 'unknown image sync state');
  }
};

const optionalPositiveInteger = (
  value: unknown,
  path: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return failure(path, 'expected a positive integer');
  }
  return value as number;
};

const decodeImage = (value: unknown, path: string): MealImageSnapshot => {
  const object = recordAt(value, path);
  const mimeType = stringAt(object.mimeType, `${path}.mimeType`);
  if (!mimeType.toLocaleLowerCase().startsWith('image/')) {
    return failure(`${path}.mimeType`, 'expected an image MIME type');
  }
  const fileName = optionalString(object.fileName, `${path}.fileName`);
  const byteSize = optionalPositiveInteger(object.byteSize, `${path}.byteSize`);
  const widthPx = optionalPositiveInteger(object.widthPx, `${path}.widthPx`);
  const heightPx = optionalPositiveInteger(object.heightPx, `${path}.heightPx`);
  return {
    mimeType,
    ...(fileName === undefined ? {} : {fileName}),
    ...(byteSize === undefined ? {} : {byteSize}),
    ...(widthPx === undefined ? {} : {widthPx}),
    ...(heightPx === undefined ? {} : {heightPx}),
    syncState: decodeImageSync(object.syncState, `${path}.syncState`),
  };
};

const imageAsInput = (image: MealImageSnapshot): MealImageInput => {
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

interface DecodedBase<TId> {
  readonly id: TId;
  readonly revision: Revision;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lifecycle: JournalLifecycleState;
  readonly syncState: JournalSyncState;
}

const decodeBase = <TId extends MealEntryId | ActivityEntryId>(
  object: UnknownRecord,
  path: string,
  expectedScope: JournalWorkspaceScope,
  parseId: (value: unknown) => ParseResult<TId>,
): DecodedBase<TId> => {
  const entityScope = decodeScope(object.scope, `${path}.scope`);
  if (!sameScope(entityScope, expectedScope)) {
    return failure(`${path}.scope`, 'does not match the storage scope');
  }
  const createdAt = timestampAt(object.createdAt, `${path}.createdAt`);
  const updatedAt = timestampAt(object.updatedAt, `${path}.updatedAt`);
  if (updatedAt < createdAt) {
    return failure(`${path}.updatedAt`, 'cannot precede createdAt');
  }
  return {
    id: parsedAt(parseId(object.id), `${path}.id`),
    revision: decodeRevision(object.revision, `${path}.revision`),
    createdAt,
    updatedAt,
    lifecycle: decodeLifecycle(object.lifecycle, `${path}.lifecycle`),
    syncState: decodeSyncState(object.syncState, `${path}.syncState`),
  };
};

const decodeMeal = (
  value: unknown,
  path: string,
  scope: JournalWorkspaceScope,
): MealSnapshot => {
  const object = recordAt(value, path);
  if (object.kind !== 'meal') {
    return failure(`${path}.kind`, 'expected meal');
  }
  const base = decodeBase(object, path, scope, parseMealEntryId);
  const image =
    object.image === undefined
      ? undefined
      : decodeImage(object.image, `${path}.image`);
  const normalized = parsedAt(
    parseCaptureMealInput({
      mealStart: object.mealStart,
      name: object.name,
      mealCarbohydrates: object.mealCarbohydrates,
      ...(image === undefined ? {} : {image: imageAsInput(image)}),
      notes: object.notes,
      tags: object.tags,
    }),
    path,
  );
  const externalLinks = arrayAt(
    object.externalLinks,
    `${path}.externalLinks`,
  ).map((link, index) =>
    decodeMealLink(link, `${path}.externalLinks[${index}]`),
  );
  const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
  const meal: MealSnapshot = {
    kind: 'meal',
    ...base,
    scope,
    mealStart: normalized.mealStart,
    ...(normalized.name === undefined ? {} : {name: normalized.name}),
    ...(normalized.mealCarbohydrates === undefined
      ? {}
      : {mealCarbohydrates: normalized.mealCarbohydrates}),
    ...(image === undefined ? {} : {image}),
    ...(normalized.notes === undefined ? {} : {notes: normalized.notes}),
    tags: normalized.tags,
    externalLinks,
    ...(reportedCarbohydrates === undefined ? {} : {reportedCarbohydrates}),
  };
  const issues = validateMealSnapshot(meal);
  if (issues.length > 0) {
    return failure(path, issues.map(issue => issue.message).join('; '));
  }
  return meal;
};

const decodeActivity = (
  value: unknown,
  path: string,
  scope: JournalWorkspaceScope,
): ActivitySnapshot => {
  const object = recordAt(value, path);
  if (object.kind !== 'activity') {
    return failure(`${path}.kind`, 'expected activity');
  }
  const base = decodeBase(object, path, scope, parseActivityEntryId);
  const normalized = parsedAt(
    parseCaptureActivityInput({
      category: object.category,
      customName: object.customName,
      startedAt: object.startedAt,
      endedAt: object.endedAt,
      intensity: object.intensity,
      notes: object.notes,
      tags: object.tags,
    }),
    path,
  );
  const externalLinks = arrayAt(
    object.externalLinks,
    `${path}.externalLinks`,
  ).map((link, index) =>
    decodeActivityLink(link, `${path}.externalLinks[${index}]`),
  );
  const activity: ActivitySnapshot = {
    kind: 'activity',
    ...base,
    scope,
    category: normalized.category,
    ...(normalized.customName === undefined
      ? {}
      : {customName: normalized.customName}),
    startedAt: normalized.startedAt,
    ...(normalized.endedAt === undefined ? {} : {endedAt: normalized.endedAt}),
    ...(normalized.intensity === undefined
      ? {}
      : {intensity: normalized.intensity}),
    ...(normalized.notes === undefined ? {} : {notes: normalized.notes}),
    tags: normalized.tags,
    externalLinks,
  };
  const issues = validateActivitySnapshot(activity);
  if (issues.length > 0) {
    return failure(path, issues.map(issue => issue.message).join('; '));
  }
  return activity;
};

const decodeOutboxOperation = (
  value: unknown,
  path: string,
): JournalOutboxOperation => {
  const object = recordAt(value, path);
  if (object.kind !== 'upsert' && object.kind !== 'purge') {
    return failure(`${path}.kind`, 'unknown Journal operation kind');
  }
  if (object.entityKind !== 'meal' && object.entityKind !== 'activity') {
    return failure(`${path}.entityKind`, 'unknown entity kind');
  }
  const entityKind: 'meal' | 'activity' = object.entityKind;
  const entityId =
    entityKind === 'meal'
      ? parsedAt(parseMealEntryId(object.entityId), `${path}.entityId`)
      : parsedAt(parseActivityEntryId(object.entityId), `${path}.entityId`);
  const baseRevision =
    object.baseRevision === null
      ? null
      : decodeRevision(object.baseRevision, `${path}.baseRevision`);
  const changedFields = decodeStringArray(
    object.changedFields,
    `${path}.changedFields`,
  );
  if (changedFields.length === 0) {
    return failure(`${path}.changedFields`, 'cannot be empty');
  }
  const common = {
    operationId: stringAt(object.operationId, `${path}.operationId`),
    entityKind,
    entityId,
    localRevision: decodeRevision(
      object.localRevision,
      `${path}.localRevision`,
    ),
    queuedAt: timestampAt(object.queuedAt, `${path}.queuedAt`),
  };
  if (object.kind === 'purge') {
    if (changedFields.length !== 1 || changedFields[0] !== 'purge') {
      return failure(`${path}.changedFields`, 'a purge changes only purge');
    }
    return {
      ...common,
      kind: 'purge',
      baseRevision,
      changedFields: ['purge'],
    };
  }
  if (changedFields.includes('purge')) {
    return failure(`${path}.changedFields`, 'upserts cannot contain purge');
  }
  return {
    ...common,
    kind: 'upsert',
    baseRevision,
    changedFields,
  };
};

const assertKnownKeys = (
  object: UnknownRecord,
  keys: readonly string[],
  path: string,
): void => {
  Object.keys(object).forEach(key => {
    if (!keys.includes(key)) {
      failure(`${path}.${key}`, 'unknown field');
    }
  });
};

const decodeFieldChange = <T>(
  value: unknown,
  path: string,
  decodeSet: (candidate: unknown, candidatePath: string) => T,
): FieldChange<T> => {
  const object = recordAt(value, path);
  if (object.kind === 'clear') {
    assertKnownKeys(object, ['kind'], path);
    return {kind: 'clear'};
  }
  if (object.kind === 'set') {
    assertKnownKeys(object, ['kind', 'value'], path);
    if (!Object.prototype.hasOwnProperty.call(object, 'value')) {
      return failure(`${path}.value`, 'is required');
    }
    return {
      kind: 'set',
      value: decodeSet(object.value, `${path}.value`),
    };
  }
  return failure(`${path}.kind`, 'expected set or clear');
};

const decodeText = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    return failure(path, 'expected a string');
  }
  return value;
};

const decodeMealRevisionProposal = (
  value: unknown,
  path: string,
): MealConflictProposal => {
  const changesObject = recordAt(value, path);
  const allowed = [
    'mealStart',
    'name',
    'mealCarbohydrates',
    'image',
    'notes',
    'tags',
  ] as const;
  assertKnownKeys(changesObject, allowed, path);
  if (Object.keys(changesObject).length === 0) {
    return failure(path, 'cannot be empty');
  }
  const changes: Record<string, unknown> = {};
  Object.keys(changesObject).forEach(field => {
    switch (field) {
      case 'mealStart':
        changes.mealStart = decodeFieldChange(
          changesObject.mealStart,
          `${path}.mealStart`,
          timestampAt,
        );
        break;
      case 'name':
        changes.name = decodeFieldChange(
          changesObject.name,
          `${path}.name`,
          (candidate, candidatePath) =>
            parsedAt(parseRequiredString(candidate, []), candidatePath),
        );
        break;
      case 'mealCarbohydrates':
        changes.mealCarbohydrates = decodeFieldChange(
          changesObject.mealCarbohydrates,
          `${path}.mealCarbohydrates`,
          (candidate, candidatePath) =>
            parsedAt(parseMealCarbohydrates(candidate), candidatePath),
        );
        break;
      case 'image':
        changes.image = decodeFieldChange(
          changesObject.image,
          `${path}.image`,
          (candidate, candidatePath) =>
            parsedAt(parseMealImageInput(candidate), candidatePath),
        );
        break;
      case 'notes':
        changes.notes = decodeFieldChange(
          changesObject.notes,
          `${path}.notes`,
          decodeText,
        );
        break;
      case 'tags':
        changes.tags = decodeFieldChange(
          changesObject.tags,
          `${path}.tags`,
          (candidate, candidatePath) =>
            parsedAt(parseStringArray(candidate, []), candidatePath),
        );
        break;
    }
  });
  return {kind: 'meal_revision', changes} as MealConflictProposal;
};

const decodeActivityRevisionProposal = (
  value: unknown,
  path: string,
): ActivityConflictProposal => {
  const changesObject = recordAt(value, path);
  const allowed = [
    'category',
    'customName',
    'startedAt',
    'endedAt',
    'intensity',
    'notes',
    'tags',
  ] as const;
  assertKnownKeys(changesObject, allowed, path);
  if (Object.keys(changesObject).length === 0) {
    return failure(path, 'cannot be empty');
  }
  const changes: Record<string, unknown> = {};
  Object.keys(changesObject).forEach(field => {
    switch (field) {
      case 'category':
        changes.category = decodeFieldChange(
          changesObject.category,
          `${path}.category`,
          (candidate, candidatePath) =>
            parsedAt(parseActivityCategory(candidate), candidatePath),
        );
        break;
      case 'customName':
        changes.customName = decodeFieldChange(
          changesObject.customName,
          `${path}.customName`,
          (candidate, candidatePath) =>
            parsedAt(parseRequiredString(candidate, []), candidatePath),
        );
        break;
      case 'startedAt':
        changes.startedAt = decodeFieldChange(
          changesObject.startedAt,
          `${path}.startedAt`,
          timestampAt,
        );
        break;
      case 'endedAt':
        changes.endedAt = decodeFieldChange(
          changesObject.endedAt,
          `${path}.endedAt`,
          timestampAt,
        );
        break;
      case 'intensity':
        changes.intensity = decodeFieldChange(
          changesObject.intensity,
          `${path}.intensity`,
          (candidate, candidatePath) => {
            const intensity = parsedAt(
              parseActivityIntensity(candidate),
              candidatePath,
            );
            return intensity ?? failure(candidatePath, 'is required');
          },
        );
        break;
      case 'notes':
        changes.notes = decodeFieldChange(
          changesObject.notes,
          `${path}.notes`,
          decodeText,
        );
        break;
      case 'tags':
        changes.tags = decodeFieldChange(
          changesObject.tags,
          `${path}.tags`,
          (candidate, candidatePath) =>
            parsedAt(parseStringArray(candidate, []), candidatePath),
        );
        break;
    }
  });
  return {kind: 'activity_revision', changes} as ActivityConflictProposal;
};

const decodeMealConflictProposal = (
  value: unknown,
  path: string,
  expectedSource: NightscoutSourceId,
): MealConflictProposal => {
  const object = recordAt(value, path);
  switch (object.kind) {
    case 'meal_revision':
      assertKnownKeys(object, ['kind', 'changes'], path);
      return decodeMealRevisionProposal(object.changes, `${path}.changes`);
    case 'meal_link_external_event': {
      assertKnownKeys(object, ['kind', 'record', 'snapshot', 'role'], path);
      const record = parsedAt(
        parseConflictExternalReference(object.record, expectedSource),
        `${path}.record`,
      );
      const snapshotObject = recordAt(object.snapshot, `${path}.snapshot`);
      if (snapshotObject.kind === 'carbohydrate') {
        const roleObject = recordAt(object.role, `${path}.role`);
        if (
          roleObject.kind !== 'reported_carbohydrate' ||
          (roleObject.purpose !== 'meal' &&
            roleObject.purpose !== 'low_treatment' &&
            roleObject.purpose !== 'unknown')
        ) {
          return failure(`${path}.role`, 'does not match the snapshot');
        }
        return {
          kind: 'meal_link_external_event',
          record,
          snapshot: parsedAt(
            parseExternalCarbRecordSnapshot(object.snapshot),
            `${path}.snapshot`,
          ),
          role: {
            kind: 'reported_carbohydrate',
            purpose: roleObject.purpose,
          },
        };
      }
      return {
        kind: 'meal_link_external_event',
        record,
        snapshot: parsedAt(
          parseExternalTreatmentRecordSnapshot(object.snapshot),
          `${path}.snapshot`,
        ),
        role: decodeSupportingRole(object.role, `${path}.role`),
      };
    }
    case 'meal_unlink_external_event':
      assertKnownKeys(object, ['kind', 'record'], path);
      return {
        kind: 'meal_unlink_external_event',
        record: parsedAt(
          parseConflictExternalReference(object.record, expectedSource),
          `${path}.record`,
        ),
      };
    case 'meal_external_links':
      assertKnownKeys(object, ['kind', 'externalLinks'], path);
      return {
        kind: 'meal_external_links',
        externalLinks: arrayAt(
          object.externalLinks,
          `${path}.externalLinks`,
        ).map((link, index) =>
          decodeMealLink(link, `${path}.externalLinks[${index}]`),
        ),
      };
    case 'meal_lifecycle':
      assertKnownKeys(object, ['kind', 'lifecycle'], path);
      if (object.lifecycle !== 'active' && object.lifecycle !== 'trashed') {
        return failure(`${path}.lifecycle`, 'unknown lifecycle target');
      }
      return {kind: 'meal_lifecycle', lifecycle: object.lifecycle};
    default:
      return failure(`${path}.kind`, 'unknown meal conflict proposal');
  }
};

const decodeActivityConflictProposal = (
  value: unknown,
  path: string,
  expectedSource: NightscoutSourceId,
): ActivityConflictProposal => {
  const object = recordAt(value, path);
  switch (object.kind) {
    case 'activity_revision':
      assertKnownKeys(object, ['kind', 'changes'], path);
      return decodeActivityRevisionProposal(object.changes, `${path}.changes`);
    case 'activity_link_external_event': {
      assertKnownKeys(object, ['kind', 'record', 'snapshot', 'role'], path);
      const record = parsedAt(
        parseConflictExternalReference(object.record, expectedSource),
        `${path}.record`,
      );
      const snapshotObject = recordAt(object.snapshot, `${path}.snapshot`);
      if (snapshotObject.kind === 'activity') {
        const roleObject = recordAt(object.role, `${path}.role`);
        if (roleObject.kind !== 'activity') {
          return failure(`${path}.role`, 'does not match the snapshot');
        }
        return {
          kind: 'activity_link_external_event',
          record,
          snapshot: parsedAt(
            parseExternalActivityRecordSnapshot(object.snapshot),
            `${path}.snapshot`,
          ),
          role: {kind: 'activity'},
        };
      }
      return {
        kind: 'activity_link_external_event',
        record,
        snapshot: parsedAt(
          parseExternalTreatmentRecordSnapshot(object.snapshot),
          `${path}.snapshot`,
        ),
        role: decodeSupportingRole(object.role, `${path}.role`),
      };
    }
    case 'activity_unlink_external_event':
      assertKnownKeys(object, ['kind', 'record'], path);
      return {
        kind: 'activity_unlink_external_event',
        record: parsedAt(
          parseConflictExternalReference(object.record, expectedSource),
          `${path}.record`,
        ),
      };
    case 'activity_external_links':
      assertKnownKeys(object, ['kind', 'externalLinks'], path);
      return {
        kind: 'activity_external_links',
        externalLinks: arrayAt(
          object.externalLinks,
          `${path}.externalLinks`,
        ).map((link, index) =>
          decodeActivityLink(link, `${path}.externalLinks[${index}]`),
        ),
      };
    case 'activity_lifecycle':
      assertKnownKeys(object, ['kind', 'lifecycle'], path);
      if (object.lifecycle !== 'active' && object.lifecycle !== 'trashed') {
        return failure(`${path}.lifecycle`, 'unknown lifecycle target');
      }
      return {kind: 'activity_lifecycle', lifecycle: object.lifecycle};
    default:
      return failure(`${path}.kind`, 'unknown activity conflict proposal');
  }
};

const decodeDetectedFieldValue = <T>(
  value: unknown,
  path: string,
  decodePresent: (candidate: unknown, candidatePath: string) => T,
): JournalDetectedFieldValue<T> => {
  const object = recordAt(value, path);
  if (object.kind === 'absent') {
    assertKnownKeys(object, ['kind'], path);
    return {kind: 'absent'};
  }
  if (object.kind === 'present') {
    assertKnownKeys(object, ['kind', 'value'], path);
    if (!Object.prototype.hasOwnProperty.call(object, 'value')) {
      return failure(`${path}.value`, 'is required');
    }
    return {
      kind: 'present',
      value: decodePresent(object.value, `${path}.value`),
    };
  }
  return failure(`${path}.kind`, 'expected present or absent');
};

const decodeMealDetectedValues = (
  value: unknown,
  conflictingFields: readonly string[],
  path: string,
): MealConflictDetectedValues => {
  const object = recordAt(value, path);
  const allowed = [
    'mealStart',
    'name',
    'mealCarbohydrates',
    'image',
    'notes',
    'tags',
    'externalLinks',
    'lifecycle',
  ];
  assertKnownKeys(object, allowed, path);
  const output: Record<string, unknown> = {};
  Object.keys(object).forEach(field => {
    switch (field) {
      case 'mealStart':
        output.mealStart = decodeDetectedFieldValue(
          object.mealStart,
          `${path}.mealStart`,
          timestampAt,
        );
        break;
      case 'name':
        output.name = decodeDetectedFieldValue(
          object.name,
          `${path}.name`,
          (candidate, candidatePath) =>
            parsedAt(parseRequiredString(candidate, []), candidatePath),
        );
        break;
      case 'mealCarbohydrates':
        output.mealCarbohydrates = decodeDetectedFieldValue(
          object.mealCarbohydrates,
          `${path}.mealCarbohydrates`,
          (candidate, candidatePath) =>
            parsedAt(parseMealCarbohydrates(candidate), candidatePath),
        );
        break;
      case 'image':
        output.image = decodeDetectedFieldValue(
          object.image,
          `${path}.image`,
          decodeImage,
        );
        break;
      case 'notes':
        output.notes = decodeDetectedFieldValue(
          object.notes,
          `${path}.notes`,
          decodeText,
        );
        break;
      case 'tags':
        output.tags = decodeDetectedFieldValue(
          object.tags,
          `${path}.tags`,
          (candidate, candidatePath) =>
            parsedAt(parseStringArray(candidate, []), candidatePath),
        );
        break;
      case 'externalLinks':
        output.externalLinks = decodeDetectedFieldValue(
          object.externalLinks,
          `${path}.externalLinks`,
          (candidate, candidatePath) =>
            arrayAt(candidate, candidatePath).map((link, index) =>
              decodeMealLink(link, `${candidatePath}[${index}]`),
            ),
        );
        break;
      case 'lifecycle':
        output.lifecycle = decodeDetectedFieldValue(
          object.lifecycle,
          `${path}.lifecycle`,
          decodeLifecycle,
        );
        break;
    }
  });
  conflictingFields.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(output, field)) {
      failure(`${path}.${field}`, 'is required for a conflicting field');
    }
  });
  return output as MealConflictDetectedValues;
};

const decodeActivityDetectedValues = (
  value: unknown,
  conflictingFields: readonly string[],
  path: string,
): ActivityConflictDetectedValues => {
  const object = recordAt(value, path);
  const allowed = [
    'category',
    'customName',
    'startedAt',
    'endedAt',
    'intensity',
    'notes',
    'tags',
    'externalLinks',
    'lifecycle',
  ];
  assertKnownKeys(object, allowed, path);
  const output: Record<string, unknown> = {};
  Object.keys(object).forEach(field => {
    switch (field) {
      case 'category':
        output.category = decodeDetectedFieldValue(
          object.category,
          `${path}.category`,
          (candidate, candidatePath) =>
            parsedAt(parseActivityCategory(candidate), candidatePath),
        );
        break;
      case 'customName':
        output.customName = decodeDetectedFieldValue(
          object.customName,
          `${path}.customName`,
          (candidate, candidatePath) =>
            parsedAt(parseRequiredString(candidate, []), candidatePath),
        );
        break;
      case 'startedAt':
        output.startedAt = decodeDetectedFieldValue(
          object.startedAt,
          `${path}.startedAt`,
          timestampAt,
        );
        break;
      case 'endedAt':
        output.endedAt = decodeDetectedFieldValue(
          object.endedAt,
          `${path}.endedAt`,
          timestampAt,
        );
        break;
      case 'intensity':
        output.intensity = decodeDetectedFieldValue(
          object.intensity,
          `${path}.intensity`,
          (candidate, candidatePath) => {
            const intensity = parsedAt(
              parseActivityIntensity(candidate),
              candidatePath,
            );
            return intensity ?? failure(candidatePath, 'is required');
          },
        );
        break;
      case 'notes':
        output.notes = decodeDetectedFieldValue(
          object.notes,
          `${path}.notes`,
          decodeText,
        );
        break;
      case 'tags':
        output.tags = decodeDetectedFieldValue(
          object.tags,
          `${path}.tags`,
          (candidate, candidatePath) =>
            parsedAt(parseStringArray(candidate, []), candidatePath),
        );
        break;
      case 'externalLinks':
        output.externalLinks = decodeDetectedFieldValue(
          object.externalLinks,
          `${path}.externalLinks`,
          (candidate, candidatePath) =>
            arrayAt(candidate, candidatePath).map((link, index) =>
              decodeActivityLink(link, `${candidatePath}[${index}]`),
            ),
        );
        break;
      case 'lifecycle':
        output.lifecycle = decodeDetectedFieldValue(
          object.lifecycle,
          `${path}.lifecycle`,
          decodeLifecycle,
        );
        break;
    }
  });
  conflictingFields.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(output, field)) {
      failure(`${path}.${field}`, 'is required for a conflicting field');
    }
  });
  return output as ActivityConflictDetectedValues;
};

const decodeRevisionRecord = (
  value: unknown,
  path: string,
): JournalRevisionRecord => {
  const object = recordAt(value, path);
  return {
    revision: decodeRevision(object.revision, `${path}.revision`),
    changedAt: timestampAt(object.changedAt, `${path}.changedAt`),
    changedFields: decodeStringArray(
      object.changedFields,
      `${path}.changedFields`,
    ),
  };
};

const decodeConflictRecord = (
  value: unknown,
  path: string,
  entity: MealSnapshot | ActivitySnapshot,
): JournalFieldConflictRecord => {
  const object = recordAt(value, path);
  assertKnownKeys(
    object,
    [
      'entityKind',
      'conflictId',
      'detectedAt',
      'expectedRevision',
      'detectedAgainstRevision',
      'conflictingFields',
      'proposal',
      'detectedValues',
    ],
    path,
  );
  const conflictingFields = decodeStringArray(
    object.conflictingFields,
    `${path}.conflictingFields`,
  );
  if (conflictingFields.length === 0) {
    failure(`${path}.conflictingFields`, 'cannot be empty');
  }
  if (object.entityKind !== entity.kind) {
    failure(`${path}.entityKind`, 'does not match its entity');
  }
  const common = {
    conflictId: parsedAt(
      parseJournalConflictId(object.conflictId),
      `${path}.conflictId`,
    ),
    detectedAt: timestampAt(object.detectedAt, `${path}.detectedAt`),
    expectedRevision: decodeRevision(
      object.expectedRevision,
      `${path}.expectedRevision`,
    ),
    detectedAgainstRevision: decodeRevision(
      object.detectedAgainstRevision,
      `${path}.detectedAgainstRevision`,
    ),
    conflictingFields,
  };
  if (common.detectedAgainstRevision > entity.revision) {
    failure(`${path}.detectedAgainstRevision`, 'is newer than its entity');
  }
  if (common.expectedRevision >= common.detectedAgainstRevision) {
    failure(
      `${path}.expectedRevision`,
      'must precede the revision where the conflict was detected',
    );
  }
  if (common.detectedAt > entity.updatedAt) {
    failure(`${path}.detectedAt`, 'cannot be newer than its entity');
  }
  return entity.kind === 'meal'
    ? {
        ...common,
        entityKind: 'meal',
        proposal: decodeMealConflictProposal(
          object.proposal,
          `${path}.proposal`,
          entity.scope.nightscoutSourceId,
        ),
        detectedValues: decodeMealDetectedValues(
          object.detectedValues,
          conflictingFields,
          `${path}.detectedValues`,
        ),
      }
    : {
        ...common,
        entityKind: 'activity',
        proposal: decodeActivityConflictProposal(
          object.proposal,
          `${path}.proposal`,
          entity.scope.nightscoutSourceId,
        ),
        detectedValues: decodeActivityDetectedValues(
          object.detectedValues,
          conflictingFields,
          `${path}.detectedValues`,
        ),
      };
};

const allEntityFields = (
  snapshot: MealSnapshot | ActivitySnapshot,
): readonly string[] =>
  snapshot.kind === 'meal'
    ? [
        'mealStart',
        'name',
        'mealCarbohydrates',
        'image',
        'notes',
        'tags',
        'externalLinks',
        'lifecycle',
      ]
    : [
        'category',
        'customName',
        'startedAt',
        'endedAt',
        'intensity',
        'notes',
        'tags',
        'externalLinks',
        'lifecycle',
      ];

const initialMetadataFor = (
  snapshot: MealSnapshot | ActivitySnapshot,
): JournalEntityMetadata => {
  const fieldRevisions = allEntityFields(snapshot).reduce<
    Record<string, Revision>
  >((output, field) => {
    output[field] = snapshot.revision;
    return output;
  }, {});
  return {
    entityKind: snapshot.kind,
    entityId: snapshot.id,
    fieldRevisions,
    recentRevisions: [],
    conflicts: [],
  };
};

const decodeMetadata = (
  value: unknown,
  path: string,
  entities: readonly (MealSnapshot | ActivitySnapshot)[],
): readonly JournalEntityMetadata[] => {
  if (value === undefined) {
    return entities.map(initialMetadataFor);
  }
  const metadata = arrayAt(value, path).map<JournalEntityMetadata>(
    (candidate, index) => {
      const itemPath = `${path}[${index}]`;
      const object = recordAt(candidate, itemPath);
      if (object.entityKind !== 'meal' && object.entityKind !== 'activity') {
        return failure(`${itemPath}.entityKind`, 'unknown entity kind');
      }
      const entityKind = object.entityKind;
      const entityId =
        entityKind === 'meal'
          ? parsedAt(parseMealEntryId(object.entityId), `${itemPath}.entityId`)
          : parsedAt(
              parseActivityEntryId(object.entityId),
              `${itemPath}.entityId`,
            );
      const entity = entities.find(
        item => item.kind === entityKind && item.id === entityId,
      );
      if (entity === undefined) {
        return failure(`${itemPath}.entityId`, 'does not exist locally');
      }
      const fieldRevisionObject = recordAt(
        object.fieldRevisions,
        `${itemPath}.fieldRevisions`,
      );
      const fieldRevisions: Record<string, Revision> = {};
      Object.entries(fieldRevisionObject).forEach(([field, rawRevision]) => {
        const revision = decodeRevision(
          rawRevision,
          `${itemPath}.fieldRevisions.${field}`,
        );
        if (revision > entity.revision) {
          failure(
            `${itemPath}.fieldRevisions.${field}`,
            'is newer than its entity',
          );
        }
        fieldRevisions[field] = revision;
      });
      const recentRevisions = arrayAt(
        object.recentRevisions,
        `${itemPath}.recentRevisions`,
      ).map((revision, revisionIndex) =>
        decodeRevisionRecord(
          revision,
          `${itemPath}.recentRevisions[${revisionIndex}]`,
        ),
      );
      if (recentRevisions.length > 12) {
        failure(`${itemPath}.recentRevisions`, 'exceeds the history limit');
      }
      recentRevisions.forEach((revision, revisionIndex) => {
        if (
          revision.revision > entity.revision ||
          (revisionIndex > 0 &&
            revision.revision <= recentRevisions[revisionIndex - 1]!.revision)
        ) {
          failure(
            `${itemPath}.recentRevisions[${revisionIndex}].revision`,
            'is not in causal order',
          );
        }
      });
      const conflicts = arrayAt(object.conflicts, `${itemPath}.conflicts`).map(
        (conflict, conflictIndex) =>
          decodeConflictRecord(
            conflict,
            `${itemPath}.conflicts[${conflictIndex}]`,
            entity,
          ),
      );
      if (
        new Set(conflicts.map(item => item.conflictId)).size !==
        conflicts.length
      ) {
        failure(`${itemPath}.conflicts`, 'contains duplicate conflict IDs');
      }
      return {
        entityKind,
        entityId,
        fieldRevisions,
        recentRevisions,
        conflicts,
      };
    },
  );
  if (metadata.length !== entities.length) {
    failure(path, 'must contain exactly one record per local entity');
  }
  return metadata;
};

const decodeTombstone = (value: unknown, path: string): JournalTombstone => {
  const object = recordAt(value, path);
  assertKnownKeys(
    object,
    ['kind', 'entityKind', 'entityId', 'purgedAt', 'revision'],
    path,
  );
  if (object.kind !== 'journal_tombstone') {
    return failure(`${path}.kind`, 'unknown tombstone kind');
  }
  const common = {
    kind: 'journal_tombstone' as const,
    purgedAt: timestampAt(object.purgedAt, `${path}.purgedAt`),
    revision: decodeRevision(object.revision, `${path}.revision`),
  };
  if (object.entityKind === 'meal') {
    return {
      ...common,
      entityKind: 'meal',
      entityId: parsedAt(parseMealEntryId(object.entityId), `${path}.entityId`),
    };
  }
  if (object.entityKind === 'activity') {
    return {
      ...common,
      entityKind: 'activity',
      entityId: parsedAt(
        parseActivityEntryId(object.entityId),
        `${path}.entityId`,
      ),
    };
  }
  return failure(`${path}.entityKind`, 'unknown entity kind');
};

const assertUniqueEntityIds = (
  meals: readonly MealSnapshot[],
  activities: readonly ActivitySnapshot[],
  tombstones: readonly JournalTombstone[],
): void => {
  const ids = [
    ...meals.map(meal => meal.id),
    ...activities.map(item => item.id),
    ...tombstones.map(item => item.entityId),
  ];
  if (new Set(ids).size !== ids.length) {
    failure('state', 'contains duplicate or reused entity IDs');
  }
};

const assertOutboxIntegrity = (
  outbox: readonly JournalOutboxOperation[],
  meals: readonly MealSnapshot[],
  activities: readonly ActivitySnapshot[],
  tombstones: readonly JournalTombstone[],
): void => {
  if (new Set(outbox.map(item => item.operationId)).size !== outbox.length) {
    failure('state.outbox', 'contains duplicate operation IDs');
  }
  outbox.forEach((operation, index) => {
    const entity =
      operation.entityKind === 'meal'
        ? meals.find(item => item.id === operation.entityId)
        : activities.find(item => item.id === operation.entityId);
    if (operation.kind === 'upsert') {
      const entityRevision = entity?.revision;
      if (entityRevision === undefined) {
        throw new DecodeFailure(
          `state.outbox[${index}].entityId: does not exist locally`,
        );
      }
      if (operation.localRevision > entityRevision) {
        failure(
          `state.outbox[${index}].localRevision`,
          'is newer than its local entity',
        );
      }
      return;
    }
    if (entity !== undefined) {
      failure(
        `state.outbox[${index}].entityId`,
        'a purged entity cannot still exist locally',
      );
    }
    const tombstone = tombstones.find(
      item =>
        item.entityKind === operation.entityKind &&
        item.entityId === operation.entityId,
    );
    if (tombstone === undefined) {
      throw new DecodeFailure(
        `state.outbox[${index}].entityId: has no tombstone`,
      );
    }
    if (
      operation.localRevision !== tombstone.revision ||
      operation.queuedAt !== tombstone.purgedAt ||
      (operation.baseRevision !== null &&
        operation.localRevision <= operation.baseRevision)
    ) {
      failure(`state.outbox[${index}]`, 'does not match its purge tombstone');
    }
    return;
  });
  const entityIds = [...new Set(outbox.map(item => item.entityId))];
  entityIds.forEach(entityId => {
    const operations = outbox.filter(item => item.entityId === entityId);
    if (operations.some(operation => operation.kind === 'purge')) {
      if (operations.length !== 1 || operations[0]?.kind !== 'purge') {
        failure(
          'state.outbox',
          `must compact ${entityId} to one purge operation`,
        );
      }
      return;
    }
    operations.forEach((operation, index) => {
      const previous = operations[index - 1];
      if (
        previous !== undefined &&
        (operation.baseRevision !== previous.localRevision ||
          operation.localRevision <= previous.localRevision ||
          operation.queuedAt < previous.queuedAt)
      ) {
        failure('state.outbox', `has a broken causal chain for ${entityId}`);
      }
      if (
        previous === undefined &&
        operation.baseRevision !== null &&
        operation.baseRevision >= operation.localRevision
      ) {
        failure('state.outbox', `has an invalid base revision for ${entityId}`);
      }
    });
  });
  tombstones.forEach(tombstone => {
    const purges = outbox.filter(
      operation =>
        operation.kind === 'purge' &&
        operation.entityKind === tombstone.entityKind &&
        operation.entityId === tombstone.entityId,
    );
    if (purges.length > 1) {
      failure(
        'state.tombstones',
        `has duplicate durable purge operations for ${tombstone.entityId}`,
      );
    }
  });
};

const assertSyncConsistency = (
  entities: readonly (MealSnapshot | ActivitySnapshot)[],
  outbox: readonly JournalOutboxOperation[],
  metadata: readonly JournalEntityMetadata[],
): void => {
  entities.forEach(entity => {
    const pending = outbox.filter(
      item => item.kind === 'upsert' && item.entityId === entity.id,
    );
    const entityMetadata = metadata.find(item => item.entityId === entity.id);
    if (entityMetadata === undefined) {
      throw new DecodeFailure(`state.metadata: is missing ${entity.id}`);
    }
    if (entityMetadata.conflicts.length > 0) {
      if (entity.syncState.kind !== 'conflict') {
        failure(
          'state.metadata',
          `has unresolved conflicts but ${entity.id} is not marked conflict`,
        );
      }
      return;
    }
    if (entity.syncState.kind === 'pending') {
      if (
        pending.length === 0 ||
        entity.syncState.operationCount !== pending.length ||
        entity.syncState.queuedAt !== pending[0]?.queuedAt
      ) {
        failure(
          'state.outbox',
          `does not match the pending sync state for ${entity.id}`,
        );
      }
    } else if (pending.length > 0 && entity.syncState.kind === 'synced') {
      failure(
        'state.outbox',
        `contains pending writes for synced entity ${entity.id}`,
      );
    }
  });
};

export const emptyJournalState = (
  scope: JournalWorkspaceScope,
): PersistedJournalState => ({
  schemaVersion: JOURNAL_STATE_SCHEMA_VERSION,
  scope,
  meals: [],
  activities: [],
  tombstones: [],
  remoteTombstones: [],
  outbox: [],
  metadata: [],
});

export const decodePersistedJournalState = (
  value: unknown,
  expectedScope: JournalWorkspaceScope,
): JournalStateDecodeResult => {
  try {
    const object = recordAt(value, 'state');
    if (object.schemaVersion !== JOURNAL_STATE_SCHEMA_VERSION) {
      return failure('state.schemaVersion', 'unsupported Journal schema');
    }
    const scope = decodeScope(object.scope, 'state.scope');
    if (!sameScope(scope, expectedScope)) {
      return failure('state.scope', 'does not match the requested scope');
    }
    const meals = arrayAt(object.meals, 'state.meals').map((meal, index) =>
      decodeMeal(meal, `state.meals[${index}]`, scope),
    );
    const activities = arrayAt(object.activities, 'state.activities').map(
      (activity, index) =>
        decodeActivity(activity, `state.activities[${index}]`, scope),
    );
    const tombstones = arrayAt(object.tombstones, 'state.tombstones').map(
      (tombstone, index) =>
        decodeTombstone(tombstone, `state.tombstones[${index}]`),
    );
    const remoteTombstones = (
      object.remoteTombstones === undefined
        ? []
        : arrayAt(object.remoteTombstones, 'state.remoteTombstones')
    ).map((tombstone, index) =>
      decodeTombstone(tombstone, `state.remoteTombstones[${index}]`),
    );
    const outbox = arrayAt(object.outbox, 'state.outbox').map(
      (operation, index) =>
        decodeOutboxOperation(operation, `state.outbox[${index}]`),
    );
    assertUniqueEntityIds(meals, activities, [
      ...tombstones,
      ...remoteTombstones,
    ]);
    assertOutboxIntegrity(outbox, meals, activities, tombstones);
    const metadata = decodeMetadata(object.metadata, 'state.metadata', [
      ...meals,
      ...activities,
    ]);
    assertSyncConsistency([...meals, ...activities], outbox, metadata);
    const remoteCursor =
      object.remoteCursor === undefined
        ? undefined
        : stringAt(object.remoteCursor, 'state.remoteCursor');
    return {
      ok: true,
      value: {
        schemaVersion: JOURNAL_STATE_SCHEMA_VERSION,
        scope,
        meals,
        activities,
        tombstones,
        remoteTombstones,
        outbox,
        metadata,
        ...(remoteCursor === undefined ? {} : {remoteCursor}),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof DecodeFailure
          ? error.message
          : 'state: unexpected decode failure',
    };
  }
};
