import {
  AppOwnedUriJournalMediaStore,
  createJournalEngine,
  decodeExternalRecordPayload,
  InMemoryJournalLocalStore,
  JOURNAL_ERROR_CODES,
  journalOk,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  toExternalRecordReference,
} from '../../../src/modules/journal';
import type {
  ExternalRecordReference,
  JournalClock,
  JournalExternalRecordReader,
  JournalIdGenerator,
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  JournalWorkspace,
  JournalWorkspaceScope,
  ParseResult,
  PersistedJournalState,
  ReadLinkedExternalRecordResult,
} from '../../../src/modules/journal';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
};

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('live-link-user')),
  workspaceId: valueOf(parseWorkspaceId('live-link-workspace')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('live-link-source')),
};

const record = (id: string): ExternalRecordReference => {
  const decoded = decodeExternalRecordPayload({_id: id}, scope.nightscoutSourceId);
  if (!decoded.ok) {
    throw new Error(JSON.stringify(decoded.issues));
  }
  return valueOf(toExternalRecordReference(decoded.value));
};

class Clock implements JournalClock {
  value = 1_800_000_000_000;
  now(): number {
    this.value += 1;
    return this.value;
  }
}

class Ids implements JournalIdGenerator {
  private entry = 0;
  private operation = 0;
  nextEntryId(kind: 'meal' | 'activity'): string {
    this.entry += 1;
    return `${kind}-live-${this.entry}`;
  }
  nextOperationId(): string {
    this.operation += 1;
    return `operation-live-${this.operation}`;
  }
}

class AtomicStore implements JournalLocalStore {
  readonly inner = new InMemoryJournalLocalStore();
  commits = 0;
  failNext = false;

  read(journalScope: JournalWorkspaceScope): Promise<JournalLocalRead> {
    return this.inner.read(journalScope);
  }

  async commit(
    journalScope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated atomic write failure');
    }
    const result = await this.inner.commit(
      journalScope,
      expectedGeneration,
      state,
    );
    if (result.ok) {
      this.commits += 1;
    }
    return result;
  }
}

const openWorkspace = async (options?: {
  readonly store?: AtomicStore;
  readonly readResult?: () => ReadLinkedExternalRecordResult;
}): Promise<JournalWorkspace> => {
  const externalRecords: JournalExternalRecordReader = {
    async findMealCandidates() {
      return journalOk([]);
    },
    async findActivityCandidates() {
      return journalOk([]);
    },
    async readLinkedRecord(_scope, input) {
      return journalOk(
        options?.readResult?.() ?? {
          kind: 'available',
          record: input.record,
          snapshot: input.lastKnown,
        },
      );
    },
  };
  const opened = await createJournalEngine({
    localStore: options?.store ?? new AtomicStore(),
    clock: new Clock(),
    ids: new Ids(),
    mediaStore: new AppOwnedUriJournalMediaStore(),
    externalRecords,
  }).open(scope);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  return opened.value;
};

describe('External Event live-link lifecycle', () => {
  it('re-reads an exact linked record and keeps its last-known facts when the source becomes unavailable', async () => {
    const linkedRecord = record('refresh-carb');
    let readResult: ReadLinkedExternalRecordResult = {
      kind: 'available',
      record: linkedRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_800_000_100_000,
        carbohydratesGrams: 18,
      },
    };
    const workspace = await openWorkspace({readResult: () => readResult});
    const captured = await workspace.meals.capture({
      mealStart: 1_800_000_100_000,
      name: 'Local meal survives refresh',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const linked = await workspace.meals.linkExternalEvent({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      record: linkedRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_800_000_100_000,
        carbohydratesGrams: 12,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }

    const refreshed = await workspace.meals.refreshExternalEvent({
      mealId: linked.value.id,
      expectedRevision: linked.value.revision,
      record: linkedRecord,
    });
    expect(refreshed).toMatchObject({
      ok: true,
      value: {
        name: 'Local meal survives refresh',
        reportedCarbohydrates: {
          kind: 'reported_carbohydrates',
          totalGrams: 18,
          componentCount: 1,
          stale: false,
        },
        externalLinks: [
          {external: {kind: 'available', snapshot: {carbohydratesGrams: 18}}},
        ],
      },
    });
    if (!refreshed.ok) {
      return;
    }

    readResult = {kind: 'unavailable', reason: 'source_unavailable'};
    const unavailable = await workspace.meals.refreshExternalEvent({
      mealId: refreshed.value.id,
      expectedRevision: refreshed.value.revision,
      record: linkedRecord,
    });
    expect(unavailable).toMatchObject({
      ok: true,
      value: {
        name: 'Local meal survives refresh',
        reportedCarbohydrates: {
          kind: 'reported_carbohydrates',
          totalGrams: 18,
          componentCount: 1,
          stale: true,
        },
        externalLinks: [
          {
            external: {
              kind: 'unavailable',
              reason: 'source_unavailable',
              lastKnown: {carbohydratesGrams: 18},
            },
          },
        ],
      },
    });
  });

  it('transfers a stable meal link only after confirmation and can undo the atomic transfer', async () => {
    const store = new AtomicStore();
    const workspace = await openWorkspace({store});
    const source = await workspace.meals.capture({
      mealStart: 1_800_001_000_000,
      name: 'Original meal',
    });
    const destination = await workspace.meals.capture({
      mealStart: 1_800_001_060_000,
      name: 'Correct meal',
    });
    if (!source.ok || !destination.ok) {
      throw new Error('Fixture capture failed.');
    }
    const linkedRecord = record('transfer-carb');
    const linked = await workspace.meals.linkExternalEvent({
      mealId: source.value.id,
      expectedRevision: source.value.revision,
      record: linkedRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_800_001_030_000,
        carbohydratesGrams: 5,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'unknown'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }

    const ordinaryLink = await workspace.meals.linkExternalEvent({
      mealId: destination.value.id,
      expectedRevision: destination.value.revision,
      record: linkedRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_800_001_030_000,
        carbohydratesGrams: 5,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    expect(ordinaryLink).toMatchObject({
      ok: false,
      error: {
        code: JOURNAL_ERROR_CODES.EXTERNAL_RECORD_ALREADY_LINKED,
        linkedEntryId: source.value.id,
      },
    });

    const commitsBeforeTransfer = store.commits;
    const transferred = await workspace.meals.transferExternalEvent({
      mealId: destination.value.id,
      expectedRevision: destination.value.revision,
      sourceMealId: linked.value.id,
      sourceExpectedRevision: linked.value.revision,
      confirmed: true,
      record: linkedRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_800_001_030_000,
        carbohydratesGrams: 5,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    expect(store.commits).toBe(commitsBeforeTransfer + 1);
    expect(transferred).toMatchObject({
      ok: true,
      value: {
        source: {id: source.value.id, externalLinks: []},
        destination: {id: destination.value.id, externalLinks: [{record: linkedRecord}]},
        undo: {kind: 'meal_external_transfer'},
      },
    });
    if (!transferred.ok) {
      return;
    }

    const undone = await workspace.meals.undoExternalEventTransfer(
      transferred.value.undo,
    );
    expect(undone).toMatchObject({
      ok: true,
      value: {
        source: {id: destination.value.id, externalLinks: []},
        destination: {id: source.value.id, externalLinks: [{record: linkedRecord}]},
      },
    });
  });

  it('leaves both activities unchanged if the one atomic transfer commit fails', async () => {
    const store = new AtomicStore();
    const workspace = await openWorkspace({store});
    const source = await workspace.activities.capture({
      category: 'walking',
      startedAt: 1_800_002_000_000,
      endedAt: 1_800_002_100_000,
    });
    const destination = await workspace.activities.capture({
      category: 'cycling',
      startedAt: 1_800_002_200_000,
      endedAt: 1_800_002_300_000,
    });
    if (!source.ok || !destination.ok) {
      throw new Error('Fixture capture failed.');
    }
    const linkedRecord = record('transfer-activity');
    const linked = await workspace.activities.linkExternalEvent({
      activityId: source.value.id,
      expectedRevision: source.value.revision,
      record: linkedRecord,
      snapshot: {
        kind: 'activity',
        startedAt: 1_800_002_000_000,
        endedAt: 1_800_002_100_000,
      },
      role: {kind: 'activity'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }
    store.failNext = true;

    const result = await workspace.activities.transferExternalEvent({
      activityId: destination.value.id,
      expectedRevision: destination.value.revision,
      sourceActivityId: source.value.id,
      sourceExpectedRevision: linked.value.revision,
      confirmed: true,
      record: linkedRecord,
      snapshot: {
        kind: 'activity',
        startedAt: 1_800_002_000_000,
        endedAt: 1_800_002_100_000,
      },
      role: {kind: 'activity'},
    });

    expect(result).toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE},
    });
    expect(
      workspace.activities.getSnapshot(source.value.id)?.externalLinks,
    ).toHaveLength(1);
    expect(
      workspace.activities.getSnapshot(destination.value.id)?.externalLinks,
    ).toHaveLength(0);
  });
});
