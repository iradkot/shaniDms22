import {
  AppOwnedUriJournalMediaStore,
  createJournalEngine,
  decodeExternalRecordPayload,
  InMemoryJournalLocalStore,
  JOURNAL_ERROR_CODES,
  JOURNAL_TRASH_RETENTION_MS,
  journalOk,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  toExternalRecordReference,
} from '../../../src/modules/journal';
import type {
  JournalClock,
  JournalEngineDependencies,
  JournalExternalRecordReader,
  JournalIdGenerator,
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  JournalMediaStore,
  JournalWorkspace,
  JournalWorkspaceScope,
  MealImageSnapshot,
  PersistedJournalState,
} from '../../../src/modules/journal';
import type {ParseResult} from '../../../src/modules/journal';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
};

const scope = (): JournalWorkspaceScope => ({
  productUserId: valueOf(parseProductUserId('user-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
});

class MutableClock implements JournalClock {
  constructor(public value = 1_700_000_000_000) {}

  now(): number {
    return this.value;
  }
}

class SequentialIds implements JournalIdGenerator {
  private entry = 0;
  private operation = 0;

  nextEntryId(kind: 'meal' | 'activity'): string {
    this.entry += 1;
    return `${kind}-${this.entry}`;
  }

  nextOperationId(): string {
    this.operation += 1;
    return `operation-${this.operation}`;
  }
}

class TrackingStore implements JournalLocalStore {
  readonly inner = new InMemoryJournalLocalStore();
  commits = 0;
  lastCommitted: PersistedJournalState | undefined;
  failNextCommit = false;

  read(journalScope: JournalWorkspaceScope): Promise<JournalLocalRead> {
    return this.inner.read(journalScope);
  }

  async commit(
    journalScope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult> {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('disk full');
    }
    const result = await this.inner.commit(
      journalScope,
      expectedGeneration,
      state,
    );
    if (!result.ok) {
      return result;
    }
    this.commits += 1;
    this.lastCommitted = state;
    return result;
  }
}

const dependencies = (
  overrides: Partial<JournalEngineDependencies> = {},
): JournalEngineDependencies => ({
  localStore: new TrackingStore(),
  clock: new MutableClock(),
  ids: new SequentialIds(),
  mediaStore: new AppOwnedUriJournalMediaStore(),
  ...overrides,
});

const openWorkspace = async (
  deps: JournalEngineDependencies,
  journalScope = scope(),
): Promise<JournalWorkspace> => {
  const opened = await createJournalEngine(deps).open(journalScope);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  return opened.value;
};

describe('local-first Journal engine', () => {
  it('commits the entry and outbox atomically before publishing it', async () => {
    const store = new TrackingStore();
    const workspace = await openWorkspace(dependencies({localStore: store}));
    let notifications = 0;
    workspace.meals.subscribe(() => {
      notifications += 1;
    });

    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Pasta',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 45},
    });

    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }
    expect(store.commits).toBe(1);
    expect(store.lastCommitted?.meals).toHaveLength(1);
    expect(store.lastCommitted?.outbox).toHaveLength(1);
    expect(workspace.meals.getSnapshot(captured.value.id)).toBe(captured.value);
    expect(captured.value.syncState).toMatchObject({
      kind: 'pending',
      operationCount: 1,
    });
    expect(workspace.outbox.getSnapshot()).toHaveLength(1);
    expect(notifications).toBe(1);
  });

  it('keeps durable success even when a UI subscriber throws', async () => {
    const workspace = await openWorkspace(dependencies());
    let healthyNotifications = 0;
    workspace.meals.subscribe(() => {
      throw new Error('broken component');
    });
    workspace.meals.subscribe(() => {
      healthyNotifications += 1;
    });

    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Durable meal',
    });

    expect(captured.ok).toBe(true);
    expect(healthyNotifications).toBe(1);
    expect(workspace.meals.getListSnapshot().items).toHaveLength(1);
  });

  it('does not publish or accept a write when the atomic commit fails', async () => {
    const store = new TrackingStore();
    store.failNextCommit = true;
    const workspace = await openWorkspace(dependencies({localStore: store}));
    let notifications = 0;
    workspace.meals.subscribe(() => {
      notifications += 1;
    });

    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Offline meal',
    });

    expect(captured).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE},
    });
    expect(workspace.meals.getListSnapshot().items).toHaveLength(0);
    expect(workspace.outbox.getSnapshot()).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it('reopens valid persisted state and refuses corrupt state', async () => {
    const store = new InMemoryJournalLocalStore();
    const deps = dependencies({localStore: store});
    const first = await openWorkspace(deps);
    const captured = await first.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Persisted meal',
    });
    expect(captured.ok).toBe(true);

    const reopened = await openWorkspace(
      dependencies({localStore: store}),
      first.scope,
    );
    expect(reopened.meals.getListSnapshot().items).toHaveLength(1);

    const corruptScope: JournalWorkspaceScope = {
      ...scope(),
      workspaceId: valueOf(parseWorkspaceId('corrupt-workspace')),
    };
    store.seed(corruptScope, {schemaVersion: 999});
    const corrupt = await createJournalEngine(
      dependencies({localStore: store}),
    ).open(corruptScope);
    expect(corrupt).toMatchObject({
      ok: false,
      error: {
        code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE,
        retryable: false,
      },
    });
  });

  it('does not cache a retryable open failure', async () => {
    const inner = new InMemoryJournalLocalStore();
    let reads = 0;
    const flaky: JournalLocalStore = {
      async read(journalScope) {
        reads += 1;
        if (reads === 1) {
          throw new Error('storage temporarily locked');
        }
        return inner.read(journalScope);
      },
      commit(journalScope, expectedGeneration, state) {
        return inner.commit(journalScope, expectedGeneration, state);
      },
    };
    const engine = createJournalEngine(dependencies({localStore: flaky}));

    const first = await engine.open(scope());
    const second = await engine.open(scope());

    expect(first).toMatchObject({ok: false, error: {retryable: true}});
    expect(second.ok).toBe(true);
    expect(reads).toBe(2);
  });

  it('uses compare-and-swap so two engine instances cannot overwrite each other', async () => {
    const store = new InMemoryJournalLocalStore();
    const journalScope = scope();
    const first = await openWorkspace(
      dependencies({localStore: store}),
      journalScope,
    );
    const second = await openWorkspace(
      dependencies({localStore: store}),
      journalScope,
    );

    const [left, right] = await Promise.all([
      first.meals.capture({
        mealStart: 1_700_000_000_000,
        name: 'First runtime',
      }),
      second.meals.capture({
        mealStart: 1_700_000_100_000,
        name: 'Second runtime',
      }),
    ]);

    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1);
    const reopened = await openWorkspace(
      dependencies({localStore: store}),
      journalScope,
    );
    expect(reopened.meals.getListSnapshot().items).toHaveLength(1);
  });

  it('merges independent fields and preserves a same-field conflict candidate', async () => {
    const store = new TrackingStore();
    const workspace = await openWorkspace(dependencies({localStore: store}));
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Meal',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }

    const [first, independent] = await Promise.all([
      workspace.meals.revise({
        mealId: captured.value.id,
        expectedRevision: captured.value.revision,
        name: {kind: 'set', value: 'Renamed'},
      }),
      workspace.meals.revise({
        mealId: captured.value.id,
        expectedRevision: captured.value.revision,
        notes: {kind: 'set', value: 'Concurrent note'},
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(independent.ok).toBe(true);
    const merged = workspace.meals.getSnapshot(captured.value.id);
    expect(merged).toMatchObject({name: 'Renamed', notes: 'Concurrent note'});

    const sameField = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Competing name'},
    });
    expect(sameField).toMatchObject({
      ok: false,
      error: {
        code: JOURNAL_ERROR_CODES.REVISION_CONFLICT,
        conflictingFields: ['name'],
      },
    });
    expect(
      workspace.meals.getSnapshot(captured.value.id)?.syncState,
    ).toMatchObject({
      kind: 'conflict',
      conflictingFields: ['name'],
    });
    expect(store.lastCommitted?.metadata[0]?.conflicts[0]).toMatchObject({
      conflictingFields: ['name'],
      proposal: {
        kind: 'meal_revision',
        changes: {name: {kind: 'set', value: 'Competing name'}},
      },
      detectedValues: {
        name: {kind: 'present', value: 'Renamed'},
      },
    });
  });

  it('inspects a conflict and keeps the exact current meal without advancing domain fields', async () => {
    const store = new TrackingStore();
    const workspace = await openWorkspace(dependencies({localStore: store}));
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const renamed = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Current'},
    });
    if (!renamed.ok) {
      throw new Error(renamed.error.message);
    }
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Proposed'},
    });

    const inspected = await workspace.meals.inspectConflicts(captured.value.id);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.value).toHaveLength(1);
    expect(inspected.value[0]).toMatchObject({
      currentSnapshot: {name: 'Current'},
      proposal: {
        kind: 'meal_revision',
        changes: {name: {kind: 'set', value: 'Proposed'}},
      },
      detectedValues: {name: {kind: 'present', value: 'Current'}},
    });
    const conflict = inspected.value[0]!;
    const beforeFieldRevision =
      store.lastCommitted?.metadata[0]?.fieldRevisions.name;
    const resolved = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: conflict.conflictId,
      expectedRevision: conflict.currentSnapshot.revision,
      decision: 'keep_current',
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.value.name).toBe('Current');
    expect(resolved.value.syncState.kind).toBe('pending');
    expect(store.lastCommitted?.metadata[0]?.conflicts).toHaveLength(0);
    expect(store.lastCommitted?.metadata[0]?.fieldRevisions.name).toBe(
      beforeFieldRevision,
    );
    const persistedOutbox = store.lastCommitted?.outbox ?? [];
    expect(persistedOutbox[persistedOutbox.length - 1]?.changedFields).toEqual([
      'conflicts',
    ]);
  });

  it('applies a fully revalidated proposal and removes only its conflict', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const current = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Current'},
    });
    if (!current.ok) {
      throw new Error(current.error.message);
    }
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'First proposal'},
    });
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Second proposal'},
    });
    const inspected = await workspace.meals.inspectConflicts(captured.value.id);
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    expect(inspected.value).toHaveLength(2);

    const kept = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: inspected.value[0]!.conflictId,
      expectedRevision: inspected.value[0]!.currentSnapshot.revision,
      decision: 'keep_current',
    });
    if (!kept.ok) {
      throw new Error(kept.error.message);
    }
    expect(kept.value.syncState.kind).toBe('conflict');
    const remaining = await workspace.meals.inspectConflicts(captured.value.id);
    if (!remaining.ok) {
      throw new Error(remaining.error.message);
    }
    expect(remaining.value).toHaveLength(1);
    const applied = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: remaining.value[0]!.conflictId,
      expectedRevision: kept.value.revision,
      decision: 'apply_proposed',
    });

    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.name).toBe('Second proposal');
      expect(applied.value.syncState.kind).toBe('pending');
    }
    const empty = await workspace.meals.inspectConflicts(captured.value.id);
    expect(empty).toMatchObject({ok: true, value: []});
  });

  it('requires the exact current revision to resolve and leaves stale resolution untouched', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const current = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Current'},
    });
    if (!current.ok) {
      throw new Error(current.error.message);
    }
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Proposal'},
    });
    const inspected = await workspace.meals.inspectConflicts(captured.value.id);
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    const conflict = inspected.value[0]!;
    const later = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: conflict.currentSnapshot.revision,
      notes: {kind: 'set', value: 'Later independent edit'},
    });
    if (!later.ok) {
      throw new Error(later.error.message);
    }

    const stale = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: conflict.conflictId,
      expectedRevision: conflict.currentSnapshot.revision,
      decision: 'apply_proposed',
    });
    expect(stale).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.REVISION_CONFLICT},
    });
    const stillThere = await workspace.meals.inspectConflicts(
      captured.value.id,
    );
    expect(stillThere).toMatchObject({
      ok: true,
      value: [{conflictId: conflict.conflictId}],
    });
  });

  it('keeps an invalid apply proposal durable and available for another decision', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 20},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const renamed = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Current'},
    });
    if (!renamed.ok) {
      throw new Error(renamed.error.message);
    }
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'clear'},
    });
    const inspected = await workspace.meals.inspectConflicts(captured.value.id);
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    const conflict = inspected.value[0]!;
    const withoutCarbs = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: conflict.currentSnapshot.revision,
      mealCarbohydrates: {kind: 'clear'},
    });
    if (!withoutCarbs.ok) {
      throw new Error(withoutCarbs.error.message);
    }

    const invalid = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: conflict.conflictId,
      expectedRevision: withoutCarbs.value.revision,
      decision: 'apply_proposed',
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.INVALID_INPUT},
    });
    const preserved = await workspace.meals.inspectConflicts(captured.value.id);
    expect(preserved).toMatchObject({
      ok: true,
      value: [{conflictId: conflict.conflictId}],
    });
  });

  it('refuses image conflict apply with a stable validation error and preserves it', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Meal with image conflict',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const currentImage = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      image: {
        kind: 'set',
        value: {uri: 'file://current.jpg', mimeType: 'image/jpeg'},
      },
    });
    if (!currentImage.ok) {
      throw new Error(currentImage.error.message);
    }
    await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      image: {
        kind: 'set',
        value: {uri: 'file://proposed.jpg', mimeType: 'image/jpeg'},
      },
    });
    const inspected = await workspace.meals.inspectConflicts(captured.value.id);
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    const conflict = inspected.value[0]!;

    const refused = await workspace.meals.resolveConflict({
      mealId: captured.value.id,
      conflictId: conflict.conflictId,
      expectedRevision: conflict.currentSnapshot.revision,
      decision: 'apply_proposed',
    });
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: JOURNAL_ERROR_CODES.INVALID_INPUT,
        issues: [
          {
            path: ['proposal', 'changes', 'image'],
          },
        ],
      },
    });
    expect(
      await workspace.meals.inspectConflicts(captured.value.id),
    ).toMatchObject({ok: true, value: [{conflictId: conflict.conflictId}]});
  });

  it('reopens typed conflict proposals and detected values', async () => {
    const store = new InMemoryJournalLocalStore();
    const deps = dependencies({localStore: store});
    const first = await openWorkspace(deps);
    const captured = await first.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const renamed = await first.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Current'},
    });
    if (!renamed.ok) {
      throw new Error(renamed.error.message);
    }
    await first.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Reopened proposal'},
    });
    const capturedActivity = await first.activities.capture({
      category: 'walking',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_300_000,
      intensity: 'low',
    });
    if (!capturedActivity.ok) {
      throw new Error(capturedActivity.error.message);
    }
    const changedActivity = await first.activities.revise({
      activityId: capturedActivity.value.id,
      expectedRevision: capturedActivity.value.revision,
      intensity: {kind: 'set', value: 'medium'},
    });
    if (!changedActivity.ok) {
      throw new Error(changedActivity.error.message);
    }
    await first.activities.revise({
      activityId: capturedActivity.value.id,
      expectedRevision: capturedActivity.value.revision,
      intensity: {kind: 'set', value: 'high'},
    });

    const reopened = await openWorkspace(
      dependencies({localStore: store}),
      first.scope,
    );
    const conflicts = await reopened.meals.inspectConflicts(captured.value.id);
    expect(conflicts).toMatchObject({
      ok: true,
      value: [
        {
          proposal: {
            kind: 'meal_revision',
            changes: {name: {kind: 'set', value: 'Reopened proposal'}},
          },
          detectedValues: {
            name: {kind: 'present', value: 'Current'},
          },
        },
      ],
    });
    expect(
      await reopened.activities.inspectConflicts(capturedActivity.value.id),
    ).toMatchObject({
      ok: true,
      value: [
        {
          proposal: {
            kind: 'activity_revision',
            changes: {intensity: {kind: 'set', value: 'high'}},
          },
          detectedValues: {
            intensity: {kind: 'present', value: 'medium'},
          },
        },
      ],
    });
  });

  it('inspects and applies a typed activity conflict', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.activities.capture({
      category: 'walking',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_300_000,
      intensity: 'low',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const current = await workspace.activities.revise({
      activityId: captured.value.id,
      expectedRevision: captured.value.revision,
      intensity: {kind: 'set', value: 'medium'},
    });
    if (!current.ok) {
      throw new Error(current.error.message);
    }
    await workspace.activities.revise({
      activityId: captured.value.id,
      expectedRevision: captured.value.revision,
      intensity: {kind: 'set', value: 'high'},
    });
    const inspected = await workspace.activities.inspectConflicts(
      captured.value.id,
    );
    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }
    expect(inspected.value[0]).toMatchObject({
      proposal: {
        kind: 'activity_revision',
        changes: {intensity: {kind: 'set', value: 'high'}},
      },
      detectedValues: {intensity: {kind: 'present', value: 'medium'}},
    });
    const conflict = inspected.value[0]!;
    const applied = await workspace.activities.resolveConflict({
      activityId: captured.value.id,
      conflictId: conflict.conflictId,
      expectedRevision: conflict.currentSnapshot.revision,
      decision: 'apply_proposed',
    });
    expect(applied).toMatchObject({
      ok: true,
      value: {intensity: 'high', syncState: {kind: 'pending'}},
    });
  });

  it('keeps incremental external carb records separate and links only explicitly', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Dinner',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const makeReference = (id: string) => {
      const decoded = decodeExternalRecordPayload(
        {_id: id},
        workspace.scope.nightscoutSourceId,
      );
      if (!decoded.ok) {
        throw new Error('Failed to decode external test record.');
      }
      return valueOf(toExternalRecordReference(decoded.value));
    };
    const role = {
      kind: 'reported_carbohydrate' as const,
      purpose: 'meal' as const,
    };
    const first = await workspace.meals.linkExternalEvent({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      record: makeReference('carb-1'),
      role,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_000_000,
        carbohydratesGrams: 5,
      },
    });
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const secondRecord = makeReference('carb-2');
    const second = await workspace.meals.linkExternalEvent({
      mealId: first.value.id,
      expectedRevision: first.value.revision,
      record: secondRecord,
      role,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_060_000,
        carbohydratesGrams: 5,
      },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.value.externalLinks).toHaveLength(2);
    expect(second.value.reportedCarbohydrates).toMatchObject({
      componentCount: 2,
      totalGrams: 10,
    });

    const duplicate = await workspace.meals.linkExternalEvent({
      mealId: second.value.id,
      expectedRevision: second.value.revision,
      record: secondRecord,
      role,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_060_000,
        carbohydratesGrams: 5,
      },
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED},
    });
  });

  it('rejects malformed link commands before they can corrupt durable state', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Meal',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const decoded = decodeExternalRecordPayload(
      {_id: 'carb-1'},
      workspace.scope.nightscoutSourceId,
    );
    if (!decoded.ok) {
      throw new Error('Invalid test record.');
    }
    const record = valueOf(toExternalRecordReference(decoded.value));
    const malformed = {
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      record: {...record, recordKey: 'wrong-key'},
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
      snapshot: {
        kind: 'treatment',
        treatmentTime: 1_700_000_000_000,
      },
    } as unknown as Parameters<typeof workspace.meals.linkExternalEvent>[0];

    const result = await workspace.meals.linkExternalEvent(malformed);

    expect(result).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.INVALID_INPUT},
    });
    expect(
      workspace.meals.getSnapshot(captured.value.id)?.externalLinks,
    ).toHaveLength(0);
  });

  it('freezes stored snapshots and does not alias mutable link payloads', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Meal',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const decoded = decodeExternalRecordPayload(
      {_id: 'carb-frozen'},
      workspace.scope.nightscoutSourceId,
    );
    if (!decoded.ok) {
      throw new Error('Invalid test record.');
    }
    const record = valueOf(toExternalRecordReference(decoded.value));
    const snapshot = {
      kind: 'carbohydrate' as const,
      externalCarbTime: 1_700_000_000_000,
      carbohydratesGrams: 7,
    };
    const linked = await workspace.meals.linkExternalEvent({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      record,
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
      snapshot,
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }

    snapshot.carbohydratesGrams = 99;
    expect(linked.value.reportedCarbohydrates?.totalGrams).toBe(7);
    expect(Object.isFrozen(linked.value)).toBe(true);
    expect(Object.isFrozen(linked.value.externalLinks[0])).toBe(true);
  });

  it('rejects an unknown FieldChange discriminant without clearing data', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Keep me',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 10},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const malformed = {
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'typo'},
    } as unknown as Parameters<typeof workspace.meals.revise>[0];

    const result = await workspace.meals.revise(malformed);

    expect(result).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.INVALID_INPUT},
    });
    expect(workspace.meals.getSnapshot(captured.value.id)?.name).toBe(
      'Keep me',
    );
  });

  it('allows only one local ongoing activity, then allows another after finish', async () => {
    const workspace = await openWorkspace(dependencies());
    const walking = await workspace.activities.capture({
      category: 'walking',
      startedAt: 1_700_000_000_000,
    });
    if (!walking.ok) {
      throw new Error(walking.error.message);
    }
    const blocked = await workspace.activities.capture({
      category: 'cycling',
      startedAt: 1_700_000_100_000,
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.ONGOING_ACTIVITY_EXISTS},
    });

    const finished = await workspace.activities.finish({
      activityId: walking.value.id,
      expectedRevision: walking.value.revision,
      endedAt: 1_700_000_200_000,
    });
    expect(finished.ok).toBe(true);
    const cycling = await workspace.activities.capture({
      category: 'cycling',
      startedAt: 1_700_000_300_000,
    });
    expect(cycling.ok).toBe(true);
  });

  it('keeps trashed entries for 30 days and hides them from the default list', async () => {
    const clock = new MutableClock();
    const workspace = await openWorkspace(dependencies({clock}));
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'To trash',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    clock.value += 10_000;
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }

    expect(
      trashed.value.lifecycle.purgeAfter - trashed.value.lifecycle.trashedAt,
    ).toBe(JOURNAL_TRASH_RETENTION_MS);
    expect(workspace.meals.getListSnapshot().items).toHaveLength(0);
    expect(
      workspace.meals.getListSnapshot({includeTrashed: true}).items,
    ).toHaveLength(1);
  });

  it('does not purge Trash before its retention deadline', async () => {
    const clock = new MutableClock();
    const workspace = await openWorkspace(dependencies({clock}));
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Not expired',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter - 1;

    const result = await workspace.maintenance.purgeExpiredTrash();

    expect(result).toMatchObject({ok: true, value: {tombstones: []}});
    expect(workspace.meals.getSnapshot(captured.value.id)).toBeDefined();
    expect(workspace.maintenance.getTombstoneSnapshot()).toHaveLength(0);
    expect(workspace.outbox.getSnapshot()).toHaveLength(2);
  });

  it('atomically purges expired Trash, writes a tombstone, and compacts its outbox', async () => {
    const store = new TrackingStore();
    const clock = new MutableClock();
    const workspace = await openWorkspace(
      dependencies({clock, localStore: store}),
    );
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Expired',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const revised = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      notes: {kind: 'set', value: 'A pending edit'},
    });
    if (!revised.ok) {
      throw new Error(revised.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: revised.value.id,
      expectedRevision: revised.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    expect(workspace.outbox.getSnapshot()).toHaveLength(3);
    clock.value = trashed.value.lifecycle.purgeAfter;

    const result = await workspace.maintenance.purgeExpiredTrash();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.tombstones).toEqual([
      expect.objectContaining({
        kind: 'journal_tombstone',
        entityKind: 'meal',
        entityId: captured.value.id,
        purgedAt: clock.value,
        revision: trashed.value.revision + 1,
      }),
    ]);
    expect(workspace.meals.getSnapshot(captured.value.id)).toBeUndefined();
    expect(store.lastCommitted?.meals).toHaveLength(0);
    expect(store.lastCommitted?.metadata).toHaveLength(0);
    expect(store.lastCommitted?.tombstones).toHaveLength(1);
    expect(workspace.outbox.getSnapshot()).toEqual([
      expect.objectContaining({
        kind: 'purge',
        entityKind: 'meal',
        entityId: captured.value.id,
        // No revision was remotely acknowledged before the offline purge.
        baseRevision: null,
        localRevision: trashed.value.revision + 1,
        changedFields: ['purge'],
      }),
    ]);
  });

  it('keeps the trashed entry intact when the atomic purge commit fails', async () => {
    const store = new TrackingStore();
    const clock = new MutableClock();
    const workspace = await openWorkspace(
      dependencies({clock, localStore: store}),
    );
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Failed purge',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter;
    store.failNextCommit = true;

    const result = await workspace.maintenance.purgeExpiredTrash();

    expect(result).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE},
    });
    expect(workspace.meals.getSnapshot(captured.value.id)).toBeDefined();
    expect(workspace.maintenance.getTombstoneSnapshot()).toHaveLength(0);
    expect(workspace.outbox.getSnapshot()).toHaveLength(2);
  });

  it('never purges an expired entry with an unresolved conflict', async () => {
    const clock = new MutableClock();
    const workspace = await openWorkspace(dependencies({clock}));
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Conflicted Trash',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    const conflict = await workspace.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Stale competing name'},
    });
    expect(conflict).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.REVISION_CONFLICT},
    });
    clock.value = trashed.value.lifecycle.purgeAfter;

    const result = await workspace.maintenance.purgeExpiredTrash();

    expect(result).toMatchObject({ok: true, value: {tombstones: []}});
    expect(workspace.meals.getSnapshot(captured.value.id)).toBeDefined();
    expect(workspace.maintenance.getTombstoneSnapshot()).toHaveLength(0);
  });

  it('removes meal media only after durable purge and never resurrects on cleanup failure', async () => {
    const store = new TrackingStore();
    const clock = new MutableClock();
    let cleanupCalls = 0;
    let observedDurablePurge = false;
    const mediaStore: JournalMediaStore = {
      async stageMealImage(): Promise<MealImageSnapshot> {
        return {
          mimeType: 'image/jpeg',
          syncState: {kind: 'local_only', localUri: 'app://meal-image'},
        };
      },
      async removeMealImage(): Promise<void> {
        cleanupCalls += 1;
        observedDurablePurge =
          store.lastCommitted?.meals.length === 0 &&
          store.lastCommitted.tombstones.length === 1;
        throw new Error('filesystem temporarily unavailable');
      },
    };
    const workspace = await openWorkspace(
      dependencies({clock, localStore: store, mediaStore}),
    );
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      image: {uri: 'picker://meal-image', mimeType: 'image/jpeg'},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter;

    const result = await workspace.maintenance.purgeExpiredTrash();

    expect(result).toMatchObject({
      ok: true,
      value: {
        mediaCleanupFailures: [
          {
            mealId: captured.value.id,
            message: 'filesystem temporarily unavailable',
          },
        ],
      },
    });
    expect(cleanupCalls).toBe(1);
    expect(observedDurablePurge).toBe(true);
    expect(workspace.meals.getSnapshot(captured.value.id)).toBeUndefined();
    expect(workspace.maintenance.getTombstoneSnapshot()).toHaveLength(1);
  });

  it('reopens purge tombstones and keeps their durable purge operation', async () => {
    const store = new InMemoryJournalLocalStore();
    const clock = new MutableClock();
    const first = await openWorkspace(dependencies({clock, localStore: store}));
    const captured = await first.activities.capture({
      category: 'walking',
      startedAt: clock.value,
      endedAt: clock.value + 60_000,
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await first.activities.trash({
      activityId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Activity was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter;
    const purged = await first.maintenance.purgeExpiredTrash();
    if (!purged.ok) {
      throw new Error(purged.error.message);
    }

    const reopened = await openWorkspace(
      dependencies({clock, localStore: store}),
      first.scope,
    );

    expect(reopened.activities.getSnapshot(captured.value.id)).toBeUndefined();
    expect(reopened.maintenance.getTombstoneSnapshot()).toEqual([
      expect.objectContaining({
        entityKind: 'activity',
        entityId: captured.value.id,
      }),
    ]);
    expect(reopened.outbox.getSnapshot()).toEqual([
      expect.objectContaining({kind: 'purge', entityId: captured.value.id}),
    ]);
  });

  it('reserves purged IDs and refuses to reuse them', async () => {
    class ReusingEntryIds extends SequentialIds {
      nextEntryId(kind: 'meal' | 'activity'): string {
        return `${kind}-fixed`;
      }
    }
    const clock = new MutableClock();
    const workspace = await openWorkspace(
      dependencies({clock, ids: new ReusingEntryIds()}),
    );
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Original ID owner',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter;
    await workspace.maintenance.purgeExpiredTrash();

    const reused = await workspace.meals.capture({
      mealStart: clock.value + 1,
      name: 'Attempted reuse',
    });

    expect(reused).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE},
    });
    expect(
      workspace.meals.getListSnapshot({includeTrashed: true}).items,
    ).toHaveLength(0);
    expect(workspace.maintenance.getTombstoneSnapshot()).toHaveLength(1);
  });

  it('rejects persisted purge operations with an unknown operation kind', async () => {
    const store = new InMemoryJournalLocalStore();
    const clock = new MutableClock();
    const workspace = await openWorkspace(
      dependencies({clock, localStore: store}),
    );
    const captured = await workspace.meals.capture({
      mealStart: clock.value,
      name: 'Corrupt later',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok || trashed.value.lifecycle.kind !== 'trashed') {
      throw new Error('Meal was not trashed.');
    }
    clock.value = trashed.value.lifecycle.purgeAfter;
    await workspace.maintenance.purgeExpiredTrash();
    const persisted = await store.read(workspace.scope);
    const corrupt = persisted.value as {
      readonly outbox: {kind: string}[];
    };
    corrupt.outbox[0]!.kind = 'unknown';
    store.seed(workspace.scope, corrupt);

    const reopened = await createJournalEngine(
      dependencies({clock, localStore: store}),
    ).open(workspace.scope);

    expect(reopened).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE, retryable: false},
    });
  });

  it('keeps observation snapshot references stable until a committed change', async () => {
    const workspace = await openWorkspace(dependencies());
    const before = workspace.meals.getListSnapshot();
    expect(workspace.meals.getListSnapshot()).toBe(before);

    await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'A meal',
    });

    const after = workspace.meals.getListSnapshot();
    expect(after).not.toBe(before);
    expect(workspace.meals.getListSnapshot()).toBe(after);
  });

  it('paginates newest-first and applies one shared time-range contract', async () => {
    const workspace = await openWorkspace(dependencies());
    const starts = [
      1_700_000_000_000, 1_700_000_060_000, 1_700_000_120_000,
    ] as const;
    for (const [index, mealStart] of starts.entries()) {
      await workspace.meals.capture({mealStart, name: `Meal ${index + 1}`});
    }

    const first = await workspace.meals.list({limit: 2});
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.items.map(item => item.name)).toEqual([
      'Meal 3',
      'Meal 2',
    ]);
    expect(first.value.nextCursor).toBe('journal-offset:2');
    const nextCursor = first.value.nextCursor;
    if (nextCursor === undefined) {
      throw new Error('Expected another page.');
    }

    const second = await workspace.meals.list({
      limit: 2,
      cursor: nextCursor,
    });
    expect(second).toMatchObject({
      ok: true,
      value: {items: [{name: 'Meal 1'}]},
    });

    const ranged = await workspace.meals.list({
      timeRange: {
        fromInclusive: starts[1],
        toExclusive: starts[2] + 1,
      },
    });
    expect(ranged).toMatchObject({
      ok: true,
      value: {items: [{name: 'Meal 3'}, {name: 'Meal 2'}]},
    });
  });

  it('rejects malformed list cursors and runtime-invalid query fields consistently', async () => {
    const workspace = await openWorkspace(dependencies());
    const invalidQueries = [
      {cursor: 'start-over'},
      {cursor: 'journal-offset:9007199254740992'},
      {timeRange: {fromInclusive: Number.NaN, toExclusive: 10}},
      {includeTrashed: 'yes'},
    ] as const;

    for (const query of invalidQueries) {
      const mealResult = await workspace.meals.list(
        query as Parameters<typeof workspace.meals.list>[0],
      );
      const activityResult = await workspace.activities.list(
        query as Parameters<typeof workspace.activities.list>[0],
      );
      expect(mealResult).toMatchObject({
        ok: false,
        error: {code: JOURNAL_ERROR_CODES.INVALID_INPUT},
      });
      expect(activityResult).toMatchObject({
        ok: false,
        error: {code: JOURNAL_ERROR_CODES.INVALID_INPUT},
      });
    }
  });

  it('restores a trashed entry without losing its domain data', async () => {
    const workspace = await openWorkspace(dependencies());
    const captured = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Offline dinner',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 42},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await workspace.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok) {
      throw new Error(trashed.error.message);
    }

    expect(await workspace.meals.list()).toMatchObject({
      ok: true,
      value: {items: []},
    });
    const restored = await workspace.meals.restore({
      mealId: trashed.value.id,
      expectedRevision: trashed.value.revision,
    });

    expect(restored).toMatchObject({
      ok: true,
      value: {
        lifecycle: {kind: 'active'},
        name: 'Offline dinner',
        mealCarbohydrates: {grams: 42},
      },
    });
  });

  it('stages an image before committing and never commits a staging failure', async () => {
    const store = new TrackingStore();
    const events: string[] = [];
    const mediaStore: JournalMediaStore = {
      async stageMealImage(): Promise<MealImageSnapshot> {
        events.push('stage');
        throw new Error('temporary picker URI disappeared');
      },
      async removeMealImage(): Promise<void> {
        events.push('remove');
      },
    };
    const workspace = await openWorkspace(
      dependencies({localStore: store, mediaStore}),
    );

    const result = await workspace.meals.capture({
      mealStart: 1_700_000_000_000,
      image: {uri: 'picker://meal', mimeType: 'image/jpeg'},
    });

    expect(result).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.MEDIA_UNAVAILABLE},
    });
    expect(events).toEqual(['stage']);
    expect(store.commits).toBe(0);
  });

  it('uses a read-only external candidate Adapter', async () => {
    const calls: string[] = [];
    const externalRecords: JournalExternalRecordReader = {
      async findMealCandidates(_scope, input) {
        calls.push(`meal:${input.nearMealStart}`);
        return journalOk([]);
      },
      async findActivityCandidates(_scope, input) {
        calls.push(`activity:${input.nearStartedAt}`);
        return journalOk([]);
      },
      async readLinkedRecord(_scope, input) {
        return journalOk({
          kind: 'available',
          record: input.record,
          snapshot: input.lastKnown,
        });
      },
    };
    const workspace = await openWorkspace(dependencies({externalRecords}));

    await workspace.meals.findLinkCandidates({
      nearMealStart: 1_700_000_000_000,
    });
    await workspace.activities.findLinkCandidates({
      nearStartedAt: 1_700_000_100_000,
    });

    expect(calls).toEqual(['meal:1700000000000', 'activity:1700000100000']);
  });
});
