import type {
  FindMealLinkCandidatesInput,
  LinkMealExternalEventInput,
  MealExternalEventTransfer,
  MealExternalTransferUndoReceipt,
  MealExternalTransferUndoResult,
  MealExternalCandidate,
  MealRevisionTarget,
  MealsWorkspace,
  RefreshMealExternalEventInput,
  ResolveMealConflictInput,
  TransferMealExternalEventInput,
  UnlinkMealExternalEventInput,
} from '../contracts/mealsWorkspace';
import {
  JOURNAL_ERROR_CODES,
  journalError,
  journalOk,
} from '../contracts/result';
import type {JournalResult} from '../contracts/result';
import {
  areExactExternalDuplicates,
  parseExternalCarbRecordSnapshot,
  parseExternalTreatmentRecordSnapshot,
} from '../domain/externalRecords';
import type {
  ExternalRecordAvailability,
  ExternalRecordSnapshot,
  ReadLinkedExternalRecordResult,
} from '../domain/externalRecords';
import {
  parseJournalConflictId,
  parseMealEntryId,
  parseRevision,
} from '../domain/identifiers';
import type {MealEntryId} from '../domain/identifiers';
import type {JournalListQuery, JournalPage} from '../domain/journal';
import type {JournalFieldConflictRecord} from './types';
import type {
  MealConflictInspection,
  MealConflictProposal,
} from '../domain/conflicts';
import {
  deriveReportedCarbohydrates,
  parseCaptureMealInput,
  validateMealSnapshot,
} from '../domain/meals';
import type {
  CaptureMealInput,
  MealExternalEventLink,
  MealImageSnapshot,
  MealSnapshot,
  NormalizedCaptureMealInput,
  ReviseMealInput,
} from '../domain/meals';
import {
  applyFieldChange,
  changedFields,
  imageSnapshotAsInput,
  initialRevision,
  invalidInput,
  mediaFailure,
  nextRevision,
  storageFailure,
  validationIssue,
  validateFieldChanges,
  validateJournalListQuery,
} from './operationHelpers';
import {parseMealLinkInput, sanitizeMealCandidates} from './externalValidation';
import {JOURNAL_TRASH_RETENTION_MS} from './types';
import {JournalWorkspaceRuntime} from './workspaceRuntime';
import {
  detectMealConflictValues,
  findMealConflictRecord,
  inspectMealConflictRecords,
  prepareMealConflictProposal,
  parseConflictExternalReference,
} from './conflictResolution';

const mealNotFound = <T>(mealId: MealEntryId): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.NOT_FOUND,
    message: `Meal ${mealId} was not found.`,
    retryable: false,
    entity: 'meal',
  });

const revisionConflict = <T>(
  runtime: JournalWorkspaceRuntime,
  meal: MealSnapshot,
  expectedRevision: MealSnapshot['revision'],
): JournalResult<T> =>
  journalError({
    code: JOURNAL_ERROR_CODES.REVISION_CONFLICT,
    message: 'This meal changed after it was opened.',
    retryable: false,
    expected: expectedRevision,
    actual: meal.revision,
    conflictingFields: runtime.conflictingFields(meal.id, expectedRevision),
  });

const activeMeal = (
  runtime: JournalWorkspaceRuntime,
  target: MealRevisionTarget,
): JournalResult<MealSnapshot> => {
  const parsedId = parseMealEntryId(target.mealId, ['mealId']);
  const parsedRevision = parseRevision(target.expectedRevision, [
    'expectedRevision',
  ]);
  if (!parsedId.ok || !parsedRevision.ok) {
    return invalidInput([
      ...(!parsedId.ok ? parsedId.issues : []),
      ...(!parsedRevision.ok ? parsedRevision.issues : []),
    ]);
  }
  const meal = runtime.getMealSnapshot(parsedId.value);
  if (meal === undefined) {
    return mealNotFound(parsedId.value);
  }
  if (parsedRevision.value > meal.revision) {
    return revisionConflict(runtime, meal, parsedRevision.value);
  }
  return journalOk(meal);
};

const validNow = (runtime: JournalWorkspaceRuntime): number => {
  const now = runtime.dependencies.clock.now();
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error('Journal clock returned an invalid timestamp.');
  }
  return now;
};

const committedMeal = (items: readonly unknown[]): MealSnapshot => {
  const meal = items[0];
  if (typeof meal !== 'object' || meal === null || !('kind' in meal)) {
    throw new Error('The Journal did not commit the meal mutation.');
  }
  if ((meal as {kind: unknown}).kind !== 'meal') {
    throw new Error('The Journal committed an unexpected entity kind.');
  }
  return meal as MealSnapshot;
};

const committedMealById = (
  items: readonly unknown[],
  mealId: MealEntryId,
): MealSnapshot => {
  const meal = items.find(
    item =>
      typeof item === 'object' &&
      item !== null &&
      'kind' in item &&
      'id' in item &&
      (item as {kind: unknown}).kind === 'meal' &&
      (item as {id: unknown}).id === mealId,
  );
  if (meal === undefined) {
    throw new Error(`The Journal did not commit meal ${mealId}.`);
  }
  return meal as MealSnapshot;
};

const lastKnownSnapshot = (
  link: MealExternalEventLink,
): ExternalRecordSnapshot | undefined =>
  link.external.kind === 'available'
    ? link.external.snapshot
    : link.external.lastKnown;

const validateRefreshedMealSnapshot = (
  link: MealExternalEventLink,
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
    link.role.kind === 'reported_carbohydrate'
      ? parseExternalCarbRecordSnapshot(result.snapshot)
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

const mealRevisionProposal = (
  input: ReviseMealInput,
  normalized: NormalizedCaptureMealInput,
  fields: readonly string[],
): MealConflictProposal => {
  const changes: Record<string, unknown> = {};
  fields.forEach(field => {
    switch (field) {
      case 'mealStart':
        changes.mealStart =
          input.mealStart?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.mealStart};
        break;
      case 'name':
        changes.name =
          input.name?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.name};
        break;
      case 'mealCarbohydrates':
        changes.mealCarbohydrates =
          input.mealCarbohydrates?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.mealCarbohydrates};
        break;
      case 'image':
        changes.image =
          input.image?.kind === 'clear'
            ? {kind: 'clear'}
            : {kind: 'set', value: normalized.image};
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
  return {kind: 'meal_revision', changes} as MealConflictProposal;
};

const persistMealConflict = async (
  runtime: JournalWorkspaceRuntime,
  current: MealSnapshot,
  expectedRevision: MealSnapshot['revision'],
  conflictingFields: readonly string[],
  proposal: MealConflictProposal,
): Promise<JournalResult<MealSnapshot>> => {
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
    entityKind: 'meal',
    conflictId: conflictId.value,
    detectedAt: now,
    expectedRevision,
    detectedAgainstRevision: current.revision,
    conflictingFields,
    proposal,
    detectedValues: detectMealConflictValues(current, conflictingFields),
  };
  const snapshot: MealSnapshot = {
    ...current,
    revision: nextRevision(current.revision),
    updatedAt: now,
    syncState: {kind: 'conflict', detectedAt: now, conflictingFields},
  };
  try {
    const committed = await runtime.commitMutations([
      {
        kind: 'meal',
        snapshot,
        baseRevision: current.revision,
        changedFields: ['conflicts'],
        conflictsAdded: [conflict],
      },
    ]);
    const conflicted = committedMeal(committed);
    return journalError({
      code: JOURNAL_ERROR_CODES.REVISION_CONFLICT,
      message: 'This meal has a conflicting concurrent edit.',
      retryable: false,
      expected: expectedRevision,
      actual: conflicted.revision,
      conflictingFields,
    });
  } catch (error) {
    return storageFailure(error);
  }
};

export class LocalMealsWorkspace implements MealsWorkspace {
  readonly scope;
  readonly getSnapshot;
  readonly getListSnapshot;
  readonly subscribe;

  constructor(private readonly runtime: JournalWorkspaceRuntime) {
    this.scope = runtime.scope;
    this.getSnapshot = runtime.getMealSnapshot;
    this.getListSnapshot = runtime.getMealListSnapshot;
    this.subscribe = runtime.subscribe;
  }

  async capture(input: CaptureMealInput): Promise<JournalResult<MealSnapshot>> {
    const normalized = parseCaptureMealInput(input);
    if (!normalized.ok) {
      return invalidInput(normalized.issues);
    }

    return this.runtime.runMutation(async () => {
      const idResult = parseMealEntryId(
        this.runtime.dependencies.ids.nextEntryId('meal'),
        ['id'],
      );
      if (!idResult.ok) {
        return invalidInput(idResult.issues);
      }
      const now = validNow(this.runtime);
      let image: MealImageSnapshot | undefined;
      if (normalized.value.image !== undefined) {
        try {
          image = await this.runtime.dependencies.mediaStore.stageMealImage(
            this.scope,
            idResult.value,
            normalized.value.image,
          );
        } catch (error) {
          return mediaFailure(error);
        }
      }
      const snapshot: MealSnapshot = {
        kind: 'meal',
        id: idResult.value,
        scope: this.scope,
        revision: initialRevision(),
        createdAt: now,
        updatedAt: now,
        lifecycle: {kind: 'active'},
        syncState: {kind: 'local_only'},
        mealStart: normalized.value.mealStart,
        ...(normalized.value.name === undefined
          ? {}
          : {name: normalized.value.name}),
        ...(normalized.value.mealCarbohydrates === undefined
          ? {}
          : {mealCarbohydrates: normalized.value.mealCarbohydrates}),
        ...(image === undefined ? {} : {image}),
        ...(normalized.value.notes === undefined
          ? {}
          : {notes: normalized.value.notes}),
        tags: normalized.value.tags,
        externalLinks: [],
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: null,
            changedFields: [
              'mealStart',
              ...(snapshot.name === undefined ? [] : ['name']),
              ...(snapshot.mealCarbohydrates === undefined
                ? []
                : ['mealCarbohydrates']),
              ...(snapshot.image === undefined ? [] : ['image']),
              ...(snapshot.notes === undefined ? [] : ['notes']),
              'tags',
            ],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        if (image !== undefined) {
          await this.runtime.dependencies.mediaStore
            .removeMealImage(this.scope, idResult.value, image)
            .catch(() => undefined);
        }
        return storageFailure(error);
      }
    });
  }

  async revise(input: ReviseMealInput): Promise<JournalResult<MealSnapshot>> {
    const inputRecord = input as unknown as Readonly<Record<string, unknown>>;
    const fieldNames = [
      'mealStart',
      'name',
      'mealCarbohydrates',
      'image',
      'notes',
      'tags',
    ] as const;
    const changeIssues = validateFieldChanges(inputRecord, fieldNames);
    if (changeIssues.length > 0) {
      return invalidInput(changeIssues);
    }
    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, input);
      if (!currentResult.ok) {
        return currentResult;
      }
      const current = currentResult.value;
      const fields = changedFields(inputRecord, fieldNames);
      if (fields.length === 0) {
        return invalidInput([
          validationIssue(
            [],
            'A meal revision must change at least one field.',
          ),
        ]);
      }

      const mealStart = applyFieldChange(current.mealStart, input.mealStart);
      const name = applyFieldChange(current.name, input.name);
      const mealCarbohydrates = applyFieldChange(
        current.mealCarbohydrates,
        input.mealCarbohydrates,
      );
      const notes = applyFieldChange(current.notes, input.notes);
      const tags = applyFieldChange(current.tags, input.tags);
      const candidateImage = applyFieldChange(
        current.image === undefined
          ? undefined
          : imageSnapshotAsInput(current.image),
        input.image,
      );
      const normalized = parseCaptureMealInput({
        mealStart,
        ...(name === undefined ? {} : {name}),
        ...(mealCarbohydrates === undefined ? {} : {mealCarbohydrates}),
        ...(candidateImage === undefined ? {} : {image: candidateImage}),
        ...(notes === undefined ? {} : {notes}),
        ...(tags === undefined ? {} : {tags}),
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
          return persistMealConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            mealRevisionProposal(input, normalized.value, fields),
          );
        }
      }

      let image = current.image;
      if (input.image?.kind === 'clear') {
        image = undefined;
      } else if (input.image?.kind === 'set') {
        try {
          image = await this.runtime.dependencies.mediaStore.stageMealImage(
            this.scope,
            current.id,
            input.image.value,
          );
        } catch (error) {
          return mediaFailure(error);
        }
      }
      const now = validNow(this.runtime);
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
        ...(image === undefined ? {image: undefined} : {image}),
        ...(normalized.value.notes === undefined
          ? {notes: undefined}
          : {notes: normalized.value.notes}),
        tags: normalized.value.tags,
      } as MealSnapshot;
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: fields,
          },
        ]);
        const result = committedMeal(committed);
        if (
          current.image !== undefined &&
          (input.image?.kind === 'clear' || input.image?.kind === 'set')
        ) {
          await this.runtime.dependencies.mediaStore
            .removeMealImage(this.scope, current.id, current.image)
            .catch(() => undefined);
        }
        return journalOk(result);
      } catch (error) {
        if (input.image?.kind === 'set' && image !== undefined) {
          await this.runtime.dependencies.mediaStore
            .removeMealImage(this.scope, current.id, image)
            .catch(() => undefined);
        }
        return storageFailure(error);
      }
    });
  }

  async get(mealId: MealEntryId): Promise<JournalResult<MealSnapshot>> {
    const id = parseMealEntryId(mealId, ['mealId']);
    if (!id.ok) {
      return invalidInput(id.issues);
    }
    const meal = this.runtime.getMealSnapshot(id.value);
    return meal === undefined ? mealNotFound(id.value) : journalOk(meal);
  }

  async list(
    query?: JournalListQuery,
  ): Promise<JournalResult<JournalPage<MealSnapshot>>> {
    const invalid = validateJournalListQuery(query);
    return invalid ?? journalOk(this.getListSnapshot(query));
  }

  async findLinkCandidates(
    input: FindMealLinkCandidatesInput,
  ): Promise<JournalResult<readonly MealExternalCandidate[]>> {
    if (
      !Number.isSafeInteger(input.nearMealStart) ||
      input.nearMealStart <= 0 ||
      (input.beforeMs !== undefined && input.beforeMs < 0) ||
      (input.afterMs !== undefined && input.afterMs < 0)
    ) {
      return invalidInput([
        validationIssue([], 'The candidate search window is invalid.'),
      ]);
    }
    const reader = this.runtime.dependencies.externalRecords;
    if (reader === undefined) {
      return journalOk<readonly MealExternalCandidate[]>([]);
    }
    try {
      const result = await reader.findMealCandidates(this.scope, input);
      if (!result.ok) {
        return result;
      }
      const sanitized = sanitizeMealCandidates(
        result.value,
        this.scope.nightscoutSourceId,
      );
      return sanitized.issues.length === 0
        ? journalOk(sanitized.meals)
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
    input: LinkMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>> {
    const parsedInput = parseMealLinkInput(
      input,
      this.scope.nightscoutSourceId,
    );
    if (!parsedInput.ok) {
      return invalidInput(parsedInput.issues);
    }
    const linkInput = parsedInput.value;
    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, linkInput);
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
          return persistMealConflict(
            this.runtime,
            current,
            linkInput.expectedRevision,
            conflicts,
            {
              kind: 'meal_link_external_event',
              record: linkInput.record,
              snapshot: linkInput.snapshot,
              role: linkInput.role,
            } as MealConflictProposal,
          );
        }
      }
      const linkedEntryId = this.runtime.findLinkedMeal(linkInput.record);
      if (linkedEntryId !== undefined) {
        return journalError({
          code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
          message: 'This external record is already linked.',
          retryable: false,
          linkedEntryId,
        });
      }
      const now = validNow(this.runtime);
      const link: MealExternalEventLink = {
        record: linkInput.record,
        role: linkInput.role,
        linkedAt: now,
        external: {
          kind: 'available',
          checkedAt: now,
          snapshot: linkInput.snapshot,
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
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async unlinkExternalEvent(
    input: UnlinkMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>> {
    const parsedRecord = parseConflictExternalReference(
      input.record,
      this.scope.nightscoutSourceId,
      ['record'],
    );
    if (!parsedRecord.ok) {
      return invalidInput(parsedRecord.issues);
    }
    const unlinkInput: UnlinkMealExternalEventInput = {
      ...input,
      record: parsedRecord.value,
    };
    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, unlinkInput);
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
          return persistMealConflict(
            this.runtime,
            current,
            unlinkInput.expectedRevision,
            conflicts,
            {
              kind: 'meal_unlink_external_event',
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
          message: 'The external record is not linked to this meal.',
          retryable: false,
          entity: 'external_record',
        });
      }
      const now = validNow(this.runtime);
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
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async refreshExternalEvent(
    input: RefreshMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>> {
    const parsedRecord = parseConflictExternalReference(
      input.record,
      this.scope.nightscoutSourceId,
      ['record'],
    );
    const initial = activeMeal(this.runtime, input);
    if (!parsedRecord.ok || !initial.ok) {
      return !parsedRecord.ok ? invalidInput(parsedRecord.issues) : initial;
    }
    const initialLink = initial.value.externalLinks.find(link =>
      areExactExternalDuplicates(link.record, parsedRecord.value),
    );
    if (initialLink === undefined) {
      return journalError({
        code: JOURNAL_ERROR_CODES.NOT_FOUND,
        message: 'The external record is not linked to this meal.',
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
    const validated = validateRefreshedMealSnapshot(initialLink, read);
    if (!validated.ok) {
      return validated;
    }

    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, input);
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
          message: 'The external record is no longer linked to this meal.',
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
      const refreshedLink = {...currentLink, external} as MealExternalEventLink;
      const externalLinks = current.externalLinks.map(link =>
        areExactExternalDuplicates(link.record, parsedRecord.value)
          ? refreshedLink
          : link,
      );
      const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
      const snapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        externalLinks,
        ...(reportedCarbohydrates === undefined
          ? {reportedCarbohydrates: undefined}
          : {reportedCarbohydrates}),
      } as MealSnapshot;
      const issues = validateMealSnapshot(snapshot);
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async transferExternalEvent(
    input: TransferMealExternalEventInput,
  ): Promise<JournalResult<MealExternalEventTransfer>> {
    const parsedLink = parseMealLinkInput(
      input,
      this.scope.nightscoutSourceId,
    );
    const sourceId = parseMealEntryId(input.sourceMealId, ['sourceMealId']);
    const sourceRevision = parseRevision(input.sourceExpectedRevision, [
      'sourceExpectedRevision',
    ]);
    if (
      !parsedLink.ok ||
      !sourceId.ok ||
      !sourceRevision.ok ||
      input.confirmed !== true ||
      (parsedLink.ok && sourceId.ok && parsedLink.value.mealId === sourceId.value)
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
        parsedLink.value.mealId === sourceId.value
          ? [
              validationIssue(
                ['sourceMealId'],
                'The source and destination meals must be different.',
              ),
            ]
          : []),
      ]);
    }
    const linkInput = parsedLink.value;
    return this.runtime.runMutation(async () => {
      const source = this.runtime.getMealSnapshot(sourceId.value);
      const destinationResult = activeMeal(this.runtime, linkInput);
      if (source === undefined) {
        return mealNotFound<MealExternalEventTransfer>(sourceId.value);
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
          message: 'The source meal no longer owns this external record.',
          retryable: false,
          entity: 'external_record',
        });
      }
      const existingOwner = this.runtime.findLinkedMeal(linkInput.record);
      if (existingOwner !== source.id) {
        return journalError({
          code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
          message: 'This external record is linked to a different meal.',
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
        external: {kind: 'available', checkedAt: now, snapshot: linkInput.snapshot},
      } as MealExternalEventLink;
      const destinationLinks = [...destination.externalLinks, destinationLink];
      const sourceReported = deriveReportedCarbohydrates(sourceLinks);
      const destinationReported = deriveReportedCarbohydrates(destinationLinks);
      const nextSource = {
        ...source,
        revision: nextRevision(source.revision),
        updatedAt: now,
        externalLinks: sourceLinks,
        ...(sourceReported === undefined
          ? {reportedCarbohydrates: undefined}
          : {reportedCarbohydrates: sourceReported}),
      } as MealSnapshot;
      const nextDestination = {
        ...destination,
        revision: nextRevision(destination.revision),
        updatedAt: now,
        externalLinks: destinationLinks,
        ...(destinationReported === undefined
          ? {reportedCarbohydrates: undefined}
          : {reportedCarbohydrates: destinationReported}),
      } as MealSnapshot;
      const issues = [
        ...validateMealSnapshot(nextSource),
        ...validateMealSnapshot(nextDestination),
      ];
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot: nextSource,
            baseRevision: source.revision,
            changedFields: ['externalLinks'],
          },
          {
            kind: 'meal',
            snapshot: nextDestination,
            baseRevision: destination.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        const committedSource = committedMealById(committed, source.id);
        const committedDestination = committedMealById(
          committed,
          destination.id,
        );
        return journalOk({
          source: committedSource,
          destination: committedDestination,
          undo: {
            kind: 'meal_external_transfer',
            sourceMealId: source.id,
            destinationMealId: destination.id,
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
    receipt: MealExternalTransferUndoReceipt,
  ): Promise<JournalResult<MealExternalTransferUndoResult>> {
    if (receipt.kind !== 'meal_external_transfer') {
      return invalidInput([
        validationIssue(['kind'], 'Expected a meal transfer receipt.'),
      ]);
    }
    const sourceId = parseMealEntryId(receipt.sourceMealId, ['sourceMealId']);
    const destinationId = parseMealEntryId(receipt.destinationMealId, [
      'destinationMealId',
    ]);
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
          ? [validationIssue(['destinationMealId'], 'The receipt is invalid.')]
          : []),
      ]);
    }
    return this.runtime.runMutation(async () => {
      const originalSource = this.runtime.getMealSnapshot(sourceId.value);
      const previousDestination = this.runtime.getMealSnapshot(
        destinationId.value,
      );
      if (originalSource === undefined) {
        return mealNotFound<MealExternalTransferUndoResult>(sourceId.value);
      }
      if (previousDestination === undefined) {
        return mealNotFound<MealExternalTransferUndoResult>(
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
      const restoredSourceLinks = [
        ...originalSource.externalLinks,
        receipt.previousSourceLink,
      ];
      const destinationLinks = previousDestination.externalLinks.filter(
        link => !areExactExternalDuplicates(link.record, parsedRecord.value),
      );
      const sourceReported = deriveReportedCarbohydrates(restoredSourceLinks);
      const destinationReported = deriveReportedCarbohydrates(destinationLinks);
      const restoredSource = {
        ...originalSource,
        revision: nextRevision(originalSource.revision),
        updatedAt: now,
        externalLinks: restoredSourceLinks,
        ...(sourceReported === undefined
          ? {reportedCarbohydrates: undefined}
          : {reportedCarbohydrates: sourceReported}),
      } as MealSnapshot;
      const restoredDestination = {
        ...previousDestination,
        revision: nextRevision(previousDestination.revision),
        updatedAt: now,
        externalLinks: destinationLinks,
        ...(destinationReported === undefined
          ? {reportedCarbohydrates: undefined}
          : {reportedCarbohydrates: destinationReported}),
      } as MealSnapshot;
      const issues = [
        ...validateMealSnapshot(restoredSource),
        ...validateMealSnapshot(restoredDestination),
      ];
      if (issues.length > 0) {
        return invalidInput(issues);
      }
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot: restoredDestination,
            baseRevision: previousDestination.revision,
            changedFields: ['externalLinks'],
          },
          {
            kind: 'meal',
            snapshot: restoredSource,
            baseRevision: originalSource.revision,
            changedFields: ['externalLinks'],
          },
        ]);
        return journalOk({
          source: committedMealById(committed, previousDestination.id),
          destination: committedMealById(committed, originalSource.id),
        });
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async inspectConflicts(
    mealId: MealEntryId,
  ): Promise<JournalResult<readonly MealConflictInspection[]>> {
    const parsedId = parseMealEntryId(mealId, ['mealId']);
    if (!parsedId.ok) {
      return invalidInput(parsedId.issues);
    }
    const current = this.runtime.getMealSnapshot(parsedId.value);
    if (current === undefined) {
      return mealNotFound<readonly MealConflictInspection[]>(parsedId.value);
    }
    return journalOk(
      inspectMealConflictRecords(
        current,
        this.runtime.getMealConflicts(current.id),
      ),
    );
  }

  async resolveConflict(
    input: ResolveMealConflictInput,
  ): Promise<JournalResult<MealSnapshot>> {
    const parsedId = parseMealEntryId(input.mealId, ['mealId']);
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
      const current = this.runtime.getMealSnapshot(parsedId.value);
      if (current === undefined) {
        return mealNotFound(parsedId.value);
      }
      if (parsedRevision.value !== current.revision) {
        return revisionConflict(this.runtime, current, parsedRevision.value);
      }
      const conflict = findMealConflictRecord(
        this.runtime.getMealConflicts(current.id),
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
          : prepareMealConflictProposal(
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
            kind: 'meal',
            snapshot: prepared.value.snapshot,
            baseRevision: current.revision,
            changedFields: [...prepared.value.changedFields, 'conflicts'],
            conflictIdsRemoved: [conflict.conflictId],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async trash(input: MealRevisionTarget): Promise<JournalResult<MealSnapshot>> {
    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, input);
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
          return persistMealConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            {kind: 'meal_lifecycle', lifecycle: 'trashed'},
          );
        }
      }
      if (current.lifecycle.kind === 'trashed') {
        return journalError({
          code: JOURNAL_ERROR_CODES.ALREADY_TRASHED,
          message: 'This meal is already in Trash.',
          retryable: false,
        });
      }
      const now = validNow(this.runtime);
      const snapshot: MealSnapshot = {
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
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['lifecycle'],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }

  async restore(
    input: MealRevisionTarget,
  ): Promise<JournalResult<MealSnapshot>> {
    return this.runtime.runMutation(async () => {
      const currentResult = activeMeal(this.runtime, input);
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
          return persistMealConflict(
            this.runtime,
            current,
            input.expectedRevision,
            conflicts,
            {kind: 'meal_lifecycle', lifecycle: 'active'},
          );
        }
      }
      if (current.lifecycle.kind !== 'trashed') {
        return journalError({
          code: JOURNAL_ERROR_CODES.NOT_TRASHED,
          message: 'This meal is not in Trash.',
          retryable: false,
        });
      }
      const now = validNow(this.runtime);
      const snapshot: MealSnapshot = {
        ...current,
        revision: nextRevision(current.revision),
        updatedAt: now,
        lifecycle: {kind: 'active'},
      };
      try {
        const committed = await this.runtime.commitMutations([
          {
            kind: 'meal',
            snapshot,
            baseRevision: current.revision,
            changedFields: ['lifecycle'],
          },
        ]);
        return journalOk(committedMeal(committed));
      } catch (error) {
        return storageFailure(error);
      }
    });
  }
}
