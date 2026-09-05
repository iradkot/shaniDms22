import {
  areExactExternalDuplicates,
  ExternalRecordReference,
} from '../domain/externalRecords';
import type {ActivitySnapshot} from '../domain/activities';
import type {
  MealEntryId,
  ActivityEntryId,
  JournalConflictId,
  Revision,
} from '../domain/identifiers';
import {parseJournalConflictId} from '../domain/identifiers';
import type {
  JournalListQuery,
  JournalPage,
  JournalSyncState,
  JournalWorkspaceScope,
} from '../domain/journal';
import type {MealSnapshot} from '../domain/meals';
import type {MealImageSnapshot} from '../domain/meals';
import type {JournalTombstone} from '../domain/tombstones';
import type {
  ActivityConflictDetectedValues,
  ActivityConflictProposal,
  JournalDetectedFieldValue,
  MealConflictDetectedValues,
  MealConflictProposal,
} from '../domain/conflicts';
import type {
  JournalEngineDependencies,
  JournalEntityMetadata,
  JournalEntitySnapshot,
  JournalFieldConflictRecord,
  JournalOutboxOperation,
  JournalPurgeOutboxOperation,
  PersistedJournalState,
} from './types';
import {deepFreeze, immutableJsonClone} from './immutable';
import {nextRevision} from './operationHelpers';
import type {RemoteJournalChange} from '../sync/remoteChangeTypes';
import {
  hydrateRemoteActivityDocument,
  hydrateRemoteMealDocument,
} from '../sync/remoteDocumentHydration';

export interface CommittedTrashPurge {
  readonly tombstones: readonly JournalTombstone[];
  readonly mealImages: readonly {
    readonly mealId: MealEntryId;
    readonly image: MealImageSnapshot;
  }[];
}

type EntityMutation =
  | {
      readonly kind: 'meal';
      readonly snapshot: MealSnapshot;
      readonly baseRevision: Revision | null;
      readonly changedFields: readonly string[];
      readonly conflictsAdded?: readonly JournalFieldConflictRecord[];
      readonly conflictIdsRemoved?: readonly JournalConflictId[];
      readonly outboxBaseRevision?: Revision | null;
      readonly replaceEntityOutbox?: boolean;
    }
  | {
      readonly kind: 'activity';
      readonly snapshot: ActivitySnapshot;
      readonly baseRevision: Revision | null;
      readonly changedFields: readonly string[];
      readonly conflictsAdded?: readonly JournalFieldConflictRecord[];
      readonly conflictIdsRemoved?: readonly JournalConflictId[];
      readonly outboxBaseRevision?: Revision | null;
      readonly replaceEntityOutbox?: boolean;
    };

interface CachedPage<TSnapshot> {
  readonly version: number;
  readonly page: JournalPage<TSnapshot>;
}

const queryKey = (query: JournalListQuery | undefined): string =>
  JSON.stringify({
    fromInclusive: query?.timeRange?.fromInclusive ?? null,
    toExclusive: query?.timeRange?.toExclusive ?? null,
    includeTrashed: query?.includeTrashed ?? false,
    cursor: query?.cursor ?? null,
    limit: query?.limit ?? null,
  });

const decodeOffset = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }
  const match = /^journal-offset:(\d+)$/.exec(cursor);
  return match === null ? 0 : Number(match[1]);
};

const pageFor = <TSnapshot extends JournalEntitySnapshot>(
  items: readonly TSnapshot[],
  query: JournalListQuery | undefined,
  eventTime: (snapshot: TSnapshot) => number,
): JournalPage<TSnapshot> => {
  const visible = items
    .filter(
      item =>
        query?.includeTrashed === true || item.lifecycle.kind === 'active',
    )
    .filter(item => {
      if (query?.timeRange === undefined) {
        return true;
      }
      const timestamp = eventTime(item);
      return (
        timestamp >= query.timeRange.fromInclusive &&
        timestamp < query.timeRange.toExclusive
      );
    })
    .slice()
    .sort((left, right) => eventTime(right) - eventTime(left));
  const offset = Math.min(decodeOffset(query?.cursor), visible.length);
  const requestedLimit = query?.limit;
  const limit =
    requestedLimit === undefined ||
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit <= 0
      ? visible.length
      : Math.min(requestedLimit, 200);
  const result = visible.slice(offset, offset + limit);
  const nextOffset = offset + result.length;
  return {
    items: result,
    ...(nextOffset < visible.length
      ? {nextCursor: `journal-offset:${nextOffset}`}
      : {}),
  };
};

const pendingStateFor = (
  outbox: readonly JournalOutboxOperation[],
  entityId: string,
  queuedAt: number,
) => {
  const existing = outbox.filter(item => item.entityId === entityId);
  return {
    kind: 'pending' as const,
    queuedAt: existing[0]?.queuedAt ?? queuedAt,
    operationCount: existing.length + 1,
  };
};

const initialFields = (kind: 'meal' | 'activity'): readonly string[] =>
  kind === 'meal'
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

type MutableMealSnapshot = {
  -readonly [TKey in keyof MealSnapshot]: MealSnapshot[TKey];
};
type MutableActivitySnapshot = {
  -readonly [TKey in keyof ActivitySnapshot]: ActivitySnapshot[TKey];
};

const mergeRemoteMealFields = (
  current: MealSnapshot,
  remote: MealSnapshot,
  fields: readonly string[],
): MealSnapshot => {
  const merged: MutableMealSnapshot = {...current};
  fields.forEach(field => {
    switch (field) {
      case 'mealStart':
        merged.mealStart = remote.mealStart;
        break;
      case 'name':
        if (remote.name === undefined) {
          delete merged.name;
        } else {
          merged.name = remote.name;
        }
        break;
      case 'mealCarbohydrates':
        if (remote.mealCarbohydrates === undefined) {
          delete merged.mealCarbohydrates;
        } else {
          merged.mealCarbohydrates = remote.mealCarbohydrates;
        }
        break;
      case 'notes':
        if (remote.notes === undefined) {
          delete merged.notes;
        } else {
          merged.notes = remote.notes;
        }
        break;
      case 'tags':
        merged.tags = remote.tags;
        break;
      case 'externalLinks':
        merged.externalLinks = remote.externalLinks;
        if (remote.reportedCarbohydrates === undefined) {
          delete merged.reportedCarbohydrates;
        } else {
          merged.reportedCarbohydrates = remote.reportedCarbohydrates;
        }
        break;
      case 'lifecycle':
        merged.lifecycle = remote.lifecycle;
        break;
    }
  });
  return merged;
};

const mergeRemoteActivityFields = (
  current: ActivitySnapshot,
  remote: ActivitySnapshot,
  fields: readonly string[],
): ActivitySnapshot => {
  const merged: MutableActivitySnapshot = {...current};
  fields.forEach(field => {
    switch (field) {
      case 'category':
        merged.category = remote.category;
        break;
      case 'customName':
        if (remote.customName === undefined) {
          delete merged.customName;
        } else {
          merged.customName = remote.customName;
        }
        break;
      case 'startedAt':
        merged.startedAt = remote.startedAt;
        break;
      case 'endedAt':
        if (remote.endedAt === undefined) {
          delete merged.endedAt;
        } else {
          merged.endedAt = remote.endedAt;
        }
        break;
      case 'intensity':
        if (remote.intensity === undefined) {
          delete merged.intensity;
        } else {
          merged.intensity = remote.intensity;
        }
        break;
      case 'notes':
        if (remote.notes === undefined) {
          delete merged.notes;
        } else {
          merged.notes = remote.notes;
        }
        break;
      case 'tags':
        merged.tags = remote.tags;
        break;
      case 'externalLinks':
        merged.externalLinks = remote.externalLinks;
        break;
      case 'lifecycle':
        merged.lifecycle = remote.lifecycle;
        break;
    }
  });
  return merged;
};

const detected = <T>(value: T | undefined): JournalDetectedFieldValue<T> =>
  value === undefined ? {kind: 'absent'} : {kind: 'present', value};

const remoteMealConflict = (
  current: MealSnapshot,
  remote: MealSnapshot,
  conflictingFields: readonly string[],
):
  | {
      readonly proposal: MealConflictProposal;
      readonly detectedValues: MealConflictDetectedValues;
    }
  | undefined => {
  if (conflictingFields.length === 1 && conflictingFields[0] === 'lifecycle') {
    return {
      proposal: {
        kind: 'meal_lifecycle',
        lifecycle: remote.lifecycle.kind,
      },
      detectedValues: {lifecycle: detected(current.lifecycle)},
    };
  }
  if (
    conflictingFields.length === 1 &&
    conflictingFields[0] === 'externalLinks'
  ) {
    return {
      proposal: {
        kind: 'meal_external_links',
        externalLinks: remote.externalLinks,
      },
      detectedValues: {externalLinks: detected(current.externalLinks)},
    };
  }
  if (
    conflictingFields.some(field =>
      ['image', 'externalLinks', 'lifecycle'].includes(field),
    )
  ) {
    return undefined;
  }
  const changes: {
    mealStart?: {kind: 'set'; value: number};
    name?: {kind: 'set'; value: string} | {kind: 'clear'};
    mealCarbohydrates?:
      | {kind: 'set'; value: NonNullable<MealSnapshot['mealCarbohydrates']>}
      | {kind: 'clear'};
    notes?: {kind: 'set'; value: string} | {kind: 'clear'};
    tags?: {kind: 'set'; value: readonly string[]};
  } = {};
  const detectedValues: {
    mealStart?: JournalDetectedFieldValue<number>;
    name?: JournalDetectedFieldValue<string>;
    mealCarbohydrates?: JournalDetectedFieldValue<
      NonNullable<MealSnapshot['mealCarbohydrates']>
    >;
    notes?: JournalDetectedFieldValue<string>;
    tags?: JournalDetectedFieldValue<readonly string[]>;
  } = {};
  conflictingFields.forEach(field => {
    switch (field) {
      case 'mealStart':
        changes.mealStart = {kind: 'set', value: remote.mealStart};
        detectedValues.mealStart = detected(current.mealStart);
        break;
      case 'name':
        changes.name =
          remote.name === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.name};
        detectedValues.name = detected(current.name);
        break;
      case 'mealCarbohydrates':
        changes.mealCarbohydrates =
          remote.mealCarbohydrates === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.mealCarbohydrates};
        detectedValues.mealCarbohydrates = detected(current.mealCarbohydrates);
        break;
      case 'notes':
        changes.notes =
          remote.notes === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.notes};
        detectedValues.notes = detected(current.notes);
        break;
      case 'tags':
        changes.tags = {kind: 'set', value: remote.tags};
        detectedValues.tags = detected(current.tags);
        break;
    }
  });
  return {
    proposal: {kind: 'meal_revision', changes},
    detectedValues,
  };
};

const remoteActivityConflict = (
  current: ActivitySnapshot,
  remote: ActivitySnapshot,
  conflictingFields: readonly string[],
):
  | {
      readonly proposal: ActivityConflictProposal;
      readonly detectedValues: ActivityConflictDetectedValues;
    }
  | undefined => {
  if (conflictingFields.length === 1 && conflictingFields[0] === 'lifecycle') {
    return {
      proposal: {
        kind: 'activity_lifecycle',
        lifecycle: remote.lifecycle.kind,
      },
      detectedValues: {lifecycle: detected(current.lifecycle)},
    };
  }
  if (
    conflictingFields.length === 1 &&
    conflictingFields[0] === 'externalLinks'
  ) {
    return {
      proposal: {
        kind: 'activity_external_links',
        externalLinks: remote.externalLinks,
      },
      detectedValues: {externalLinks: detected(current.externalLinks)},
    };
  }
  if (
    conflictingFields.some(field =>
      ['externalLinks', 'lifecycle'].includes(field),
    )
  ) {
    return undefined;
  }
  const changes: {
    category?: {kind: 'set'; value: ActivitySnapshot['category']};
    customName?: {kind: 'set'; value: string} | {kind: 'clear'};
    startedAt?: {kind: 'set'; value: number};
    endedAt?: {kind: 'set'; value: number} | {kind: 'clear'};
    intensity?:
      | {kind: 'set'; value: NonNullable<ActivitySnapshot['intensity']>}
      | {kind: 'clear'};
    notes?: {kind: 'set'; value: string} | {kind: 'clear'};
    tags?: {kind: 'set'; value: readonly string[]};
  } = {};
  const detectedValues: {
    category?: JournalDetectedFieldValue<ActivitySnapshot['category']>;
    customName?: JournalDetectedFieldValue<string>;
    startedAt?: JournalDetectedFieldValue<number>;
    endedAt?: JournalDetectedFieldValue<number>;
    intensity?: JournalDetectedFieldValue<
      NonNullable<ActivitySnapshot['intensity']>
    >;
    notes?: JournalDetectedFieldValue<string>;
    tags?: JournalDetectedFieldValue<readonly string[]>;
  } = {};
  conflictingFields.forEach(field => {
    switch (field) {
      case 'category':
        changes.category = {kind: 'set', value: remote.category};
        detectedValues.category = detected(current.category);
        break;
      case 'customName':
        changes.customName =
          remote.customName === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.customName};
        detectedValues.customName = detected(current.customName);
        break;
      case 'startedAt':
        changes.startedAt = {kind: 'set', value: remote.startedAt};
        detectedValues.startedAt = detected(current.startedAt);
        break;
      case 'endedAt':
        changes.endedAt =
          remote.endedAt === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.endedAt};
        detectedValues.endedAt = detected(current.endedAt);
        break;
      case 'intensity':
        changes.intensity =
          remote.intensity === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.intensity};
        detectedValues.intensity = detected(current.intensity);
        break;
      case 'notes':
        changes.notes =
          remote.notes === undefined
            ? {kind: 'clear'}
            : {kind: 'set', value: remote.notes};
        detectedValues.notes = detected(current.notes);
        break;
      case 'tags':
        changes.tags = {kind: 'set', value: remote.tags};
        detectedValues.tags = detected(current.tags);
        break;
    }
  });
  return {
    proposal: {kind: 'activity_revision', changes},
    detectedValues,
  };
};

const updatedMetadata = (
  current: JournalEntityMetadata | undefined,
  mutation: EntityMutation,
): JournalEntityMetadata => {
  const changedFields = [...new Set(mutation.changedFields)];
  const versionedFields =
    mutation.baseRevision === null
      ? initialFields(mutation.kind)
      : changedFields.filter(field => field !== 'conflicts');
  const fieldRevisions = {...(current?.fieldRevisions ?? {})};
  versionedFields.forEach(field => {
    fieldRevisions[field] = mutation.snapshot.revision;
  });
  const recentRevisions = [
    ...(current?.recentRevisions ?? []),
    {
      revision: mutation.snapshot.revision,
      changedAt: mutation.snapshot.updatedAt,
      changedFields,
    },
  ].slice(-12);
  return {
    entityKind: mutation.kind,
    entityId: mutation.snapshot.id,
    fieldRevisions,
    recentRevisions,
    conflicts: [
      ...(current?.conflicts ?? []).filter(
        conflict => !mutation.conflictIdsRemoved?.includes(conflict.conflictId),
      ),
      ...(mutation.conflictsAdded ?? []),
    ],
  };
};

export class JournalWorkspaceRuntime {
  private stateVersion = 0;
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly mealPages = new Map<string, CachedPage<MealSnapshot>>();
  private readonly activityPages = new Map<
    string,
    CachedPage<ActivitySnapshot>
  >();

  constructor(
    readonly dependencies: JournalEngineDependencies,
    state: PersistedJournalState,
    private generation: number,
  ) {
    this.state = immutableJsonClone(state);
  }

  private state: PersistedJournalState;

  get scope(): JournalWorkspaceScope {
    return this.state.scope;
  }

  getOutboxSnapshot = (): readonly JournalOutboxOperation[] =>
    this.state.outbox;

  getTombstoneSnapshot = (): readonly JournalTombstone[] =>
    this.state.tombstones;

  getRemoteCursor = (): string | undefined => this.state.remoteCursor;

  getMealSnapshot = (id: MealEntryId): MealSnapshot | undefined =>
    this.state.meals.find(item => item.id === id);

  getActivitySnapshot = (id: ActivityEntryId): ActivitySnapshot | undefined =>
    this.state.activities.find(item => item.id === id);

  getEntitySnapshot = (
    kind: 'meal' | 'activity',
    id: MealEntryId | ActivityEntryId,
  ): JournalEntitySnapshot | undefined =>
    kind === 'meal'
      ? this.state.meals.find(item => item.id === id)
      : this.state.activities.find(item => item.id === id);

  getMealConflicts = (id: MealEntryId): readonly JournalFieldConflictRecord[] =>
    this.state.metadata.find(
      item => item.entityKind === 'meal' && item.entityId === id,
    )?.conflicts ?? [];

  getActivityConflicts = (
    id: ActivityEntryId,
  ): readonly JournalFieldConflictRecord[] =>
    this.state.metadata.find(
      item => item.entityKind === 'activity' && item.entityId === id,
    )?.conflicts ?? [];

  getMealListSnapshot = (
    query?: JournalListQuery,
  ): JournalPage<MealSnapshot> => {
    const key = queryKey(query);
    const cached = this.mealPages.get(key);
    if (cached?.version === this.stateVersion) {
      return cached.page;
    }
    const page = pageFor(this.state.meals, query, meal => meal.mealStart);
    this.mealPages.set(key, {version: this.stateVersion, page});
    return page;
  };

  getActivityListSnapshot = (
    query?: JournalListQuery,
  ): JournalPage<ActivitySnapshot> => {
    const key = queryKey(query);
    const cached = this.activityPages.get(key);
    if (cached?.version === this.stateVersion) {
      return cached.page;
    }
    const page = pageFor(
      this.state.activities,
      query,
      activity => activity.startedAt,
    );
    this.activityPages.set(key, {version: this.stateVersion, page});
    return page;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  findLinkedMeal(record: ExternalRecordReference): MealEntryId | undefined {
    return this.state.meals.find(item =>
      item.externalLinks.some(link =>
        areExactExternalDuplicates(link.record, record),
      ),
    )?.id;
  }

  findLinkedActivity(
    record: ExternalRecordReference,
  ): ActivityEntryId | undefined {
    return this.state.activities.find(item =>
      item.externalLinks.some(link =>
        areExactExternalDuplicates(link.record, record),
      ),
    )?.id;
  }

  activeOngoingActivity(
    excluding?: ActivityEntryId,
  ): ActivitySnapshot | undefined {
    return this.state.activities.find(
      item =>
        item.id !== excluding &&
        item.lifecycle.kind === 'active' &&
        item.endedAt === undefined,
    );
  }

  conflictingFields(
    entityId: MealEntryId | ActivityEntryId,
    expectedRevision: Revision,
  ): readonly string[] {
    const metadata = this.state.metadata.find(
      item => item.entityId === entityId,
    );
    const fields = Object.entries(metadata?.fieldRevisions ?? {})
      .filter(([, revision]) => revision > expectedRevision)
      .map(([field]) => field);
    const unique = [...new Set(fields)];
    return unique.length > 0 ? unique : ['revision'];
  }

  conflictingFieldsFor(
    entityId: MealEntryId | ActivityEntryId,
    expectedRevision: Revision,
    requestedFields: readonly string[],
    mode: 'edit' | 'delete' = 'edit',
  ): readonly string[] {
    const metadata = this.state.metadata.find(
      item => item.entityId === entityId,
    );
    if (metadata === undefined) {
      return ['revision'];
    }
    const relevant =
      mode === 'delete'
        ? Object.keys(metadata.fieldRevisions)
        : [...requestedFields, 'lifecycle'];
    return [
      ...new Set(
        relevant.filter(
          field =>
            (metadata.fieldRevisions[field] ?? (0 as Revision)) >
            expectedRevision,
        ),
      ),
    ];
  }

  runMutation<T>(operation: () => Promise<T>): Promise<T> {
    return this.serialize(operation);
  }

  acknowledgeRemoteOperation(
    operationId: string,
    acceptedRevision: Revision,
    syncedAt: number,
    preparedMealImage?: MealImageSnapshot,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const acknowledged = this.state.outbox.find(
        operation => operation.operationId === operationId,
      );
      if (acknowledged === undefined) {
        return false;
      }
      if (acknowledged.localRevision !== acceptedRevision) {
        throw new Error('The remote acknowledgement revision is invalid.');
      }
      const remainingOutbox = this.state.outbox.filter(
        operation =>
          operation.entityKind !== acknowledged.entityKind ||
          operation.entityId !== acknowledged.entityId ||
          operation.localRevision > acceptedRevision,
      );
      const pending = remainingOutbox.filter(
        operation =>
          operation.entityKind === acknowledged.entityKind &&
          operation.entityId === acknowledged.entityId,
      );
      const metadata = this.state.metadata.find(
        item =>
          item.entityKind === acknowledged.entityKind &&
          item.entityId === acknowledged.entityId,
      );
      const syncState: JournalSyncState =
        metadata !== undefined && metadata.conflicts.length > 0
          ? {
              kind: 'conflict' as const,
              detectedAt:
                metadata.conflicts[metadata.conflicts.length - 1]!.detectedAt,
              conflictingFields: [
                ...new Set(
                  metadata.conflicts.reduce<string[]>(
                    (fields, conflict) => [
                      ...fields,
                      ...conflict.conflictingFields,
                    ],
                    [],
                  ),
                ),
              ],
            }
          : pending.length > 0
          ? {
              kind: 'pending' as const,
              queuedAt: pending[0]!.queuedAt,
              operationCount: pending.length,
            }
          : {
              kind: 'synced' as const,
              syncedAt,
              syncedRevision: acceptedRevision,
            };
      const nextState: PersistedJournalState = {
        ...this.state,
        outbox: remainingOutbox,
        meals:
          acknowledged.entityKind === 'meal'
            ? this.state.meals.map(meal =>
                meal.id === acknowledged.entityId
                  ? {
                      ...meal,
                      syncState,
                      ...(preparedMealImage !== undefined &&
                      meal.image !== undefined &&
                      meal.image.mimeType === preparedMealImage.mimeType &&
                      meal.image.syncState.kind !== 'local_only' &&
                      preparedMealImage.syncState.kind === 'available' &&
                      meal.image.syncState.objectName ===
                        preparedMealImage.syncState.objectName
                        ? {image: preparedMealImage}
                        : {}),
                    }
                  : meal,
              )
            : this.state.meals,
        activities:
          acknowledged.entityKind === 'activity'
            ? this.state.activities.map(activity =>
                activity.id === acknowledged.entityId
                  ? {...activity, syncState}
                  : activity,
              )
            : this.state.activities,
      };
      await this.commitState(nextState);
      return true;
    });
  }

  applyRemoteChanges(
    changes: readonly RemoteJournalChange[],
    cursor: string | undefined,
    syncedAt: number,
  ): Promise<number> {
    return this.serialize(async () => {
      let nextState = this.state;
      let applied = 0;
      for (const change of changes) {
        if (change.changeKind === 'purge') {
          const tombstone = change.tombstone;
          const pending = nextState.outbox.some(
            operation =>
              operation.entityKind === tombstone.entityKind &&
              operation.entityId === tombstone.entityId,
          );
          const current =
            tombstone.entityKind === 'meal'
              ? nextState.meals.find(item => item.id === tombstone.entityId)
              : nextState.activities.find(
                  item => item.id === tombstone.entityId,
                );
          const known = [
            ...nextState.tombstones,
            ...nextState.remoteTombstones,
          ].find(
            item =>
              item.entityKind === tombstone.entityKind &&
              item.entityId === tombstone.entityId,
          );
          if (
            !pending &&
            (known === undefined || known.revision < tombstone.revision) &&
            (current === undefined || current.revision < tombstone.revision)
          ) {
            nextState = {
              ...nextState,
              meals: nextState.meals.filter(
                meal => meal.id !== tombstone.entityId,
              ),
              activities: nextState.activities.filter(
                activity => activity.id !== tombstone.entityId,
              ),
              metadata: nextState.metadata.filter(
                item => item.entityId !== tombstone.entityId,
              ),
              remoteTombstones: [
                ...nextState.remoteTombstones.filter(
                  item => item.entityId !== tombstone.entityId,
                ),
                tombstone,
              ],
            };
            applied += 1;
          }
          continue;
        }
        const document = change.document;
        const reservedByTombstone = [
          ...nextState.tombstones,
          ...nextState.remoteTombstones,
        ].some(
          tombstone =>
            tombstone.entityKind === document.documentKind &&
            tombstone.entityId === document.entityId,
        );
        if (reservedByTombstone) {
          continue;
        }
        const pending = nextState.outbox.some(
          operation =>
            operation.entityKind === document.documentKind &&
            operation.entityId === document.entityId,
        );
        const current =
          document.documentKind === 'meal'
            ? nextState.meals.find(item => item.id === document.entityId)
            : nextState.activities.find(item => item.id === document.entityId);
        if (
          pending ||
          (current !== undefined && current.revision >= document.revision)
        ) {
          continue;
        }
        const hydrated =
          document.documentKind === 'meal'
            ? hydrateRemoteMealDocument(document, this.scope, syncedAt)
            : hydrateRemoteActivityDocument(document, this.scope, syncedAt);
        const metadata: JournalEntityMetadata = {
          entityKind: hydrated.kind,
          entityId: hydrated.id,
          fieldRevisions: initialFields(hydrated.kind).reduce<
            Record<string, Revision>
          >((fields, field) => {
            fields[field] = hydrated.revision;
            return fields;
          }, {}),
          recentRevisions: [
            {
              revision: hydrated.revision,
              changedAt: hydrated.updatedAt,
              changedFields: change.changedFields,
            },
          ],
          conflicts: [],
        };
        nextState =
          hydrated.kind === 'meal'
            ? {
                ...nextState,
                meals: [
                  ...nextState.meals.filter(item => item.id !== hydrated.id),
                  hydrated,
                ],
                metadata: [
                  ...nextState.metadata.filter(
                    item => item.entityId !== hydrated.id,
                  ),
                  metadata,
                ],
              }
            : {
                ...nextState,
                activities: [
                  ...nextState.activities.filter(
                    item => item.id !== hydrated.id,
                  ),
                  hydrated,
                ],
                metadata: [
                  ...nextState.metadata.filter(
                    item => item.entityId !== hydrated.id,
                  ),
                  metadata,
                ],
              };
        applied += 1;
      }
      const stateWithCursor: PersistedJournalState = {
        ...nextState,
        ...(cursor === undefined ? {} : {remoteCursor: cursor}),
      };
      if (
        stateWithCursor === this.state ||
        (applied === 0 && cursor === this.state.remoteCursor)
      ) {
        return applied;
      }
      await this.commitState(stateWithCursor);
      return applied;
    });
  }

  integrateConcurrentRemoteChange(
    change: RemoteJournalChange,
    mergedAt: number,
  ): Promise<'merged' | 'conflict' | 'stale'> {
    return this.serialize(async () => {
      if (change.changeKind === 'purge') {
        const current = this.getEntitySnapshot(
          change.tombstone.entityKind,
          change.tombstone.entityId,
        );
        if (current === undefined) {
          return 'stale';
        }
        const rawConflictId = this.dependencies.ids.nextOperationId().trim();
        const conflictId = parseJournalConflictId(`conflict_${rawConflictId}`, [
          'conflictId',
        ]);
        if (!conflictId.ok) {
          throw new Error('Journal conflict ID is invalid.');
        }
        const pendingOperations = this.state.outbox.filter(
          operation =>
            operation.entityKind === current.kind &&
            operation.entityId === current.id,
        );
        const expectedRevision =
          pendingOperations[0]?.baseRevision ??
          change.baseRevision ??
          current.revision;
        const conflictedRevision = nextRevision(
          Math.max(current.revision, change.tombstone.revision) as Revision,
        );
        const pendingFields = [
          ...new Set(
            pendingOperations.reduce<string[]>(
              (fields, operation) => [...fields, ...operation.changedFields],
              [],
            ),
          ),
        ].filter(field => field !== 'purge');
        const conflict: JournalFieldConflictRecord =
          current.kind === 'meal'
            ? {
                entityKind: 'meal',
                conflictId: conflictId.value,
                detectedAt: mergedAt,
                expectedRevision,
                detectedAgainstRevision: conflictedRevision,
                conflictingFields: ['lifecycle'],
                proposal: {
                  kind: 'meal_lifecycle',
                  lifecycle: 'trashed',
                },
                detectedValues: {
                  lifecycle: detected(current.lifecycle),
                },
              }
            : {
                entityKind: 'activity',
                conflictId: conflictId.value,
                detectedAt: mergedAt,
                expectedRevision,
                detectedAgainstRevision: conflictedRevision,
                conflictingFields: ['lifecycle'],
                proposal: {
                  kind: 'activity_lifecycle',
                  lifecycle: 'trashed',
                },
                detectedValues: {
                  lifecycle: detected(current.lifecycle),
                },
              };
        const conflicted: JournalEntitySnapshot = {
          ...current,
          revision: conflictedRevision,
          updatedAt: mergedAt,
          syncState: {
            kind: 'conflict',
            detectedAt: mergedAt,
            conflictingFields: ['lifecycle'],
          },
        };
        await this.commitMutations([
          conflicted.kind === 'meal'
            ? {
                kind: 'meal',
                snapshot: conflicted,
                baseRevision: current.revision,
                changedFields: [...pendingFields, 'conflicts'],
                conflictsAdded: [conflict],
                outboxBaseRevision: change.tombstone.revision,
                replaceEntityOutbox: true,
              }
            : {
                kind: 'activity',
                snapshot: conflicted,
                baseRevision: current.revision,
                changedFields: [...pendingFields, 'conflicts'],
                conflictsAdded: [conflict],
                outboxBaseRevision: change.tombstone.revision,
                replaceEntityOutbox: true,
              },
        ]);
        return 'conflict';
      }
      const document = change.document;
      const current = this.getEntitySnapshot(
        document.documentKind,
        document.entityId,
      );
      const metadata = this.state.metadata.find(
        item =>
          item.entityKind === document.documentKind &&
          item.entityId === document.entityId,
      );
      if (current === undefined || metadata === undefined) {
        return 'stale';
      }
      const baseRevision = change.baseRevision;
      if (baseRevision === null) {
        return 'conflict';
      }
      const localChangedFields = Object.entries(metadata.fieldRevisions)
        .filter(([, revision]) => revision > baseRevision)
        .map(([field]) => field)
        .filter(field => field !== 'image');
      const remoteChangedFields = change.changedFields.filter(
        field => field !== 'image',
      );
      const remoteSnapshot =
        document.documentKind === 'meal'
          ? hydrateRemoteMealDocument(document, this.scope, mergedAt)
          : hydrateRemoteActivityDocument(document, this.scope, mergedAt);
      const conflictingFields = remoteChangedFields.filter(field =>
        localChangedFields.includes(field),
      );
      if (conflictingFields.length > 0) {
        const details =
          current.kind === 'meal' && remoteSnapshot.kind === 'meal'
            ? remoteMealConflict(current, remoteSnapshot, conflictingFields)
            : current.kind === 'activity' && remoteSnapshot.kind === 'activity'
            ? remoteActivityConflict(current, remoteSnapshot, conflictingFields)
            : undefined;
        if (details === undefined) {
          return 'conflict';
        }
        const rawConflictId = this.dependencies.ids.nextOperationId().trim();
        const conflictId = parseJournalConflictId(`conflict_${rawConflictId}`, [
          'conflictId',
        ]);
        if (!conflictId.ok) {
          throw new Error('Journal conflict ID is invalid.');
        }
        let conflict: JournalFieldConflictRecord;
        let conflicted: JournalEntitySnapshot;
        if (current.kind === 'meal' && remoteSnapshot.kind === 'meal') {
          const mealDetails = details as {
            readonly proposal: MealConflictProposal;
            readonly detectedValues: MealConflictDetectedValues;
          };
          conflict = {
            entityKind: 'meal',
            conflictId: conflictId.value,
            detectedAt: mergedAt,
            expectedRevision: baseRevision,
            detectedAgainstRevision: current.revision,
            conflictingFields,
            proposal: mealDetails.proposal,
            detectedValues: mealDetails.detectedValues,
          };
          conflicted = {
            ...current,
            revision: nextRevision(current.revision),
            updatedAt: mergedAt,
            syncState: {
              kind: 'conflict',
              detectedAt: mergedAt,
              conflictingFields,
            },
          };
        } else if (
          current.kind === 'activity' &&
          remoteSnapshot.kind === 'activity'
        ) {
          const activityDetails = details as {
            readonly proposal: ActivityConflictProposal;
            readonly detectedValues: ActivityConflictDetectedValues;
          };
          conflict = {
            entityKind: 'activity',
            conflictId: conflictId.value,
            detectedAt: mergedAt,
            expectedRevision: baseRevision,
            detectedAgainstRevision: current.revision,
            conflictingFields,
            proposal: activityDetails.proposal,
            detectedValues: activityDetails.detectedValues,
          };
          conflicted = {
            ...current,
            revision: nextRevision(current.revision),
            updatedAt: mergedAt,
            syncState: {
              kind: 'conflict',
              detectedAt: mergedAt,
              conflictingFields,
            },
          };
        } else {
          return 'conflict';
        }
        await this.commitMutations([
          conflicted.kind === 'meal'
            ? {
                kind: 'meal',
                snapshot: conflicted,
                baseRevision: current.revision,
                changedFields: [
                  ...new Set([...localChangedFields, 'conflicts']),
                ],
                conflictsAdded: [conflict],
                outboxBaseRevision: document.revision,
                replaceEntityOutbox: true,
              }
            : {
                kind: 'activity',
                snapshot: conflicted,
                baseRevision: current.revision,
                changedFields: [
                  ...new Set([...localChangedFields, 'conflicts']),
                ],
                conflictsAdded: [conflict],
                outboxBaseRevision: document.revision,
                replaceEntityOutbox: true,
              },
        ]);
        return 'conflict';
      }
      const revision = nextRevision(
        Math.max(current.revision, document.revision) as Revision,
      );
      const operationId = this.dependencies.ids.nextOperationId().trim();
      if (
        operationId.length === 0 ||
        this.state.outbox.some(item => item.operationId === operationId)
      ) {
        throw new Error('Journal merge operation ID is invalid.');
      }
      const pendingFields = [...new Set(localChangedFields)];
      const operation: JournalOutboxOperation = {
        kind: 'upsert',
        operationId,
        entityKind: current.kind,
        entityId: current.id,
        baseRevision: document.revision,
        localRevision: revision,
        queuedAt: mergedAt,
        changedFields: pendingFields,
      };
      const merged =
        current.kind === 'meal' && remoteSnapshot.kind === 'meal'
          ? mergeRemoteMealFields(current, remoteSnapshot, remoteChangedFields)
          : current.kind === 'activity' && remoteSnapshot.kind === 'activity'
          ? mergeRemoteActivityFields(
              current,
              remoteSnapshot,
              remoteChangedFields,
            )
          : undefined;
      if (merged === undefined) {
        return 'conflict';
      }
      const mergedSnapshot: JournalEntitySnapshot = {
        ...merged,
        revision,
        updatedAt: mergedAt,
        syncState: {
          kind: 'pending',
          queuedAt: mergedAt,
          operationCount: 1,
        },
      };
      const fieldRevisions = {...metadata.fieldRevisions};
      remoteChangedFields.forEach(field => {
        fieldRevisions[field] = document.revision;
      });
      pendingFields.forEach(field => {
        fieldRevisions[field] = revision;
      });
      const mergedMetadata: JournalEntityMetadata = {
        ...metadata,
        fieldRevisions,
        recentRevisions: [
          ...metadata.recentRevisions,
          {
            revision,
            changedAt: mergedAt,
            changedFields: pendingFields,
          },
        ].slice(-12),
      };
      const nextState: PersistedJournalState = {
        ...this.state,
        meals:
          mergedSnapshot.kind === 'meal'
            ? [
                ...this.state.meals.filter(
                  item => item.id !== mergedSnapshot.id,
                ),
                mergedSnapshot,
              ]
            : this.state.meals,
        activities:
          mergedSnapshot.kind === 'activity'
            ? [
                ...this.state.activities.filter(
                  item => item.id !== mergedSnapshot.id,
                ),
                mergedSnapshot,
              ]
            : this.state.activities,
        metadata: [
          ...this.state.metadata.filter(
            item => item.entityId !== mergedSnapshot.id,
          ),
          mergedMetadata,
        ],
        outbox: [
          ...this.state.outbox.filter(
            item =>
              item.entityKind !== mergedSnapshot.kind ||
              item.entityId !== mergedSnapshot.id,
          ),
          operation,
        ],
      };
      await this.commitState(nextState);
      return 'merged';
    });
  }

  purgeExpiredTrash(now: number): Promise<CommittedTrashPurge> {
    return this.serialize(async () => {
      const canPurge = (entityId: MealEntryId | ActivityEntryId): boolean =>
        this.state.metadata.find(item => item.entityId === entityId)?.conflicts
          .length === 0;
      const meals = this.state.meals.filter(
        meal =>
          meal.lifecycle.kind === 'trashed' &&
          meal.lifecycle.purgeAfter <= now &&
          canPurge(meal.id),
      );
      const activities = this.state.activities.filter(
        activity =>
          activity.lifecycle.kind === 'trashed' &&
          activity.lifecycle.purgeAfter <= now &&
          canPurge(activity.id),
      );
      if (meals.length === 0 && activities.length === 0) {
        return {tombstones: [], mealImages: []};
      }

      const entities = [...meals, ...activities];
      const purgedIds = new Set<string>(entities.map(entity => entity.id));
      const operationIds = new Set(
        this.state.outbox.map(operation => operation.operationId),
      );
      const tombstones: JournalTombstone[] = [];
      const operations: JournalPurgeOutboxOperation[] = [];
      entities.forEach(entity => {
        const operationId = this.dependencies.ids.nextOperationId().trim();
        if (operationId.length === 0) {
          throw new Error('Journal operation IDs cannot be empty.');
        }
        if (operationIds.has(operationId)) {
          throw new Error(`Duplicate Journal operation ID: ${operationId}`);
        }
        operationIds.add(operationId);
        const revision = nextRevision(entity.revision);
        const pendingOperations = this.state.outbox.filter(
          operation =>
            operation.entityKind === entity.kind &&
            operation.entityId === entity.id,
        );
        const remoteBaseRevision =
          pendingOperations.length === 0
            ? entity.revision
            : pendingOperations[0]!.baseRevision;
        const tombstone = {
          kind: 'journal_tombstone' as const,
          entityKind: entity.kind,
          entityId: entity.id,
          purgedAt: now,
          revision,
        } as JournalTombstone;
        tombstones.push(tombstone);
        operations.push({
          kind: 'purge',
          operationId,
          entityKind: entity.kind,
          entityId: entity.id,
          baseRevision: remoteBaseRevision,
          localRevision: revision,
          queuedAt: now,
          changedFields: ['purge'],
        } as JournalPurgeOutboxOperation);
      });

      const nextState: PersistedJournalState = {
        ...this.state,
        meals: this.state.meals.filter(meal => !purgedIds.has(meal.id)),
        activities: this.state.activities.filter(
          activity => !purgedIds.has(activity.id),
        ),
        tombstones: [...this.state.tombstones, ...tombstones],
        metadata: this.state.metadata.filter(
          item => !purgedIds.has(item.entityId),
        ),
        outbox: [
          ...this.state.outbox.filter(
            operation => !purgedIds.has(operation.entityId),
          ),
          ...operations,
        ],
      };
      await this.commitState(nextState);
      return {
        tombstones: this.state.tombstones.filter(tombstone =>
          purgedIds.has(tombstone.entityId),
        ),
        mealImages: meals.reduce<
          {readonly mealId: MealEntryId; readonly image: MealImageSnapshot}[]
        >((images, meal) => {
          if (meal.image !== undefined) {
            images.push({mealId: meal.id, image: meal.image});
          }
          return images;
        }, []),
      };
    });
  }

  /** Must be called from inside `runMutation` so read-check-write is atomic. */
  async commitMutations(
    mutations: readonly EntityMutation[],
  ): Promise<readonly JournalEntitySnapshot[]> {
    let nextState = this.state;
    const committed: JournalEntitySnapshot[] = [];

    mutations.forEach(mutation => {
      if (
        mutation.baseRevision === null &&
        (nextState.meals.some(item => item.id === mutation.snapshot.id) ||
          nextState.activities.some(item => item.id === mutation.snapshot.id) ||
          nextState.tombstones.some(
            item => item.entityId === mutation.snapshot.id,
          ) ||
          nextState.remoteTombstones.some(
            item => item.entityId === mutation.snapshot.id,
          ))
      ) {
        throw new Error(
          `Journal entry ID is already reserved: ${mutation.snapshot.id}`,
        );
      }
      const queuedAt = mutation.snapshot.updatedAt;
      const outboxBeforeOperation =
        mutation.replaceEntityOutbox === true
          ? nextState.outbox.filter(
              operation =>
                operation.entityKind !== mutation.kind ||
                operation.entityId !== mutation.snapshot.id,
            )
          : nextState.outbox;
      const pending = pendingStateFor(
        outboxBeforeOperation,
        mutation.snapshot.id,
        queuedAt,
      );
      const currentMetadata = nextState.metadata.find(
        item => item.entityId === mutation.snapshot.id,
      );
      const metadata = updatedMetadata(currentMetadata, mutation);
      const syncState =
        metadata.conflicts.length > 0
          ? {
              kind: 'conflict' as const,
              detectedAt:
                metadata.conflicts[metadata.conflicts.length - 1]!.detectedAt,
              conflictingFields: [
                ...new Set(
                  metadata.conflicts.reduce<string[]>((fields, conflict) => {
                    fields.push(...conflict.conflictingFields);
                    return fields;
                  }, []),
                ),
              ],
            }
          : pending;
      const snapshot = immutableJsonClone({
        ...mutation.snapshot,
        syncState,
      });
      const operationId = this.dependencies.ids.nextOperationId().trim();
      if (operationId.length === 0) {
        throw new Error('Journal operation IDs cannot be empty.');
      }
      if (nextState.outbox.some(item => item.operationId === operationId)) {
        throw new Error(`Duplicate Journal operation ID: ${operationId}`);
      }
      const operation: JournalOutboxOperation = {
        kind: 'upsert',
        operationId,
        entityKind: mutation.kind,
        entityId: snapshot.id,
        baseRevision:
          mutation.outboxBaseRevision === undefined
            ? mutation.baseRevision
            : mutation.outboxBaseRevision,
        localRevision: snapshot.revision,
        queuedAt,
        changedFields: [...new Set(mutation.changedFields)],
      };
      nextState =
        mutation.kind === 'meal'
          ? {
              ...nextState,
              meals: [
                ...nextState.meals.filter(item => item.id !== snapshot.id),
                snapshot as MealSnapshot,
              ],
              outbox: [...outboxBeforeOperation, operation],
              metadata: [
                ...nextState.metadata.filter(
                  item => item.entityId !== snapshot.id,
                ),
                metadata,
              ],
            }
          : {
              ...nextState,
              activities: [
                ...nextState.activities.filter(item => item.id !== snapshot.id),
                snapshot as ActivitySnapshot,
              ],
              outbox: [...outboxBeforeOperation, operation],
              metadata: [
                ...nextState.metadata.filter(
                  item => item.entityId !== snapshot.id,
                ),
                metadata,
              ],
            };
      committed.push(snapshot);
    });

    await this.commitState(nextState);
    return committed;
  }

  private async commitState(nextState: PersistedJournalState): Promise<void> {
    deepFreeze(nextState);
    const committedState = await this.dependencies.localStore.commit(
      this.scope,
      this.generation,
      nextState,
    );
    if (!committedState.ok) {
      throw new Error(
        `Concurrent local Journal write detected (expected generation ${this.generation}, found ${committedState.actualGeneration}).`,
      );
    }
    this.generation = committedState.generation;
    this.state = nextState;
    this.stateVersion += 1;
    this.mealPages.clear();
    this.activityPages.clear();
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {
        // The write is already durable. One UI observer cannot change success.
      }
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
