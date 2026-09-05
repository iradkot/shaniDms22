import {
  createExternalRecordKey,
  parseActivityEntryId,
  parseExternalRecordKey,
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../domain/identifiers';
import type {NightscoutSourceId, Revision} from '../domain/identifiers';
import type {JournalLifecycleState} from '../domain/journal';
import {
  invalid,
  issue,
  valid,
  VALIDATION_ISSUE_CODES,
} from '../domain/validation';
import type {
  ParseResult,
  ValidationIssueCode,
  ValidationPathSegment,
} from '../domain/validation';
import {
  JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
  type RemoteActivityDocument,
  type RemoteActivityExternalRole,
  type RemoteExternalEventLink,
  type RemoteExternalRecordIdentity,
  type RemoteJournalDocument,
  type RemoteJournalDocumentScope,
  type RemoteMealDocument,
  type RemoteMealExternalRole,
  type RemoteMealImageProjection,
} from './remoteDocumentTypes';

type UnknownRecord = Readonly<Record<string, unknown>>;

class RemoteDocumentDecodeFailure extends Error {
  constructor(
    readonly code: ValidationIssueCode,
    readonly path: readonly ValidationPathSegment[],
    message: string,
  ) {
    super(message);
  }
}

const fail = (
  path: readonly ValidationPathSegment[],
  message: string,
  code: ValidationIssueCode = VALIDATION_ISSUE_CODES.INVALID_VALUE,
): never => {
  throw new RemoteDocumentDecodeFailure(code, path, message);
};

const decode = <T>(operation: () => T): ParseResult<T> => {
  try {
    return valid(operation());
  } catch (error) {
    if (error instanceof RemoteDocumentDecodeFailure) {
      return invalid([issue(error.code, error.path, error.message)]);
    }
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        [],
        'The remote Journal document could not be decoded.',
      ),
    ]);
  }
};

const recordAt = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): UnknownRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(
      path,
      'Expected an object.',
      VALIDATION_ISSUE_CODES.INVALID_TYPE,
    );
  }
  return value as UnknownRecord;
};

const assertKnownKeys = (
  object: UnknownRecord,
  knownKeys: readonly string[],
  path: readonly ValidationPathSegment[],
): void => {
  const known = new Set(knownKeys);
  const unknown = Object.keys(object).find(key => !known.has(key));
  if (unknown !== undefined) {
    fail(
      [...path, unknown],
      'Unknown fields are not allowed in remote Journal documents.',
    );
  }
};

const arrayAt = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return fail(
      path,
      'Expected an array.',
      VALIDATION_ISSUE_CODES.INVALID_TYPE,
    );
  }
  return value;
};

const stringAt = (
  value: unknown,
  path: readonly ValidationPathSegment[],
  allowEmpty = false,
): string => {
  if (typeof value !== 'string') {
    return fail(
      path,
      'Expected a string.',
      value === undefined
        ? VALIDATION_ISSUE_CODES.REQUIRED
        : VALIDATION_ISSUE_CODES.INVALID_TYPE,
    );
  }
  if (!allowEmpty && value.trim().length === 0) {
    return fail(
      path,
      'Expected a non-empty string.',
      VALIDATION_ISSUE_CODES.INVALID_FORMAT,
    );
  }
  return value;
};

const optionalStringAt = (
  object: UnknownRecord,
  key: string,
  path: readonly ValidationPathSegment[],
  allowEmpty = false,
): string | undefined =>
  Object.prototype.hasOwnProperty.call(object, key)
    ? stringAt(object[key], [...path, key], allowEmpty)
    : undefined;

const timestampAt = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return fail(
      path,
      'Expected a positive Unix timestamp in milliseconds.',
      VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
    );
  }
  return value as number;
};

const optionalTimestampAt = (
  object: UnknownRecord,
  key: string,
  path: readonly ValidationPathSegment[],
): number | undefined =>
  Object.prototype.hasOwnProperty.call(object, key)
    ? timestampAt(object[key], [...path, key])
    : undefined;

const positiveNumberAt = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fail(
      path,
      'Expected a finite number greater than zero.',
      VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
    );
  }
  return value;
};

const optionalPositiveIntegerAt = (
  object: UnknownRecord,
  key: string,
  path: readonly ValidationPathSegment[],
): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return undefined;
  }
  const value = object[key];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return fail(
      [...path, key],
      'Expected a positive integer.',
      VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
    );
  }
  return value as number;
};

const parsedAt = <T>(
  result: ParseResult<T>,
  path: readonly ValidationPathSegment[],
): T => {
  if (!result.ok) {
    const first = result.issues[0];
    return fail(
      path,
      first?.message ?? 'Invalid value.',
      first?.code ?? VALIDATION_ISSUE_CODES.INVALID_VALUE,
    );
  }
  return result.value;
};

const decodeRevision = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): Revision => {
  const revision = parsedAt(parseRevision(value, path), path);
  return revision > 0
    ? revision
    : fail(
        path,
        'Remote entity revisions start at one.',
        VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
      );
};

const decodeScope = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteJournalDocumentScope => {
  const object = recordAt(value, path);
  assertKnownKeys(
    object,
    ['ownerProductUserId', 'workspaceId', 'nightscoutSourceId'],
    path,
  );
  return {
    ownerProductUserId: parsedAt(
      parseProductUserId(object.ownerProductUserId, [
        ...path,
        'ownerProductUserId',
      ]),
      [...path, 'ownerProductUserId'],
    ),
    workspaceId: parsedAt(
      parseWorkspaceId(object.workspaceId, [...path, 'workspaceId']),
      [...path, 'workspaceId'],
    ),
    nightscoutSourceId: parsedAt(
      parseNightscoutSourceId(object.nightscoutSourceId, [
        ...path,
        'nightscoutSourceId',
      ]),
      [...path, 'nightscoutSourceId'],
    ),
  };
};

const decodeLifecycle = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): JournalLifecycleState => {
  const object = recordAt(value, path);
  if (object.kind === 'active') {
    assertKnownKeys(object, ['kind'], path);
    return {kind: 'active'};
  }
  if (object.kind === 'trashed') {
    assertKnownKeys(object, ['kind', 'trashedAt', 'purgeAfter'], path);
    const trashedAt = timestampAt(object.trashedAt, [...path, 'trashedAt']);
    const purgeAfter = timestampAt(object.purgeAfter, [...path, 'purgeAfter']);
    if (purgeAfter <= trashedAt) {
      fail(
        [...path, 'purgeAfter'],
        'purgeAfter must be after trashedAt.',
        VALIDATION_ISSUE_CODES.INVARIANT,
      );
    }
    return {kind: 'trashed', trashedAt, purgeAfter};
  }
  return fail([...path, 'kind'], 'Expected an active or trashed lifecycle.');
};

const decodeIdentity = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteExternalRecordIdentity => {
  const object = recordAt(value, path);
  assertKnownKeys(
    object,
    ['nightscoutSourceId', 'recordKey', 'namespace', 'value'],
    path,
  );
  const nightscoutSourceId = parsedAt(
    parseNightscoutSourceId(object.nightscoutSourceId, [
      ...path,
      'nightscoutSourceId',
    ]),
    [...path, 'nightscoutSourceId'],
  );
  const recordKey = parsedAt(
    parseExternalRecordKey(object.recordKey, [...path, 'recordKey']),
    [...path, 'recordKey'],
  );
  const namespace = (() => {
    switch (object.namespace) {
      case '_id':
      case 'identifier':
      case 'syncIdentifier':
        return object.namespace;
      default:
        return fail(
          [...path, 'namespace'],
          'Unknown external identity namespace.',
        );
    }
  })();
  const identityValue = stringAt(object.value, [...path, 'value']);
  if (
    createExternalRecordKey(nightscoutSourceId, namespace, identityValue) !==
    recordKey
  ) {
    fail(
      [...path, 'recordKey'],
      'The record key does not match its stable identity.',
      VALIDATION_ISSUE_CODES.INVARIANT,
    );
  }
  return {
    nightscoutSourceId,
    recordKey,
    namespace,
    value: identityValue,
  };
};

const decodeMealRole = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteMealExternalRole => {
  const object = recordAt(value, path);
  if (object.kind === 'reported_carbohydrate') {
    assertKnownKeys(object, ['kind', 'purpose'], path);
    switch (object.purpose) {
      case 'meal':
      case 'low_treatment':
      case 'unknown':
        return {kind: 'reported_carbohydrate', purpose: object.purpose};
      default:
        return fail([...path, 'purpose'], 'Unknown carbohydrate purpose.');
    }
  }
  if (object.kind === 'supporting_treatment') {
    assertKnownKeys(object, ['kind', 'purpose'], path);
    switch (object.purpose) {
      case 'bolus':
      case 'correction':
      case 'other':
        return {kind: 'supporting_treatment', purpose: object.purpose};
      default:
        return fail(
          [...path, 'purpose'],
          'Unknown supporting treatment purpose.',
        );
    }
  }
  return fail([...path, 'kind'], 'Unknown Meal external link role.');
};

const decodeActivityRole = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteActivityExternalRole => {
  const object = recordAt(value, path);
  if (object.kind === 'activity') {
    assertKnownKeys(object, ['kind'], path);
    return {kind: 'activity'};
  }
  if (object.kind === 'supporting_treatment') {
    assertKnownKeys(object, ['kind', 'purpose'], path);
    switch (object.purpose) {
      case 'bolus':
      case 'correction':
      case 'other':
        return {kind: 'supporting_treatment', purpose: object.purpose};
      default:
        return fail(
          [...path, 'purpose'],
          'Unknown supporting treatment purpose.',
        );
    }
  }
  return fail([...path, 'kind'], 'Unknown Activity external link role.');
};

const decodeLinks = <TRole>(
  value: unknown,
  path: readonly ValidationPathSegment[],
  expectedSource: NightscoutSourceId,
  roleDecoder: (
    untrustedRole: unknown,
    rolePath: readonly ValidationPathSegment[],
  ) => TRole,
): readonly RemoteExternalEventLink<TRole>[] => {
  const seen = new Set<string>();
  return arrayAt(value, path).map((untrustedLink, index) => {
    const linkPath = [...path, index];
    const object = recordAt(untrustedLink, linkPath);
    assertKnownKeys(object, ['identity', 'role', 'linkedAt'], linkPath);
    const identity = decodeIdentity(object.identity, [...linkPath, 'identity']);
    if (identity.nightscoutSourceId !== expectedSource) {
      fail(
        [...linkPath, 'identity', 'nightscoutSourceId'],
        'External links must belong to the document Nightscout source.',
        VALIDATION_ISSUE_CODES.INVARIANT,
      );
    }
    if (seen.has(identity.recordKey)) {
      fail(
        [...linkPath, 'identity', 'recordKey'],
        'Duplicate external link identity.',
        VALIDATION_ISSUE_CODES.DUPLICATE,
      );
    }
    seen.add(identity.recordKey);
    return {
      identity,
      role: roleDecoder(object.role, [...linkPath, 'role']),
      linkedAt: timestampAt(object.linkedAt, [...linkPath, 'linkedAt']),
    };
  });
};

const decodeTags = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): readonly string[] => {
  const seen = new Set<string>();
  return arrayAt(value, path).map((tag, index) => {
    const tagPath = [...path, index];
    const parsed = stringAt(tag, tagPath);
    const canonical = parsed.trim().toLocaleLowerCase();
    if (seen.has(canonical)) {
      fail(
        tagPath,
        'Duplicate tags are not allowed.',
        VALIDATION_ISSUE_CODES.DUPLICATE,
      );
    }
    seen.add(canonical);
    return parsed;
  });
};

const decodeMealImage = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteMealImageProjection => {
  const object = recordAt(value, path);
  if (object.kind === 'none') {
    assertKnownKeys(object, ['kind'], path);
    return {kind: 'none'};
  }
  if (object.kind === 'omitted') {
    assertKnownKeys(object, ['kind', 'reason'], path);
    if (object.reason !== 'remote_object_identity_unavailable') {
      fail([...path, 'reason'], 'Unknown image omission reason.');
    }
    return {
      kind: 'omitted',
      reason: 'remote_object_identity_unavailable',
    };
  }
  if (object.kind === 'stored') {
    assertKnownKeys(
      object,
      [
        'kind',
        'objectName',
        'mimeType',
        'byteSize',
        'widthPx',
        'heightPx',
      ],
      path,
    );
    const objectName = stringAt(object.objectName, [...path, 'objectName']);
    if (
      !/^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/.test(
        objectName,
      )
    ) {
      fail([...path, 'objectName'], 'Invalid Meal Image object name.');
    }
    const mimeType = stringAt(object.mimeType, [...path, 'mimeType']);
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(
        mimeType.toLocaleLowerCase('en-US'),
      )
    ) {
      fail([...path, 'mimeType'], 'Unsupported Meal Image MIME type.');
    }
    const byteSize = optionalPositiveIntegerAt(object, 'byteSize', path);
    if (byteSize !== undefined && byteSize > 10 * 1024 * 1024) {
      fail(
        [...path, 'byteSize'],
        'Meal Images must be 10 MB or smaller.',
        VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
      );
    }
    const widthPx = optionalPositiveIntegerAt(object, 'widthPx', path);
    const heightPx = optionalPositiveIntegerAt(object, 'heightPx', path);
    return {
      kind: 'stored',
      objectName,
      mimeType: mimeType.toLocaleLowerCase('en-US'),
      ...(byteSize === undefined ? {} : {byteSize}),
      ...(widthPx === undefined ? {} : {widthPx}),
      ...(heightPx === undefined ? {} : {heightPx}),
    };
  }
  return fail([...path, 'kind'], 'Unknown remote image state.');
};

const decodeActivityCategory = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): RemoteActivityDocument['category'] => {
  switch (value) {
    case 'walking':
    case 'running':
    case 'cycling':
    case 'strength':
    case 'swimming':
    case 'sport':
    case 'other':
      return value;
    default:
      return fail(path, 'Unknown Activity Category.');
  }
};

const decodeActivityIntensity = (
  value: unknown,
  path: readonly ValidationPathSegment[],
): NonNullable<RemoteActivityDocument['intensity']> => {
  switch (value) {
    case 'very_low':
    case 'low':
    case 'medium':
    case 'high':
    case 'very_high':
      return value;
    default:
      return fail(path, 'Unknown Activity Intensity.');
  }
};

interface DecodedCommon {
  readonly scope: RemoteJournalDocumentScope;
  readonly revision: Revision;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lifecycle: JournalLifecycleState;
}

const decodeCommon = (object: UnknownRecord): DecodedCommon => {
  if (object.schemaVersion !== JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION) {
    fail(
      ['schemaVersion'],
      'Unsupported remote Journal document schema version.',
    );
  }
  const scope = decodeScope(object.scope, ['scope']);
  const createdAt = timestampAt(object.createdAt, ['createdAt']);
  const updatedAt = timestampAt(object.updatedAt, ['updatedAt']);
  if (updatedAt < createdAt) {
    fail(
      ['updatedAt'],
      'updatedAt cannot precede createdAt.',
      VALIDATION_ISSUE_CODES.INVARIANT,
    );
  }
  return {
    scope,
    revision: decodeRevision(object.revision, ['revision']),
    createdAt,
    updatedAt,
    lifecycle: decodeLifecycle(object.lifecycle, ['lifecycle']),
  };
};

const decodeMeal = (value: unknown): RemoteMealDocument => {
  const object = recordAt(value, []);
  assertKnownKeys(
    object,
    [
      'schemaVersion',
      'documentKind',
      'scope',
      'entityId',
      'revision',
      'createdAt',
      'updatedAt',
      'lifecycle',
      'mealStart',
      'name',
      'mealCarbohydrates',
      'image',
      'notes',
      'tags',
      'externalLinks',
    ],
    [],
  );
  if (object.documentKind !== 'meal') {
    fail(['documentKind'], 'Expected a Meal remote document.');
  }
  const common = decodeCommon(object);
  const name = optionalStringAt(object, 'name', []);
  const notes = optionalStringAt(object, 'notes', [], true);
  const image = decodeMealImage(object.image, ['image']);
  let mealCarbohydrates: RemoteMealDocument['mealCarbohydrates'];
  if (Object.prototype.hasOwnProperty.call(object, 'mealCarbohydrates')) {
    const carbohydrates = recordAt(object.mealCarbohydrates, [
      'mealCarbohydrates',
    ]);
    assertKnownKeys(carbohydrates, ['kind', 'grams'], ['mealCarbohydrates']);
    if (carbohydrates.kind !== 'meal_carbohydrates') {
      fail(['mealCarbohydrates', 'kind'], 'Expected Meal Carbohydrates.');
    }
    mealCarbohydrates = {
      kind: 'meal_carbohydrates',
      grams: positiveNumberAt(carbohydrates.grams, [
        'mealCarbohydrates',
        'grams',
      ]),
    };
  }
  if (
    name === undefined &&
    mealCarbohydrates === undefined &&
    image.kind === 'none'
  ) {
    fail(
      [],
      'A remote Meal needs a name, Meal Carbohydrates, or an omitted image.',
      VALIDATION_ISSUE_CODES.INVARIANT,
    );
  }
  return {
    schemaVersion: JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
    documentKind: 'meal',
    scope: common.scope,
    entityId: parsedAt(parseMealEntryId(object.entityId, ['entityId']), [
      'entityId',
    ]),
    revision: common.revision,
    createdAt: common.createdAt,
    updatedAt: common.updatedAt,
    lifecycle: common.lifecycle,
    mealStart: timestampAt(object.mealStart, ['mealStart']),
    ...(name === undefined ? {} : {name}),
    ...(mealCarbohydrates === undefined ? {} : {mealCarbohydrates}),
    image,
    ...(notes === undefined ? {} : {notes}),
    tags: decodeTags(object.tags, ['tags']),
    externalLinks: decodeLinks(
      object.externalLinks,
      ['externalLinks'],
      common.scope.nightscoutSourceId,
      decodeMealRole,
    ),
  };
};

const decodeActivity = (value: unknown): RemoteActivityDocument => {
  const object = recordAt(value, []);
  assertKnownKeys(
    object,
    [
      'schemaVersion',
      'documentKind',
      'scope',
      'entityId',
      'revision',
      'createdAt',
      'updatedAt',
      'lifecycle',
      'category',
      'customName',
      'startedAt',
      'endedAt',
      'intensity',
      'notes',
      'tags',
      'externalLinks',
    ],
    [],
  );
  if (object.documentKind !== 'activity') {
    fail(['documentKind'], 'Expected an Activity remote document.');
  }
  const common = decodeCommon(object);
  const category = decodeActivityCategory(object.category, ['category']);
  const customName = optionalStringAt(object, 'customName', []);
  if (category === 'other' && customName === undefined) {
    fail(
      ['customName'],
      'A custom name is required for the Other Activity Category.',
      VALIDATION_ISSUE_CODES.INVARIANT,
    );
  }
  const startedAt = timestampAt(object.startedAt, ['startedAt']);
  const endedAt = optionalTimestampAt(object, 'endedAt', []);
  if (endedAt !== undefined && endedAt < startedAt) {
    fail(
      ['endedAt'],
      'An Activity cannot end before it starts.',
      VALIDATION_ISSUE_CODES.INVARIANT,
    );
  }
  const intensityValue = Object.prototype.hasOwnProperty.call(
    object,
    'intensity',
  )
    ? decodeActivityIntensity(object.intensity, ['intensity'])
    : undefined;
  const notes = optionalStringAt(object, 'notes', [], true);
  return {
    schemaVersion: JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
    documentKind: 'activity',
    scope: common.scope,
    entityId: parsedAt(parseActivityEntryId(object.entityId, ['entityId']), [
      'entityId',
    ]),
    revision: common.revision,
    createdAt: common.createdAt,
    updatedAt: common.updatedAt,
    lifecycle: common.lifecycle,
    category,
    ...(customName === undefined ? {} : {customName}),
    startedAt,
    ...(endedAt === undefined ? {} : {endedAt}),
    ...(intensityValue === undefined ? {} : {intensity: intensityValue}),
    ...(notes === undefined ? {} : {notes}),
    tags: decodeTags(object.tags, ['tags']),
    externalLinks: decodeLinks(
      object.externalLinks,
      ['externalLinks'],
      common.scope.nightscoutSourceId,
      decodeActivityRole,
    ),
  };
};

export const decodeRemoteMealDocument = (
  value: unknown,
): ParseResult<RemoteMealDocument> => decode(() => decodeMeal(value));

export const decodeRemoteActivityDocument = (
  value: unknown,
): ParseResult<RemoteActivityDocument> => decode(() => decodeActivity(value));

export const decodeRemoteJournalDocument = (
  value: unknown,
): ParseResult<RemoteJournalDocument> =>
  decode(() => {
    const object = recordAt(value, []);
    if (object.documentKind === 'meal') {
      return decodeMeal(value);
    }
    if (object.documentKind === 'activity') {
      return decodeActivity(value);
    }
    return fail(['documentKind'], 'Unknown remote Journal document kind.');
  });
