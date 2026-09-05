import type {
  ActivitiesWorkspace,
  ActivityExternalCandidate,
  ActivityExternalEventTransfer,
  ActivityExternalTransferUndoReceipt,
  ActivityExternalTransferUndoResult,
  ActivityRevisionTarget,
  FindActivityLinkCandidatesInput,
  LinkActivityExternalEventInput,
  RefreshActivityExternalEventInput,
  ResolveOngoingActivitiesInput,
  ResolveActivityConflictInput,
  TransferActivityExternalEventInput,
  UnlinkActivityExternalEventInput,
} from '../contracts/activitiesWorkspace';
import {
  JOURNAL_ERROR_CODES,
  journalError,
  journalOk,
} from '../contracts/result';
import type {JournalResult} from '../contracts/result';
import {
  areExactExternalDuplicates,
  parseExternalActivityRecordSnapshot,
  parseExternalTreatmentRecordSnapshot,
} from '../domain/externalRecords';
import type {
  ExternalRecordAvailability,
  ExternalRecordSnapshot,
  ReadLinkedExternalRecordResult,
} from '../domain/externalRecords';
import {
  parseActivityEntryId,
  parseJournalConflictId,
  parseRevision,
} from '../domain/identifiers';
import type {ActivityEntryId} from '../domain/identifiers';
import type {JournalListQuery, JournalPage} from '../domain/journal';
import type {JournalFieldConflictRecord} from './types';
import type {
  ActivityConflictInspection,
  ActivityConflictProposal,
} from '../domain/conflicts';
import {
  parseCaptureActivityInput,
  validateActivitySnapshot,
} from '../domain/activities';
import type {
  ActivityExternalEventLink,
  ActivitySnapshot,
  CaptureActivityInput,
  FinishActivityInput,
  NormalizedCaptureActivityInput,
  ReviseActivityInput,
} from '../domain/activities';
import {
  applyFieldChange,
  changedFields,
  initialRevision,
  invalidInput,
  nextRevision,
  storageFailure,
  validationIssue,
  validateFieldChanges,
  validateJournalListQuery,
} from './operationHelpers';
import {
  parseActivityLinkInput,
  sanitizeActivityCandidates,
} from './externalValidation';
import {JOURNAL_TRASH_RETENTION_MS} from './types';
import {JournalWorkspaceRuntime} from './workspaceRuntime';
import {
  detectActivityConflictValues,
  findActivityConflictRecord,
  inspectActivityConflictRecords,
  prepareActivityConflictProposal,
  parseConflictExternalReference,
} from './conflictResolution';

const activityNotFound = <T>(activityId: ActivityEntryId): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.NOT_FOUND,
    message: `Activity ${activityId} was not found.`,
    retryable: false,
    entity: 'activity',
  });

const revisionConflict = <T>(
  runtime: JournalWorkspaceRuntime,
  activity: ActivitySnapshot,
  expectedRevision: ActivitySnapshot['revision'],
): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.REVISION_CONFLICT,
    message: 'This activity changed after it was opened.',
    retryable: false,
    expected: expectedRevision,
    actual: activity.revision,
    conflictingFields: runtime.conflictingFields(activity.id, expectedRevision),
  });

const currentActivity = (
  runtime: JournalWorkspaceRuntime,
  target: ActivityRevisionTarget,
): JournalResult<ActivitySnapshot> => {
  const parsedId = parseActivityEntryId(target.activityId, ['activityId']);
  const parsedRevision = parseRevision(target.expectedRevision, [
    'expectedRevision',
  ]);
  if (!parsedId.ok || !parsedRevision.ok) {
    return invalidInput([
      ...(!parsedId.ok ? parsedId.issues : []),
      ...(!parsedRevision.ok ? parsedRevision.issues : []),
    ]);
  }
  const activity = runtime.getActivitySnapshot(parsedId.value);
  if (activity === undefined) {
    return activityNotFound(parsedId.value);
  }
  if (parsedRevision.value > activity.revision) {
    return revisionConflict(runtime, activity, parsedRevision.value);
  }
  return journalOk(activity);
};

const validNow = (runtime: JournalWorkspaceRuntime): number => {
  const now = runtime.dependencies.clock.now();
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error('Journal clock returned an invalid timestamp.');
  }
  return now;
};

const committedActivities = (
  items: readonly unknown[],
): readonly ActivitySnapshot[] =>
  items.map(item => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('kind' in item) ||
      (item as {kind: unknown}).kind !== 'activity'
    ) {
      throw new Error('The Journal committed an unexpected entity kind.');
    }
    return item as ActivitySnapshot;
  });

const committedActivity = (items: readonly unknown[]): ActivitySnapshot => {
  const activity = committedActivities(items)[0];
  if (activity === undefined) {
    throw new Error('The Journal did not commit the activity mutation.');
  }
  return activity;
};

const committedActivityById = (
  items: readonly unknown[],
  activityId: ActivityEntryId,
): ActivitySnapshot => {
  const activity = committedActivities(items).find(item => item.id === activityId);
  if (activity === undefined) {
    throw new Error(`The Journal did not commit activity ${activityId}.`);
  }
  return activity;
};

const lastKnownSnapshot = (
  link: ActivityExternalEventLink,
): ExternalRecordSnapshot | undefined =>
  link.external.kind === 'available'
    ? link.external.snapshot
    : link.external.lastKnown;

const validateRefreshedActivitySnapshot = (
  link: ActivityExternalEventLink,
  result: ReadLinkedExternalRecordResult,
): JournalResult<ExternalRecordAvailability<ExternalRecordSnapshot>> => {
  if (result.kind === 'unavailable') {
    const lastKnown = lastKnownSnapshot(link);
    return journalOk({
      kind: 'unavailable',
      checkedAt: 0,
      reason: result.reason,
      ...(lastKnown === undefined ? {} : {lastKnown}),
    });
  }
  if (!areExactExternalDuplicates(result.record, link.record)) {
    return journalError({
      code: JOURNAL_ERROR_CODES.SYNC_FAILED,
      message: 'Nightscout returned a different external record identity.',
      retryable: true,
    });
  }
  const parsed =
    link.role.kind === 'activity'
      ? parseExternalActivityRecordSnapshot(result.snapshot)
      : parseExternalTreatmentRecordSnapshot(result.snapshot);
  if (!parsed.ok) {
    return journalError({
      code: JOURNAL_ERROR_CODES.SYNC_FAILED,
      message: 'Nightscout returned an invalid linked record.',
      retryable: true,
    });
  }
  return journalOk({kind: 'available', checkedAt: 0, snapshot: parsed.value});
};

const activityRevisionProposal = (
  input: ReviseActivityInput,
  normalized: NormalizedCaptureActivityInput,
  fields: readonly string[],
): ActivityConflictProposal => {
  const changes: Record<string, unknown> = {};
  fields.forEach(field => {
    switch (field) {
      case 'category':
        changes.category =
          input.category?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.category};
        break;
      case 'customName':
        changes.customName =
          input.customName?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.customName};
        break;
      case 'startedAt':
        changes.startedAt =
          input.startedAt?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.startedAt};
        break;
      case 'endedAt':
        changes.endedAt =
          input.endedAt?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.endedAt};
        break;
      case 'intensity':
        changes.intensity =
          input.intensity?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.intensity};
        break;
      case 'notes':
        changes.notes =
          input.notes?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.notes};
        break;
      case 'tags':
        changes.tags =
          input.tags?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.tags};
        break;
    }
  });
  return {kind: 'activity_revision', changes} as ActivityConflictProposal;
};

const persistActivityConflict = async (
  runtime: JournalWorkspaceRuntime,
  current: ActivitySnapshot,
  expectedRevision: ActivitySnapshot['revision'],
  conflictingFields: readonly string[],
  proposal: ActivityConflictProposal,
): Promise<JournalResult<ActivitySnapshot>> => {
  const now = validNow(runtime);
  const rawConflictId = runtime.dependencies.ids.nextOperationId().trim();
  if (rawConflictId.length === 0) {
    return storageFailure(new Error('Journal conflict IDs cannot be empty.'));
  }
  const conflictId = parseJournalConflictId(`conflict_${rawConflictId}`, [
    'conflictId',
  ]);
  if (!conflictId.ok) {
    return storageFailure(new Error('Journal conflict IDs cannot be empty.'));
  }
  const conflict: JournalFieldConflictRecord = {
    entityKind: 'activity',
    conflictId: conflictId.value,
    detectedAt: now,
    expectedRevision,
    detectedAgainstRevision: current.revision,
    conflictingFields,
    proposal,
    detectedValues: detectActivityConflictValues(current, conflictingFields),
  };
  const snapshot: ActivitySnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    syncState: {kind: 'conflict', detectedAt: now, conflictingFields},
  };
  try {
    const committed = await runtime.commitMutations([
      {
        kind: 'activity',
        snapshot,
        baseRevision: current.revision,
        changedFields: ['conflicts'],
        conflictsAdded: [conflict],
      },
    ]);
    const conflicted = committedActivity(committed);
    return journalError({
      code: JOURNAL_ERROR_CODES.REVISION_CONFLICT,
      message: 'This activity has a conflicting concurrent edit.',
      retryable: false,
      expected: expectedRevision,
      actual: conflicted.revision,
      conflictingFields,
    });
  } catch (error) {
    return storageFailure(error);
  }
};

const ongoingExists = <T>(activity: ActivitySnapshot): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.ONGOING_ACTIVITY_EXISTS,
    message: 'Finish or resolve the current activity before starting another.',
    retryable: false,
    activityId: activity.id,
  });

export class LocalActivitiesWorkspace implements ActivitiesWorkspace {
  readonly scope;
  readonly getSnapshot;
  readonly getListSnapshot;
  readonly subscribe;

  constructor(private readonly runtime: JournalWorkspaceRuntime) {
    this.scope = runtime.scope;
    this.getSnapshot = runtime.getActivitySnapshot;
    this.getListSnapshot = runtime.getActivityListSnapshot;
    this.subscribe = runtime.subscribe;
  }

  async capture(
    input: CaptureActivityInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const normalized = parseCaptureActivityInput(input);
    if (!normalized.ok) {
      return invalidInput(normalized.issues);
    }

    return this.runtime.runMutation(async () => {
      if (normalized.value.endedAt === undefined) {
        const ongoing = this.runtime.activeOngoingActivity();
        if (ongoing !== undefined) {
          return ongoingExists(ongoing);
        }
      }
      const idResult = parseActivityEntryId(
        this.runtime.dependencies.ids.nextEntryId('activity'),
        ['id'],
      );
      if (!idResult.ok) {
        return invalidInput(idResult.issues);
      }
      const now = validNow(this.runtime);
      const snapshot: ActivitySnapshot = {
        kind: 'activity',
        id: idResult.value,
        scope: this.scope,
        revision: initialRevision(),
        createdAt: now,
        updatedAt: now,
        lifecycle: {kind: 'active'},
        syncState: {kind: 'local_only'},
        category: normalized.value.category,
        ...(normalized.value.customName === undefined
          ? {}
          : {customName: normalized.value.customName}),
        startedAt: normalized.value.startedAt,
        ...(normalized.value.endedAt === undefined
          ? {}
          : {endedAt: normalized.value.endedAt}),
        ...(normalized.value.intensity === undefined
          ? {}
          : {intensity: normalized.value.intensity}),
        ...(normalized.value.notes === undefined
          ? {}
          : {notes: normalized.value.notes}),
        tags: normalized.value.tags,
        externalLinks: [],
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: null,
            changedFields: [
              'category',
              ...(snapshot.customName === undefined ? [] : ['customName']),
              'startedAt',
              ...(snapshot.endedAt === undefined ? [] : ['endedAt']),
              ...(snapshot.intensity === undefined ? [] : ['intensity']),
              ...(snapshot.notes === undefined ? [] : ['notes']),
              'tags',
            ],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async revise(
    input: ReviseActivityInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const inputRecord = input as unknown as Readonly<Record<string, unknown>>;
    const fieldNames = [
      'category',
      'customName',
      'startedAt',
      'endedAt',
      'intensity',
      'notes',
      'tags',
    ] as const;
    const changeIssues = validateFieldChanges(inputRecord, fieldNames);
    if (changeIssues.length > 0) {
      return invalidInput(changeIssues);
    }
    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, input);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      const fields = changedFields(inputRecord, fieldNames);
      if (fields.length === 0) {
        return invalidInput([
          validationIssue(
            [],
            'An activity revision must change at least one field.',
          ),
        ]);
      }
      const normalized = parseCaptureActivityInput({
        category: applyFieldChange(current.category, input.category),
        customName: applyFieldChange(current.customName, input.customName),
        startedAt: applyFieldChange(current.startedAt, input.startedAt),
        endedAt: applyFieldChange(current.endedAt, input.endedAt),
        intensity: applyFieldChange(current.intensity, input.intensity),
        notes: applyFieldChange(current.notes, input.notes),
        tags: applyFieldChange(current.tags, input.tags),
      });
      if (!normalized.ok) {
        return invalidInput(normalized.issues);
      }
      if (input.expectedRevision < current.revision) {
        const conflicts = this.runtime.conflictingFieldsFor(
          current.id,
          input.expectedRevision,
          fields,
        );
        if (conflicts.length > 0) {
          return persistActivityConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            activityRevisionProposal(input, normalized.value, fields),
          );
        }
      }
      if (normalized.value.endedAt === undefined) {
        const ongoing = this.runtime.activeOngoingActivity(current.id);
        if (ongoing !== undefined) {
          return ongoingExists(ongoing);
        }
      }
      const now = validNow(this.runtime);
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
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: fields,
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async finish(
    input: FinishActivityInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    return this.revise({
      activityId: input.activityId,
      expectedRevision: input.expectedRevision,
      endedAt: {kind: 'set', value: input.endedAt},
    });
  }

  async get(
    activityId: ActivityEntryId,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const id = parseActivityEntryId(activityId, ['activityId']);
    if (!id.ok) {
      return invalidInput(id.issues);
    }
    const activity = this.runtime.getActivitySnapshot(id.value);
    return activity === undefined
      ? activityNotFound(id.value)
      : journalOk(activity);
  }

  async list(
    query?: JournalListQuery,
  ): Promise<JournalResult<JournalPage<ActivitySnapshot>>> {
    const invalid = validateJournalListQuery(query);
    return invalid ?? journalOk(this.getListSnapshot(query));
  }

  async findLinkCandidates(
    input: FindActivityLinkCandidatesInput,
  ): Promise<JournalResult<readonly ActivityExternalCandidate[]>> {
    if (
      !Number.isSafeInteger(input.nearStartedAt) ||
      input.nearStartedAt <= 0 ||
      (input.beforeMs !== undefined && input.beforeMs < 0) ||
      (input.afterMs !== undefined && input.afterMs < 0)
    ) {
      return invalidInput([
        validationIssue([], 'The candidate search window is invalid.'),
      ]);
    }
    const reader = this.runtime.dependencies.externalRecords;
    if (reader === undefined) {
      return journalOk<readonly ActivityExternalCandidate[]>([]);
    }
    try {
      const result = await reader.findActivityCandidates(this.scope, input);
      if (!result.ok) {
        return result;
      }
      const sanitized = sanitizeActivityCandidates(
        result.value,
        this.scope.nightscoutSourceId,
      );
      return sanitized.issues.length === 0
        ? journalOk(sanitized.activities)
        : journalError({
            code: JOURNAL_ERROR_CODES.SYNC_FAILED,
            message: 'Nightscout returned invalid link candidates.',
            retryable: true,
          });
    } catch {
      return journalError({
        code: JOURNAL_ERROR_CODES.OFFLINE,
        message: 'Nightscout link candidates are unavailable.',
        retryable: true,
      });
    }
  }

  async linkExternalEvent(
    input: LinkActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const parsedInput = parseActivityLinkInput(
      input,
      this.scope.nightscoutSourceId,
    );
    if (!parsedInput.ok) {
      return invalidInput(parsedInput.issues);
    }
    const linkInput = parsedInput.value;
    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, linkInput);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      if (linkInput.expectedRevision < current.revision) {
        const conflicts = this.runtime.conflictingFieldsFor(
          current.id,
          linkInput.expectedRevision,
          ['externalLinks'],
        );
        if (conflicts.length > 0) {
          return persistActivityConflict(
            this.runtime,
            current,
            linkInput.expectedRevision,
            conflicts,
            {
              kind: 'activity_link_external_event',
              record: linkInput.record,
              snapshot: linkInput.snapshot,
              role: linkInput.role,
            } as ActivityConflictProposal,
          );
        }
      }
      const linkedEntryId = this.runtime.findLinkedActivity(linkInput.record);
      if (linkedEntryId !== undefined) {
        return journalError({
          code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
          message: 'This external record is already linked.',
          retryable: false,
          linkedEntryId,
        });
      }
      const now = validNow(this.runtime);
      const link: ActivityExternalEventLink = {
        record: linkInput.record,
        role: linkInput.role,
        linkedAt: now,
        external: {
          kind: 'available',
          checkedAt: now,
          snapshot: linkInput.snapshot,
        },
      } as ActivityExternalEventLink;
      const snapshot: ActivitySnapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        externalLinks: [...current.externalLinks, link],
      };
      const issues = validateActivitySnapshot(snapshot);
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async unlinkExternalEvent(
    input: UnlinkActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const parsedRecord = parseConflictExternalReference(
      input.record,
      this.scope.nightscoutSourceId,
      ['record'],
    );
    if (!parsedRecord.ok) {
      return invalidInput(parsedRecord.issues);
    }
    const unlinkInput: UnlinkActivityExternalEventInput = {
      ...input,
      record: parsedRecord.value,
    };
    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, unlinkInput);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      if (unlinkInput.expectedRevision < current.revision) {
        const conflicts = this.runtime.conflictingFieldsFor(
          current.id,
          unlinkInput.expectedRevision,
          ['externalLinks'],
        );
        if (conflicts.length > 0) {
          return persistActivityConflict(
            this.runtime,
            current,
            unlinkInput.expectedRevision,
            conflicts,
            {
              kind: 'activity_unlink_external_event',
              record: unlinkInput.record,
            },
          );
        }
      }
      const externalLinks = current.externalLinks.filter(
        link => !areExactExternalDuplicates(link.record, unlinkInput.record),
      );
      if (externalLinks.length === current.externalLinks.length) {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_FOUND,
          message: 'The external record is not linked to this activity.',
          retryable: false,
          entity: 'external_record',
        });
      }
      const now = validNow(this.runtime);
      const snapshot: ActivitySnapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        externalLinks,
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async refreshExternalEvent(
    input: RefreshActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const parsedRecord = parseConflictExternalReference(
      input.record,
      this.scope.nightscoutSourceId,
      ['record'],
    );
    const initial = currentActivity(this.runtime, input);
    if (!parsedRecord.ok || !initial.ok) {
      return !parsedRecord.ok ? invalidInput(parsedRecord.issues) : initial;
    }
    const initialLink = initial.value.externalLinks.find(link =>
      areExactExternalDuplicates(link.record, parsedRecord.value),
    );
    if (initialLink === undefined) {
      return journalError({
        code: JOURNAL_ERROR_CODES.NOT_FOUND,
        message: 'The external record is not linked to this activity.',
        retryable: false,
        entity: 'external_record',
      });
    }
    const lastKnown = lastKnownSnapshot(initialLink);
    if (lastKnown === undefined) {
      return journalError({
        code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_UNAVAILABLE,
        message: 'The linked record has no last-known snapshot to refresh.',
        retryable: true,
      });
    }
    let read: ReadLinkedExternalRecordResult;
    const reader = this.runtime.dependencies.externalRecords;
    if (reader === undefined) {
      read = {kind: 'unavailable', reason: 'source_unavailable'};
    } else {
      try {
        const result = await reader.readLinkedRecord(this.scope, {
          record: parsedRecord.value,
          lastKnown,
        });
        read = result.ok
          ? result.value
          : {kind: 'unavailable', reason: 'source_unavailable'};
      } catch {
        read = {kind: 'unavailable', reason: 'source_unavailable'};
      }
    }
    const validated = validateRefreshedActivitySnapshot(initialLink, read);
    if (!validated.ok) {
      return validated;
    }

    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, input);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      if (
        input.expectedRevision < current.revision &&
        this.runtime.conflictingFieldsFor(
          current.id,
          input.expectedRevision,
          ['externalLinks'],
        ).length > 0
      ) {
        return revisionConflict(this.runtime, current, input.expectedRevision);
      }
      const currentLink = current.externalLinks.find(link =>
        areExactExternalDuplicates(link.record, parsedRecord.value),
      );
      if (currentLink === undefined) {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_FOUND,
          message: 'The external record is no longer linked to this activity.',
          retryable: false,
          entity: 'external_record',
        });
      }
      const now = validNow(this.runtime);
      const external =
        validated.value.kind === 'available'
          ? {
              kind: 'available' as const,
              checkedAt: now,
              snapshot: validated.value.snapshot,
            }
          : {
              kind: 'unavailable' as const,
              checkedAt: now,
              reason: validated.value.reason,
              ...(lastKnownSnapshot(currentLink) === undefined
                ? {}
                : {lastKnown: lastKnownSnapshot(currentLink)}),
            };
      const refreshedLink = {
        ...currentLink,
        external,
      } as ActivityExternalEventLink;
      const externalLinks = current.externalLinks.map(link =>
        areExactExternalDuplicates(link.record, parsedRecord.value)
          ? refreshedLink
          : link,
      );
      const snapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        externalLinks,
      } as ActivitySnapshot;
      const issues = validateActivitySnapshot(snapshot);
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async transferExternalEvent(
    input: TransferActivityExternalEventInput,
  ): Promise<JournalResult<ActivityExternalEventTransfer>> {
    const parsedLink = parseActivityLinkInput(
      input,
      this.scope.nightscoutSourceId,
    );
    const sourceId = parseActivityEntryId(input.sourceActivityId, [
      'sourceActivityId',
    ]);
    const sourceRevision = parseRevision(input.sourceExpectedRevision, [
      'sourceExpectedRevision',
    ]);
    if (
      !parsedLink.ok ||
      !sourceId.ok ||
      !sourceRevision.ok ||
      input.confirmed !== true ||
      (parsedLink.ok &&
        sourceId.ok &&
        parsedLink.value.activityId === sourceId.value)
    ) {
      return invalidInput([
        ...(!parsedLink.ok ? parsedLink.issues : []),
        ...(!sourceId.ok ? sourceId.issues : []),
        ...(!sourceRevision.ok ? sourceRevision.issues : []),
        ...(input.confirmed === true
          ? []
          : [validationIssue(['confirmed'], 'Confirm the link transfer.')]),
        ...(parsedLink.ok &&
        sourceId.ok &&
        parsedLink.value.activityId === sourceId.value
          ? [
              validationIssue(
                ['sourceActivityId'],
                'The source and destination activities must be different.',
              ),
            ]
          : []),
      ]);
    }
    const linkInput = parsedLink.value;
    return this.runtime.runMutation(async () => {
      const source = this.runtime.getActivitySnapshot(sourceId.value);
      const destinationResult = currentActivity(this.runtime, linkInput);
      if (source === undefined) {
        return activityNotFound<ActivityExternalEventTransfer>(sourceId.value);
      }
      if (!destinationResult.ok) {
        return destinationResult;
      }
      const destination = destinationResult.value;
      if (sourceRevision.value > source.revision) {
        return revisionConflict(this.runtime, source, sourceRevision.value);
      }
      if (
        (sourceRevision.value < source.revision &&
          this.runtime.conflictingFieldsFor(
            source.id,
            sourceRevision.value,
            ['externalLinks'],
          ).length > 0) ||
        (linkInput.expectedRevision < destination.revision &&
          this.runtime.conflictingFieldsFor(
            destination.id,
            linkInput.expectedRevision,
            ['externalLinks'],
          ).length > 0)
      ) {
        return sourceRevision.value < source.revision
          ? revisionConflict(this.runtime, source, sourceRevision.value)
          : revisionConflict(
              this.runtime,
              destination,
              linkInput.expectedRevision,
            );
      }
      const sourceLink = source.externalLinks.find(link =>
        areExactExternalDuplicates(link.record, linkInput.record),
      );
      if (sourceLink === undefined) {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_FOUND,
          message: 'The source activity no longer owns this external record.',
          retryable: false,
          entity: 'external_record',
        });
      }
      const existingOwner = this.runtime.findLinkedActivity(linkInput.record);
      if (existingOwner !== source.id) {
        return journalError({
          code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
          message: 'This external record is linked to a different activity.',
          retryable: false,
          linkedEntryId: existingOwner ?? destination.id,
        });
      }
      const now = validNow(this.runtime);
      const sourceLinks = source.externalLinks.filter(
        link => !areExactExternalDuplicates(link.record, linkInput.record),
      );
      const destinationLink = {
        record: linkInput.record,
        role: linkInput.role,
        linkedAt: now,
        external: {
          kind: 'available',
          checkedAt: now,
          snapshot: linkInput.snapshot,
        },
      } as ActivityExternalEventLink;
      const nextSource = {
        ...source,
        revision: nextRevision(source.revision),
        updatedAt: now,
        externalLinks: sourceLinks,
      } as ActivitySnapshot;
      const nextDestination = {
        ...destination,
        revision: nextRevision(destination.revision),
        updatedAt: now,
        externalLinks: [...destination.externalLinks, destinationLink],
      } as ActivitySnapshot;
      const issues = [
        ...validateActivitySnapshot(nextSource),
        ...validateActivitySnapshot(nextDestination),
      ];
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot: nextSource,
            baseRevision: source.revision,
            changedFields: ['externalLinks'],
          },
          {
            kind: 'activity',
            snapshot: nextDestination,
            baseRevision: destination.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        const committedSource = committedActivityById(committed, source.id);
        const committedDestination = committedActivityById(
          committed,
          destination.id,
        );
        return journalOk({
          source: committedSource,
          destination: committedDestination,
          undo: {
            kind: 'activity_external_transfer',
            sourceActivityId: source.id,
            destinationActivityId: destination.id,
            sourceRevisionAfterTransfer: committedSource.revision,
            destinationRevisionAfterTransfer: committedDestination.revision,
            previousSourceLink: sourceLink,
          },
        });
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async undoExternalEventTransfer(
    receipt: ActivityExternalTransferUndoReceipt,
  ): Promise<JournalResult<ActivityExternalTransferUndoResult>> {
    if (receipt.kind !== 'activity_external_transfer') {
      return invalidInput([
        validationIssue(['kind'], 'Expected an activity transfer receipt.'),
      ]);
    }
    const sourceId = parseActivityEntryId(receipt.sourceActivityId, [
      'sourceActivityId',
    ]);
    const destinationId = parseActivityEntryId(
      receipt.destinationActivityId,
      ['destinationActivityId'],
    );
    const sourceRevision = parseRevision(receipt.sourceRevisionAfterTransfer, [
      'sourceRevisionAfterTransfer',
    ]);
    const destinationRevision = parseRevision(
      receipt.destinationRevisionAfterTransfer,
      ['destinationRevisionAfterTransfer'],
    );
    const parsedRecord = parseConflictExternalReference(
      receipt.previousSourceLink.record,
      this.scope.nightscoutSourceId,
      ['previousSourceLink', 'record'],
    );
    if (
      !sourceId.ok ||
      !destinationId.ok ||
      !sourceRevision.ok ||
      !destinationRevision.ok ||
      !parsedRecord.ok ||
      (sourceId.ok && destinationId.ok && sourceId.value === destinationId.value)
    ) {
      return invalidInput([
        ...(!sourceId.ok ? sourceId.issues : []),
        ...(!destinationId.ok ? destinationId.issues : []),
        ...(!sourceRevision.ok ? sourceRevision.issues : []),
        ...(!destinationRevision.ok ? destinationRevision.issues : []),
        ...(!parsedRecord.ok ? parsedRecord.issues : []),
        ...(sourceId.ok &&
        destinationId.ok &&
        sourceId.value === destinationId.value
          ? [
              validationIssue(
                ['destinationActivityId'],
                'The receipt is invalid.',
              ),
            ]
          : []),
      ]);
    }
    return this.runtime.runMutation(async () => {
      const originalSource = this.runtime.getActivitySnapshot(sourceId.value);
      const previousDestination = this.runtime.getActivitySnapshot(
        destinationId.value,
      );
      if (originalSource === undefined) {
        return activityNotFound<ActivityExternalTransferUndoResult>(
          sourceId.value,
        );
      }
      if (previousDestination === undefined) {
        return activityNotFound<ActivityExternalTransferUndoResult>(
          destinationId.value,
        );
      }
      if (
        sourceRevision.value > originalSource.revision ||
        (sourceRevision.value < originalSource.revision &&
          this.runtime.conflictingFieldsFor(
            originalSource.id,
            sourceRevision.value,
            ['externalLinks'],
          ).length > 0)
      ) {
        return revisionConflict(
          this.runtime,
          originalSource,
          sourceRevision.value,
        );
      }
      if (
        destinationRevision.value > previousDestination.revision ||
        (destinationRevision.value < previousDestination.revision &&
          this.runtime.conflictingFieldsFor(
            previousDestination.id,
            destinationRevision.value,
            ['externalLinks'],
          ).length > 0)
      ) {
        return revisionConflict(
          this.runtime,
          previousDestination,
          destinationRevision.value,
        );
      }
      if (
        originalSource.externalLinks.some(link =>
          areExactExternalDuplicates(link.record, parsedRecord.value),
        ) ||
        !previousDestination.externalLinks.some(link =>
          areExactExternalDuplicates(link.record, parsedRecord.value),
        )
      ) {
        return journalError({
          code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_UNAVAILABLE,
          message: 'The transferred link changed and cannot be undone safely.',
          retryable: false,
        });
      }
      const now = validNow(this.runtime);
      const restoredSource = {
        ...originalSource,
        revision: nextRevision(originalSource.revision),
        updatedAt: now,
        externalLinks: [
          ...originalSource.externalLinks,
          receipt.previousSourceLink,
        ],
      } as ActivitySnapshot;
      const restoredDestination = {
        ...previousDestination,
        revision: nextRevision(previousDestination.revision),
        updatedAt: now,
        externalLinks: previousDestination.externalLinks.filter(
          link => !areExactExternalDuplicates(link.record, parsedRecord.value),
        ),
      } as ActivitySnapshot;
      const issues = [
        ...validateActivitySnapshot(restoredSource),
        ...validateActivitySnapshot(restoredDestination),
      ];
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot: restoredDestination,
            baseRevision: previousDestination.revision,
            changedFields: ['externalLinks'],
          },
          {
            kind: 'activity',
            snapshot: restoredSource,
            baseRevision: originalSource.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk({
          source: committedActivityById(committed, previousDestination.id),
          destination: committedActivityById(committed, originalSource.id),
        });
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async inspectConflicts(
    activityId: ActivityEntryId,
  ): Promise<JournalResult<readonly ActivityConflictInspection[]>> {
    const parsedId = parseActivityEntryId(activityId, ['activityId']);
    if (!parsedId.ok) {
      return invalidInput(parsedId.issues);
    }
    const current = this.runtime.getActivitySnapshot(parsedId.value);
    if (current === undefined) {
      return activityNotFound<readonly ActivityConflictInspection[]>(
        parsedId.value,
      );
    }
    return journalOk(
      inspectActivityConflictRecords(
        current,
        this.runtime.getActivityConflicts(current.id),
      ),
    );
  }

  async resolveConflict(
    input: ResolveActivityConflictInput,
  ): Promise<JournalResult<ActivitySnapshot>> {
    const parsedId = parseActivityEntryId(input.activityId, ['activityId']);
    const parsedConflictId = parseJournalConflictId(input.conflictId, [
      'conflictId',
    ]);
    const parsedRevision = parseRevision(input.expectedRevision, [
      'expectedRevision',
    ]);
    if (
      !parsedId.ok ||
      !parsedConflictId.ok ||
      !parsedRevision.ok ||
      (input.decision !== 'keep_current' && input.decision !== 'apply_proposed')
    ) {
      return invalidInput([
        ...(!parsedId.ok ? parsedId.issues : []),
        ...(!parsedConflictId.ok ? parsedConflictId.issues : []),
        ...(!parsedRevision.ok ? parsedRevision.issues : []),
        ...(input.decision !== 'keep_current' &&
        input.decision !== 'apply_proposed'
          ? [
              validationIssue(
                ['decision'],
                'Expected keep_current or apply_proposed.',
              ),
            ]
          : []),
      ]);
    }
    return this.runtime.runMutation(async () => {
      const current = this.runtime.getActivitySnapshot(parsedId.value);
      if (current === undefined) {
        return activityNotFound(parsedId.value);
      }
      if (parsedRevision.value !== current.revision) {
        return revisionConflict(this.runtime, current, parsedRevision.value);
      }
      const conflict = findActivityConflictRecord(
        this.runtime.getActivityConflicts(current.id),
        parsedConflictId.value,
      );
      if (conflict === undefined) {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_FOUND,
          message: `Conflict ${parsedConflictId.value} was not found.`,
          retryable: false,
          entity: 'conflict',
        });
      }
      const now = validNow(this.runtime);
      const prepared =
        input.decision === 'keep_current'
          ? journalOk({
              snapshot: {
                ...current,
                revision: nextRevision(current.revision),
                updatedAt: now,
              },
              changedFields: [] as readonly string[],
            })
          : prepareActivityConflictProposal(
              this.runtime,
              current,
              conflict.proposal,
              now,
            );
      if (!prepared.ok) {
        return prepared;
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot: prepared.value.snapshot,
            baseRevision: current.revision,
            changedFields: [...prepared.value.changedFields, 'conflicts'],
            conflictIdsRemoved: [conflict.conflictId],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async resolveOngoingActivities(
    input: ResolveOngoingActivitiesInput,
  ): Promise<JournalResult<readonly ActivitySnapshot[]>> {
    return this.runtime.runMutation(async () => {
      const keep = this.runtime.getActivitySnapshot(input.keepOngoing);
      if (
        keep === undefined ||
        keep.lifecycle.kind !== 'active' ||
        keep.endedAt !== undefined
      ) {
        return activityNotFound(input.keepOngoing);
      }
      const uniqueFinishIds = new Set(
        input.finish.map(item => item.activityId),
      );
      if (
        input.finish.length === 0 ||
        uniqueFinishIds.size !== input.finish.length ||
        uniqueFinishIds.has(input.keepOngoing)
      ) {
        return invalidInput([
          validationIssue(
            ['finish'],
            'Choose distinct ongoing activities other than the one to keep.',
          ),
        ]);
      }
      const allOngoingIds = this.runtime
        .getActivityListSnapshot()
        .items.filter(activity => activity.endedAt === undefined)
        .map(activity => activity.id);
      const resolvedIds = new Set([
        input.keepOngoing,
        ...input.finish.map(item => item.activityId),
      ]);
      if (
        allOngoingIds.length !== resolvedIds.size ||
        allOngoingIds.some(activityId => !resolvedIds.has(activityId))
      ) {
        return invalidInput([
          validationIssue(
            ['finish'],
            'Resolve every other ongoing activity in one atomic change.',
          ),
        ]);
      }

      const prepared: {
        readonly kind: 'activity';
        readonly snapshot: ActivitySnapshot;
        readonly baseRevision: ActivitySnapshot['revision'];
        readonly changedFields: readonly ['endedAt'];
      }[] = [];
      for (const target of input.finish) {
        const currentResult = currentActivity(this.runtime, target);
        if (!currentResult.ok) {
          return currentResult;
        }
        const current = currentResult.value;
        if (
          current.lifecycle.kind !== 'active' ||
          current.endedAt !== undefined ||
          !Number.isSafeInteger(target.endedAt) ||
          target.endedAt < current.startedAt
        ) {
          return invalidInput([
            validationIssue(
              ['finish', current.id, 'endedAt'],
              'Every resolved activity must be ongoing with a valid end time.',
            ),
          ]);
        }
        prepared.push({
          kind: 'activity',
          snapshot: {
            ...current,
            revision: nextRevision(current.revision),
            updatedAt: validNow(this.runtime),
            endedAt: target.endedAt,
          },
          baseRevision: current.revision,
          changedFields: ['endedAt'],
        });
      }
      try {
        const committed = await this.runtime.commitMutations(prepared);
        return journalOk(committedActivities(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async trash(
    input: ActivityRevisionTarget,
  ): Promise<JournalResult<ActivitySnapshot>> {
    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, input);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      if (input.expectedRevision < current.revision) {
        const conflicts = this.runtime.conflictingFieldsFor(
          current.id,
          input.expectedRevision,
          ['lifecycle'],
          'delete',
        );
        if (conflicts.length > 0) {
          return persistActivityConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            {kind: 'activity_lifecycle', lifecycle: 'trashed'},
          );
        }
      }
      if (current.lifecycle.kind === 'trashed') {
        return journalError({
          code: JOURNAL_ERROR_CODES.ALREADY_TRASHED,
          message: 'This activity is already in Trash.',
          retryable: false,
        });
      }
      const now = validNow(this.runtime);
      const snapshot: ActivitySnapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        lifecycle: {
          kind: 'trashed',
          trashedAt: now,
          purgeAfter: now + JOURNAL_TRASH_RETENTION_MS,
        },
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['lifecycle'],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async restore(
    input: ActivityRevisionTarget,
  ): Promise<JournalResult<ActivitySnapshot>> {
    return this.runtime.runMutation(async () => {
      const currentResult = currentActivity(this.runtime, input);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      if (input.expectedRevision < current.revision) {
        const conflicts = this.runtime.conflictingFieldsFor(
          current.id,
          input.expectedRevision,
          ['lifecycle'],
          'delete',
        );
        if (conflicts.length > 0) {
          return persistActivityConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            {kind: 'activity_lifecycle', lifecycle: 'active'},
          );
        }
      }
      if (current.lifecycle.kind !== 'trashed') {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_TRASHED,
          message: 'This activity is not in Trash.',
          retryable: false,
        });
      }
      if (current.endedAt === undefined) {
        const ongoing = this.runtime.activeOngoingActivity(current.id);
        if (ongoing !== undefined) {
          return ongoingExists(ongoing);
        }
      }
      const now = validNow(this.runtime);
      const snapshot: ActivitySnapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        lifecycle: {kind: 'active'},
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'activity',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['lifecycle'],
          },
        ]);
        return journalOk(committedActivity(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }
}
