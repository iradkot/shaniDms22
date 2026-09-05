import type {
  ActivityConflictDetectedValues,
  ActivityConflictInspection,
  ActivityConflictProposal,
  JournalDetectedFieldValue,
  MealConflictDetectedValues,
  MealConflictInspection,
  MealConflictProposal,
} from '../domain/conflicts';
import {
  areExactExternalDuplicates,
  decodeExternalRecordPayload,
  toExternalRecordReference,
} from '../domain/externalRecords';
import type {ExternalRecordReference} from '../domain/externalRecords';
import type {
  JournalConflictId,
  NightscoutSourceId,
} from '../domain/identifiers';
import type {ActivitySnapshot} from '../domain/activities';
import {
  parseCaptureActivityInput,
  validateActivitySnapshot,
} from '../domain/activities';
import type {MealExternalEventLink, MealSnapshot} from '../domain/meals';
import {
  deriveReportedCarbohydrates,
  parseCaptureMealInput,
  validateMealSnapshot,
} from '../domain/meals';
import type {JournalResult} from '../contracts/result';
import type {ParseResult, ValidationPathSegment} from '../domain/validation';
import {
  invalid,
  isRecord,
  issue,
  VALIDATION_ISSUE_CODES,
} from '../domain/validation';
import {
  JOURNAL_ERROR_CODES,
  journalError,
  journalOk,
} from '../contracts/result';
import {
  applyFieldChange,
  changedFields,
  imageSnapshotAsInput,
  invalidInput,
  nextRevision,
  validationIssue,
  validateFieldChanges,
} from './operationHelpers';
import {parseActivityLinkInput, parseMealLinkInput} from './externalValidation';
import type {JournalFieldConflictRecord} from './types';
import {JOURNAL_TRASH_RETENTION_MS} from './types';
import type {JournalWorkspaceRuntime} from './workspaceRuntime';
import {deepFreeze, immutableJsonClone} from './immutable';

type MealConflictRecord = Extract<
  JournalFieldConflictRecord,
  {readonly entityKind: 'meal'}
>;
type ActivityConflictRecord = Extract<
  JournalFieldConflictRecord,
  {readonly entityKind: 'activity'}
>;

export const parseConflictExternalReference = (
  value: unknown,
  expectedSource: NightscoutSourceId,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ExternalRecordReference> => {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external record reference.',
      ),
    ]);
  }
  if (value.nightscoutSourceId !== expectedSource) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'nightscoutSourceId'],
        'The external record belongs to another Nightscout source.',
      ),
    ]);
  }
  const decoded = decodeExternalRecordPayload(
    value.identifiers,
    expectedSource,
    [...path, 'identifiers'],
  );
  if (!decoded.ok) {
    return decoded;
  }
  const canonical = toExternalRecordReference(decoded.value, path);
  if (!canonical.ok) {
    return canonical;
  }
  if (canonical.value.recordKey !== value.recordKey) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'recordKey'],
        'The external record key does not match its stable identity.',
      ),
    ]);
  }
  return canonical;
};

export interface PreparedMealConflictResolution {
  readonly snapshot: MealSnapshot;
  readonly changedFields: readonly string[];
}

export interface PreparedActivityConflictResolution {
  readonly snapshot: ActivitySnapshot;
  readonly changedFields: readonly string[];
}

const detectedValue = <T>(value: T | undefined): JournalDetectedFieldValue<T> =>
  value === undefined ? {kind: 'absent'} : {kind: 'present', value};

export const detectMealConflictValues = (
  meal: MealSnapshot,
  fields: readonly string[],
): MealConflictDetectedValues => {
  const values: Record<string, unknown> = {};
  fields.forEach(field => {
    switch (field) {
      case 'mealStart':
        values.mealStart = detectedValue(meal.mealStart);
        break;
      case 'name':
        values.name = detectedValue(meal.name);
        break;
      case 'mealCarbohydrates':
        values.mealCarbohydrates = detectedValue(meal.mealCarbohydrates);
        break;
      case 'image':
        values.image = detectedValue(meal.image);
        break;
      case 'notes':
        values.notes = detectedValue(meal.notes);
        break;
      case 'tags':
        values.tags = detectedValue(meal.tags);
        break;
      case 'externalLinks':
        values.externalLinks = detectedValue(meal.externalLinks);
        break;
      case 'lifecycle':
        values.lifecycle = detectedValue(meal.lifecycle);
        break;
    }
  });
  return values as MealConflictDetectedValues;
};

export const detectActivityConflictValues = (
  activity: ActivitySnapshot,
  fields: readonly string[],
): ActivityConflictDetectedValues => {
  const values: Record<string, unknown> = {};
  fields.forEach(field => {
    switch (field) {
      case 'category':
        values.category = detectedValue(activity.category);
        break;
      case 'customName':
        values.customName = detectedValue(activity.customName);
        break;
      case 'startedAt':
        values.startedAt = detectedValue(activity.startedAt);
        break;
      case 'endedAt':
        values.endedAt = detectedValue(activity.endedAt);
        break;
      case 'intensity':
        values.intensity = detectedValue(activity.intensity);
        break;
      case 'notes':
        values.notes = detectedValue(activity.notes);
        break;
      case 'tags':
        values.tags = detectedValue(activity.tags);
        break;
      case 'externalLinks':
        values.externalLinks = detectedValue(activity.externalLinks);
        break;
      case 'lifecycle':
        values.lifecycle = detectedValue(activity.lifecycle);
        break;
    }
  });
  return values as ActivityConflictDetectedValues;
};

export const inspectMealConflictRecords = (
  currentSnapshot: MealSnapshot,
  records: readonly JournalFieldConflictRecord[],
): readonly MealConflictInspection[] =>
  deepFreeze(
    records
      .filter(
        (record): record is MealConflictRecord => record.entityKind === 'meal',
      )
      .map(record => ({...record, currentSnapshot})),
  );

export const inspectActivityConflictRecords = (
  currentSnapshot: ActivitySnapshot,
  records: readonly JournalFieldConflictRecord[],
): readonly ActivityConflictInspection[] =>
  deepFreeze(
    records
      .filter(
        (record): record is ActivityConflictRecord =>
          record.entityKind === 'activity',
      )
      .map(record => ({...record, currentSnapshot})),
  );

export const findMealConflictRecord = (
  records: readonly JournalFieldConflictRecord[],
  conflictId: JournalConflictId,
): MealConflictRecord | undefined =>
  records.find(
    (record): record is MealConflictRecord =>
      record.entityKind === 'meal' && record.conflictId === conflictId,
  );

export const findActivityConflictRecord = (
  records: readonly JournalFieldConflictRecord[],
  conflictId: JournalConflictId,
): ActivityConflictRecord | undefined =>
  records.find(
    (record): record is ActivityConflictRecord =>
      record.entityKind === 'activity' && record.conflictId === conflictId,
  );

const unsupportedImageConflict = <T>(): JournalResult<T> =>
  invalidInput([
    validationIssue(
      ['proposal', 'changes', 'image'],
      'Image conflicts cannot be applied automatically. Keep the current image and add the proposed image again.',
    ),
  ]);

const prepareMealRevision = (
  current: MealSnapshot,
  proposal: Extract<MealConflictProposal, {kind: 'meal_revision'}>,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  const changes = proposal.changes as Readonly<Record<string, unknown>>;
  const fields = [
    'mealStart',
    'name',
    'mealCarbohydrates',
    'image',
    'notes',
    'tags',
  ] as const;
  const issues = validateFieldChanges(changes, fields);
  if (issues.length > 0) {
    return invalidInput(issues);
  }
  const changed = changedFields(changes, fields);
  if (changed.length === 0) {
    return invalidInput([
      validationIssue(['proposal', 'changes'], 'The proposal is empty.'),
    ]);
  }
  if (proposal.changes.image !== undefined) {
    return unsupportedImageConflict();
  }
  const normalized = parseCaptureMealInput({
    mealStart: applyFieldChange(current.mealStart, proposal.changes.mealStart),
    name: applyFieldChange(current.name, proposal.changes.name),
    mealCarbohydrates: applyFieldChange(
      current.mealCarbohydrates,
      proposal.changes.mealCarbohydrates,
    ),
    ...(current.image === undefined
      ? {}
      : {image: imageSnapshotAsInput(current.image)}),
    notes: applyFieldChange(current.notes, proposal.changes.notes),
    tags: applyFieldChange(current.tags, proposal.changes.tags),
  });
  if (!normalized.ok) {
    return invalidInput(normalized.issues);
  }
  const snapshot: MealSnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    mealStart: normalized.value.mealStart,
    ...(normalized.value.name === undefined
      ? {name: undefined}
      : {name: normalized.value.name}),
    ...(normalized.value.mealCarbohydrates === undefined
      ? {mealCarbohydrates: undefined}
      : {mealCarbohydrates: normalized.value.mealCarbohydrates}),
    ...(normalized.value.notes === undefined
      ? {notes: undefined}
      : {notes: normalized.value.notes}),
    tags: normalized.value.tags,
  } as MealSnapshot;
  const snapshotIssues = validateMealSnapshot(snapshot);
  return snapshotIssues.length > 0
    ? invalidInput(snapshotIssues)
    : journalOk({snapshot, changedFields: changed});
};

const prepareMealLink = (
  runtime: JournalWorkspaceRuntime,
  current: MealSnapshot,
  proposal: Extract<MealConflictProposal, {kind: 'meal_link_external_event'}>,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  const parsed = parseMealLinkInput(
    {
      mealId: current.id,
      expectedRevision: current.revision,
      record: proposal.record,
      snapshot: proposal.snapshot,
      role: proposal.role,
    } as Parameters<typeof parseMealLinkInput>[0],
    current.scope.nightscoutSourceId,
  );
  if (!parsed.ok) {
    return invalidInput(parsed.issues);
  }
  const linkedEntryId = runtime.findLinkedMeal(parsed.value.record);
  if (linkedEntryId !== undefined) {
    return journalError({
      code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
      message: 'This external record is already linked.',
      retryable: false,
      linkedEntryId,
    });
  }
  const link: MealExternalEventLink = {
    record: parsed.value.record,
    role: parsed.value.role,
    linkedAt: now,
    external: {
      kind: 'available',
      checkedAt: now,
      snapshot: parsed.value.snapshot,
    },
  } as MealExternalEventLink;
  const externalLinks = [...current.externalLinks, link];
  const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
  const snapshot: MealSnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks,
    ...(reportedCarbohydrates === undefined
      ? {reportedCarbohydrates: undefined}
      : {reportedCarbohydrates}),
  } as MealSnapshot;
  const issues = validateMealSnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareMealUnlink = (
  current: MealSnapshot,
  proposal: Extract<MealConflictProposal, {kind: 'meal_unlink_external_event'}>,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  const record = parseConflictExternalReference(
    proposal.record,
    current.scope.nightscoutSourceId,
    ['proposal', 'record'],
  );
  if (!record.ok) {
    return invalidInput(record.issues);
  }
  const externalLinks = current.externalLinks.filter(
    link => !areExactExternalDuplicates(link.record, record.value),
  );
  if (externalLinks.length === current.externalLinks.length) {
    return journalError({
      code: JOURNAL_ERROR_CODES.NOT_FOUND,
      message: 'The external record is not linked to this meal.',
      retryable: false,
      entity: 'external_record',
    });
  }
  const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
  const snapshot: MealSnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks,
    ...(reportedCarbohydrates === undefined
      ? {reportedCarbohydrates: undefined}
      : {reportedCarbohydrates}),
  } as MealSnapshot;
  const issues = validateMealSnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareMealExternalLinks = (
  current: MealSnapshot,
  proposal: Extract<MealConflictProposal, {kind: 'meal_external_links'}>,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  const externalLinks = immutableJsonClone(proposal.externalLinks);
  const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
  const snapshot: MealSnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks,
    ...(reportedCarbohydrates === undefined
      ? {reportedCarbohydrates: undefined}
      : {reportedCarbohydrates}),
  } as MealSnapshot;
  const issues = validateMealSnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareMealLifecycle = (
  current: MealSnapshot,
  proposal: Extract<MealConflictProposal, {kind: 'meal_lifecycle'}>,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  if (
    proposal.lifecycle === 'trashed' &&
    current.lifecycle.kind === 'trashed'
  ) {
    return journalError({
      code: JOURNAL_ERROR_CODES.ALREADY_TRASHED,
      message: 'This meal is already in Trash.',
      retryable: false,
    });
  }
  if (proposal.lifecycle === 'active' && current.lifecycle.kind !== 'trashed') {
    return journalError({
      code: JOURNAL_ERROR_CODES.NOT_TRASHED,
      message: 'This meal is not in Trash.',
      retryable: false,
    });
  }
  return journalOk({
    snapshot: {
      ...current,
      revision: nextRevision(current.revision),
      updatedAt: now,
      lifecycle:
        proposal.lifecycle === 'active'
          ? {kind: 'active'}
          : {
              kind: 'trashed',
              trashedAt: now,
              purgeAfter: now + JOURNAL_TRASH_RETENTION_MS,
            },
    },
    changedFields: ['lifecycle'],
  });
};

export const prepareMealConflictProposal = (
  runtime: JournalWorkspaceRuntime,
  current: MealSnapshot,
  proposal: MealConflictProposal,
  now: number,
): JournalResult<PreparedMealConflictResolution> => {
  switch (proposal.kind) {
    case 'meal_revision':
      return prepareMealRevision(current, proposal, now);
    case 'meal_link_external_event':
      return prepareMealLink(runtime, current, proposal, now);
    case 'meal_unlink_external_event':
      return prepareMealUnlink(current, proposal, now);
    case 'meal_external_links':
      return prepareMealExternalLinks(current, proposal, now);
    case 'meal_lifecycle':
      return prepareMealLifecycle(current, proposal, now);
  }
};

const prepareActivityRevision = (
  runtime: JournalWorkspaceRuntime,
  current: ActivitySnapshot,
  proposal: Extract<ActivityConflictProposal, {kind: 'activity_revision'}>,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  const changes = proposal.changes as Readonly<Record<string, unknown>>;
  const fields = [
    'category',
    'customName',
    'startedAt',
    'endedAt',
    'intensity',
    'notes',
    'tags',
  ] as const;
  const issues = validateFieldChanges(changes, fields);
  if (issues.length > 0) {
    return invalidInput(issues);
  }
  const changed = changedFields(changes, fields);
  if (changed.length === 0) {
    return invalidInput([
      validationIssue(['proposal', 'changes'], 'The proposal is empty.'),
    ]);
  }
  const normalized = parseCaptureActivityInput({
    category: applyFieldChange(current.category, proposal.changes.category),
    customName: applyFieldChange(
      current.customName,
      proposal.changes.customName,
    ),
    startedAt: applyFieldChange(current.startedAt, proposal.changes.startedAt),
    endedAt: applyFieldChange(current.endedAt, proposal.changes.endedAt),
    intensity: applyFieldChange(current.intensity, proposal.changes.intensity),
    notes: applyFieldChange(current.notes, proposal.changes.notes),
    tags: applyFieldChange(current.tags, proposal.changes.tags),
  });
  if (!normalized.ok) {
    return invalidInput(normalized.issues);
  }
  if (
    normalized.value.endedAt === undefined &&
    runtime.activeOngoingActivity(current.id) !== undefined
  ) {
    const ongoing = runtime.activeOngoingActivity(current.id)!;
    return journalError({
      code: JOURNAL_ERROR_CODES.ONGOING_ACTIVITY_EXISTS,
      message:
        'Finish or resolve the current activity before starting another.',
      retryable: false,
      activityId: ongoing.id,
    });
  }
  const snapshot: ActivitySnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    category: normalized.value.category,
    ...(normalized.value.customName === undefined
      ? {customName: undefined}
      : {customName: normalized.value.customName}),
    startedAt: normalized.value.startedAt,
    ...(normalized.value.endedAt === undefined
      ? {endedAt: undefined}
      : {endedAt: normalized.value.endedAt}),
    ...(normalized.value.intensity === undefined
      ? {intensity: undefined}
      : {intensity: normalized.value.intensity}),
    ...(normalized.value.notes === undefined
      ? {notes: undefined}
      : {notes: normalized.value.notes}),
    tags: normalized.value.tags,
  } as ActivitySnapshot;
  const snapshotIssues = validateActivitySnapshot(snapshot);
  return snapshotIssues.length > 0
    ? invalidInput(snapshotIssues)
    : journalOk({snapshot, changedFields: changed});
};

const prepareActivityLink = (
  runtime: JournalWorkspaceRuntime,
  current: ActivitySnapshot,
  proposal: Extract<
    ActivityConflictProposal,
    {kind: 'activity_link_external_event'}
  >,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  const parsed = parseActivityLinkInput(
    {
      activityId: current.id,
      expectedRevision: current.revision,
      record: proposal.record,
      snapshot: proposal.snapshot,
      role: proposal.role,
    } as Parameters<typeof parseActivityLinkInput>[0],
    current.scope.nightscoutSourceId,
  );
  if (!parsed.ok) {
    return invalidInput(parsed.issues);
  }
  const linkedEntryId = runtime.findLinkedActivity(parsed.value.record);
  if (linkedEntryId !== undefined) {
    return journalError({
      code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
      message: 'This external record is already linked.',
      retryable: false,
      linkedEntryId,
    });
  }
  const link = {
    record: parsed.value.record,
    role: parsed.value.role,
    linkedAt: now,
    external: {
      kind: 'available' as const,
      checkedAt: now,
      snapshot: parsed.value.snapshot,
    },
  } as ActivitySnapshot['externalLinks'][number];
  const snapshot: ActivitySnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks: [...current.externalLinks, link],
  };
  const issues = validateActivitySnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareActivityUnlink = (
  current: ActivitySnapshot,
  proposal: Extract<
    ActivityConflictProposal,
    {kind: 'activity_unlink_external_event'}
  >,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  const record = parseConflictExternalReference(
    proposal.record,
    current.scope.nightscoutSourceId,
    ['proposal', 'record'],
  );
  if (!record.ok) {
    return invalidInput(record.issues);
  }
  const externalLinks = current.externalLinks.filter(
    link => !areExactExternalDuplicates(link.record, record.value),
  );
  if (externalLinks.length === current.externalLinks.length) {
    return journalError({
      code: JOURNAL_ERROR_CODES.NOT_FOUND,
      message: 'The external record is not linked to this activity.',
      retryable: false,
      entity: 'external_record',
    });
  }
  const snapshot: ActivitySnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks,
  };
  const issues = validateActivitySnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareActivityExternalLinks = (
  current: ActivitySnapshot,
  proposal: Extract<
    ActivityConflictProposal,
    {kind: 'activity_external_links'}
  >,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  const snapshot: ActivitySnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    externalLinks: immutableJsonClone(proposal.externalLinks),
  };
  const issues = validateActivitySnapshot(snapshot);
  return issues.length > 0
    ? invalidInput(issues)
    : journalOk({snapshot, changedFields: ['externalLinks']});
};

const prepareActivityLifecycle = (
  current: ActivitySnapshot,
  proposal: Extract<ActivityConflictProposal, {kind: 'activity_lifecycle'}>,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  if (
    proposal.lifecycle === 'trashed' &&
    current.lifecycle.kind === 'trashed'
  ) {
    return journalError({
      code: JOURNAL_ERROR_CODES.ALREADY_TRASHED,
      message: 'This activity is already in Trash.',
      retryable: false,
    });
  }
  if (proposal.lifecycle === 'active' && current.lifecycle.kind !== 'trashed') {
    return journalError({
      code: JOURNAL_ERROR_CODES.NOT_TRASHED,
      message: 'This activity is not in Trash.',
      retryable: false,
    });
  }
  return journalOk({
    snapshot: {
      ...current,
      revision: nextRevision(current.revision),
      updatedAt: now,
      lifecycle:
        proposal.lifecycle === 'active'
          ? {kind: 'active'}
          : {
              kind: 'trashed',
              trashedAt: now,
              purgeAfter: now + JOURNAL_TRASH_RETENTION_MS,
            },
    },
    changedFields: ['lifecycle'],
  });
};

export const prepareActivityConflictProposal = (
  runtime: JournalWorkspaceRuntime,
  current: ActivitySnapshot,
  proposal: ActivityConflictProposal,
  now: number,
): JournalResult<PreparedActivityConflictResolution> => {
  switch (proposal.kind) {
    case 'activity_revision':
      return prepareActivityRevision(runtime, current, proposal, now);
    case 'activity_link_external_event':
      return prepareActivityLink(runtime, current, proposal, now);
    case 'activity_unlink_external_event':
      return prepareActivityUnlink(current, proposal, now);
    case 'activity_external_links':
      return prepareActivityExternalLinks(current, proposal, now);
    case 'activity_lifecycle':
      return prepareActivityLifecycle(current, proposal, now);
  }
};
