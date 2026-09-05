import type {
  JournalRemoteAdapter,
  JournalWorkspaceScope,
  RemoteJournalChange,
} from '../../../src/modules/journal';
import {
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../../../src/modules/journal';
import type {ParseResult} from '../../../src/modules/journal';
import {
  createFirebaseJournalRemoteAdapter,
  createNativeJournalRemoteAdapterRegistration,
} from '../../../src/platform/native/journal';
import type {
  JournalFirestoreCommitTime,
  JournalFirestoreGateway,
  JournalFirestoreOperationRecord,
  JournalFirestoreTransaction,
} from '../../../src/platform/native/journal';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
};

const scope = (owner = 'owner-1'): JournalWorkspaceScope => ({
  productUserId: valueOf(parseProductUserId(owner)),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
});

const upsert = (
  operationId: string,
  revision: number,
  baseRevision: number | null,
  owner = 'owner-1',
): RemoteJournalChange =>
  ({
    schemaVersion: 1,
    changeKind: 'upsert',
    operationId,
    baseRevision,
    localRevision: revision,
    changedFields: ['name'],
    document: {
      schemaVersion: 1,
      documentKind: 'meal',
      scope: {
        ownerProductUserId: owner,
        workspaceId: 'workspace-1',
        nightscoutSourceId: 'nightscout-1',
      },
      entityId: 'meal-1',
      revision,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000 + revision,
      lifecycle: {kind: 'active'},
      mealStart: 1_700_000_000_000,
      name: `Meal ${revision}`,
      image: {kind: 'none'},
      tags: [],
      externalLinks: [],
    },
  } as unknown as RemoteJournalChange);

const purge = (
  operationId: string,
  revision: number,
  baseRevision: number | null,
): RemoteJournalChange =>
  ({
    schemaVersion: 1,
    changeKind: 'purge',
    operationId,
    baseRevision,
    localRevision: revision,
    changedFields: ['purge'],
    scope: {
      ownerProductUserId: 'owner-1',
      workspaceId: 'workspace-1',
      nightscoutSourceId: 'nightscout-1',
    },
    tombstone: {
      kind: 'journal_tombstone',
      entityKind: 'meal',
      entityId: 'meal-1',
      purgedAt: 1_700_000_100_000,
      revision,
    },
  } as unknown as RemoteJournalChange);

const compareCommitTime = (
  left: JournalFirestoreCommitTime,
  right: JournalFirestoreCommitTime,
): number =>
  left.seconds === right.seconds
    ? left.nanoseconds - right.nanoseconds
    : left.seconds - right.seconds;

class MemoryFirestoreGateway implements JournalFirestoreGateway {
  readonly documents = new Map<string, unknown>();
  transactionCalls = 0;
  listCalls = 0;
  lastTransactionWriteCount = 0;
  private clock = 0;

  async runTransaction<T>(
    operation: (transaction: JournalFirestoreTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls += 1;
    const staged = new Map<string, unknown>();
    const transaction: JournalFirestoreTransaction = {
      get: async path => {
        const value = staged.has(path)
          ? staged.get(path)
          : this.documents.get(path);
        return value === undefined
          ? {exists: false}
          : {exists: true, data: value};
      },
      set: (path, value) => staged.set(path, value),
      serverTimestamp: () => {
        this.clock += 1;
        return {seconds: 1_700_000_000, nanoseconds: this.clock};
      },
    };
    const result = await operation(transaction);
    this.lastTransactionWriteCount = staged.size;
    staged.forEach((value, path) => this.documents.set(path, value));
    return result;
  }

  async listOperations(input: {
    readonly collectionPath: string;
    readonly after?: {
      readonly committedAt: JournalFirestoreCommitTime;
      readonly operationId: string;
    };
    readonly entryId?: string;
  }): Promise<readonly JournalFirestoreOperationRecord[]> {
    this.listCalls += 1;
    const prefix = `${input.collectionPath}/`;
    return [...this.documents.entries()]
      .filter(
        ([path, data]) =>
          path.startsWith(prefix) &&
          (input.entryId === undefined ||
            (data as {readonly entryId?: unknown}).entryId === input.entryId),
      )
      .map(([path, data]) => {
        const stored = data as {
          readonly committedAt: JournalFirestoreCommitTime;
        };
        return {
          operationId: path.slice(prefix.length),
          committedAt: stored.committedAt,
          data,
        };
      })
      .sort((left, right) => {
        const time = compareCommitTime(left.committedAt, right.committedAt);
        return time === 0
          ? left.operationId.localeCompare(right.operationId)
          : time;
      })
      .filter(record => {
        if (input.after === undefined) {
          return true;
        }
        const time = compareCommitTime(
          record.committedAt,
          input.after.committedAt,
        );
        return time >= 0;
      });
  }
}

const createAdapter = (
  gateway: JournalFirestoreGateway,
  authenticatedUid: () => string | null = () => 'owner-1',
): JournalRemoteAdapter =>
  createFirebaseJournalRemoteAdapter({gateway, authenticatedUid});

describe('native Firebase Journal remote adapter', () => {
  it('commits the change and immutable idempotency record atomically', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const change = upsert('operation-1', 1, null);

    await expect(adapter.push({scope: scope(), change})).resolves.toEqual({
      ok: true,
      value: {
        kind: 'acknowledged',
        operationId: 'operation-1',
        acceptedRevision: 1,
      },
    });
    expect(gateway.lastTransactionWriteCount).toBe(2);
    expect(gateway.documents.size).toBe(2);
  });

  it('acknowledges a lost-ack retry without duplicating or overwriting newer data', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const first = upsert('operation-1', 1, null);
    const second = upsert('operation-2', 2, 1);

    await adapter.push({scope: scope(), change: first});
    await adapter.push({scope: scope(), change: second});
    const retried = await adapter.push({scope: scope(), change: first});

    expect(retried).toEqual({
      ok: true,
      value: {
        kind: 'acknowledged',
        operationId: 'operation-1',
        acceptedRevision: 1,
      },
    });
    expect(gateway.documents.size).toBe(3);
    expect(
      gateway.documents.get(
        'users/owner-1/workspaces/workspace-1/journalEntries/meal-1',
      ),
    ).toEqual({
      schemaVersion: 1,
      entityId: 'meal-1',
      operationId: 'operation-2',
      localRevision: 2,
    });
  });

  it('rejects reuse of an operation ID with different content', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    await adapter.push({
      scope: scope(),
      change: upsert('operation-1', 1, null),
    });

    const result = await adapter.push({
      scope: scope(),
      change: upsert('operation-1', 2, 1),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {code: 'remote_rejected', retryable: false},
    });
    expect(gateway.documents.size).toBe(2);
  });

  it('returns the current remote change on a base-revision conflict', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const remote = upsert('operation-1', 1, null);
    await adapter.push({scope: scope(), change: remote});

    await expect(
      adapter.push({
        scope: scope(),
        change: upsert('operation-2', 3, 2),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {kind: 'conflict', remoteChange: remote},
    });
    expect(gateway.documents.size).toBe(2);
  });

  it('returns all intervening per-field history when the current head hides a conflict', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const base = upsert('operation-1', 1, null);
    const renamed = upsert('operation-2', 2, 1);
    const head = {
      ...upsert('operation-3', 3, 2),
      changedFields: ['notes'],
      document: {
        ...(upsert('operation-3', 3, 2) as Extract<
          RemoteJournalChange,
          {changeKind: 'upsert'}
        >).document,
        name: 'Meal 2',
        notes: 'Later remote note',
      },
    } as RemoteJournalChange;
    await adapter.push({scope: scope(), change: base});
    await adapter.push({scope: scope(), change: renamed});
    await adapter.push({scope: scope(), change: head});

    const result = await adapter.push({
      scope: scope(),
      change: {
        ...upsert('operation-local', 2, 1),
        document: {
          ...(upsert('operation-local', 2, 1) as Extract<
            RemoteJournalChange,
            {changeKind: 'upsert'}
          >).document,
          name: 'Local name',
        },
      } as RemoteJournalChange,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'conflict',
        remoteChange: {
          baseRevision: 1,
          localRevision: 3,
          changedFields: ['name', 'notes'],
          document: {name: 'Meal 2', notes: 'Later remote note'},
        },
      },
    });
  });

  it('compacts purged entry operations to digest-only idempotency markers', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    await adapter.push({
      scope: scope(),
      change: upsert('operation-1', 1, null),
    });
    await adapter.push({
      scope: scope(),
      change: upsert('operation-2', 2, 1),
    });
    await adapter.push({
      scope: scope(),
      change: purge('operation-3', 3, 2),
    });

    for (const operationId of ['operation-1', 'operation-2']) {
      const stored = gateway.documents.get(
        `users/owner-1/workspaces/workspace-1/journalOperations/${operationId}`,
      );
      expect(stored).toMatchObject({
        entryId: 'meal-1',
        compactedChange: {
          operationId,
          changeKind: 'upsert',
          contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
      expect(JSON.stringify(stored)).not.toContain('Meal ');
      expect(JSON.stringify(stored)).not.toContain('document');
    }
    await expect(adapter.pull({scope: scope()})).resolves.toMatchObject({
      ok: true,
      value: {
        changes: [expect.objectContaining({changeKind: 'purge'})],
      },
    });
    await expect(
      adapter.push({
        scope: scope(),
        change: upsert('operation-1', 1, null),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {kind: 'acknowledged', operationId: 'operation-1'},
    });
  });

  it('pulls the immutable operation stream once and advances an opaque cursor', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const first = upsert('operation-1', 1, null);
    const second = upsert('operation-2', 2, 1);
    await adapter.push({scope: scope(), change: first});
    await adapter.push({scope: scope(), change: second});

    const pulled = await adapter.pull({scope: scope()});
    expect(pulled).toMatchObject({
      ok: true,
      value: {changes: [first, second]},
    });
    if (!pulled.ok || pulled.value.cursor === undefined) {
      throw new Error('Expected the first pull to return a cursor.');
    }

    await expect(
      adapter.pull({scope: scope(), cursor: pulled.value.cursor}),
    ).resolves.toEqual({
      ok: true,
      value: {changes: [], cursor: pulled.value.cursor},
    });
  });

  it('does not miss a late operation that shares the cursor timestamp', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    await adapter.push({
      scope: scope(),
      change: upsert('operation-1', 1, null),
    });
    await adapter.push({
      scope: scope(),
      change: upsert('operation-2', 2, 1),
    });
    const firstPull = await adapter.pull({scope: scope()});
    if (!firstPull.ok || firstPull.value.cursor === undefined) {
      throw new Error('Expected a cursor.');
    }
    const secondOperation = gateway.documents.get(
      'users/owner-1/workspaces/workspace-1/journalOperations/operation-2',
    ) as {readonly committedAt: JournalFirestoreCommitTime};
    const late = upsert('operation-0', 3, 2);
    gateway.documents.set(
      'users/owner-1/workspaces/workspace-1/journalOperations/operation-0',
      {
        entryId: 'meal-1',
        change: late,
        committedAt: secondOperation.committedAt,
      },
    );

    await expect(
      adapter.pull({scope: scope(), cursor: firstPull.value.cursor}),
    ).resolves.toEqual({
      ok: true,
      value: {changes: [late], cursor: firstPull.value.cursor},
    });
  });

  it('rejects malformed cursors and wrong-scope documents at the adapter boundary', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);

    await expect(
      adapter.pull({scope: scope(), cursor: '{not-json'}),
    ).resolves.toMatchObject({
      ok: false,
      error: {code: 'remote_rejected', retryable: false},
    });
    expect(gateway.listCalls).toBe(0);

    const wrongScope = upsert('operation-1', 1, null, 'owner-2');
    gateway.documents.set(
      'users/owner-1/workspaces/workspace-1/journalOperations/operation-1',
      {
        entryId: 'meal-1',
        change: wrongScope,
        committedAt: {seconds: 1_700_000_000, nanoseconds: 1},
      },
    );
    await expect(adapter.pull({scope: scope()})).resolves.toMatchObject({
      ok: false,
      error: {code: 'remote_rejected', retryable: false},
    });
  });

  it('rejects cached Nightscout data before any Firestore write', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway);
    const base = upsert('operation-1', 1, null);
    if (base.changeKind !== 'upsert') {
      throw new Error('Expected an upsert fixture.');
    }
    const leaked = {
      ...base,
      document: {
        ...base.document,
        externalLinks: [
          {
            identity: {
              nightscoutSourceId: 'nightscout-1',
              recordKey: 'nightscout-1:_id:record-1',
              namespace: '_id',
              value: 'record-1',
            },
            role: {kind: 'reported_carbohydrate', purpose: 'meal'},
            linkedAt: 1_700_000_000_000,
            external: {snapshot: {sgv: 111, apiKey: 'must-not-sync'}},
          },
        ],
      },
    } as unknown as RemoteJournalChange;

    await expect(
      adapter.push({scope: scope(), change: leaked}),
    ).resolves.toMatchObject({
      ok: false,
      error: {code: 'remote_rejected', retryable: false},
    });
    expect(gateway.transactionCalls).toBe(0);
  });

  it('rejects cross-owner access before touching Firestore', async () => {
    const gateway = new MemoryFirestoreGateway();
    const adapter = createAdapter(gateway, () => 'owner-2');

    await expect(
      adapter.push({
        scope: scope(),
        change: upsert('operation-1', 1, null),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {code: 'permission_denied', retryable: false},
    });
    await expect(adapter.pull({scope: scope()})).resolves.toMatchObject({
      ok: false,
      error: {code: 'permission_denied', retryable: false},
    });
    expect(gateway.transactionCalls).toBe(0);
    expect(gateway.listCalls).toBe(0);
  });

  it('maps Firestore unavailability to a retryable offline result', async () => {
    const gateway: JournalFirestoreGateway = {
      runTransaction: async () => {
        throw Object.assign(new Error('network unavailable'), {
          code: 'firestore/unavailable',
        });
      },
      listOperations: async () => {
        throw Object.assign(new Error('network unavailable'), {
          code: 'firestore/unavailable',
        });
      },
    };
    const adapter = createAdapter(gateway);

    await expect(
      adapter.push({
        scope: scope(),
        change: upsert('operation-1', 1, null),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {code: 'offline', retryable: true},
    });
    await expect(adapter.pull({scope: scope()})).resolves.toMatchObject({
      ok: false,
      error: {code: 'offline', retryable: true},
    });
  });

  it('can enable registration only through an explicit verified-rules gate', () => {
    const gateway = new MemoryFirestoreGateway();
    const disabled = createNativeJournalRemoteAdapterRegistration({
      rulesVerified: false,
      gateway,
      authenticatedUid: () => 'owner-1',
    });
    const enabled = createNativeJournalRemoteAdapterRegistration({
      rulesVerified: true,
      gateway,
      authenticatedUid: () => 'owner-1',
    });

    expect(disabled).toEqual({
      enabled: false,
      reason: 'firestore_rules_not_emulator_verified',
    });
    expect(enabled.enabled).toBe(true);
  });
});
