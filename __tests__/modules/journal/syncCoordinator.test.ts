import {
  AppOwnedUriJournalMediaStore,
  createJournalEngine,
  createInMemoryJournalRemoteAdapter,
  decodeExternalRecordPayload,
  InMemoryJournalLocalStore,
  JOURNAL_TRASH_RETENTION_MS,
  journalRemoteError,
  journalRemoteOk,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  toExternalRecordReference,
} from '../../../src/modules/journal';
import type {
  JournalClock,
  JournalIdGenerator,
  JournalRemoteAdapter,
  JournalRemotePullResponse,
  JournalRemotePushResponse,
  JournalRemoteResult,
  JournalSyncRetryScheduler,
  JournalSyncRetryTrigger,
  JournalWorkspaceScope,
  ParseResult,
  RemoteJournalChange,
} from '../../../src/modules/journal';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
};

const scope = (): JournalWorkspaceScope => ({
  productUserId: valueOf(parseProductUserId('owner-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
});

const externalRecord = (value: string) =>
  valueOf(
    toExternalRecordReference(
      valueOf(
        decodeExternalRecordPayload(
          {_id: value},
          valueOf(parseNightscoutSourceId('nightscout-1')),
        ),
      ),
    ),
  );

class TestClock implements JournalClock {
  constructor(public value = 1_700_000_000_000) {}

  now(): number {
    return this.value;
  }
}

class TestIds implements JournalIdGenerator {
  private entry = 0;
  private operation = 0;

  constructor(private readonly suffix = '') {}

  nextEntryId(kind: 'meal' | 'activity'): string {
    this.entry += 1;
    return `${kind}-${this.entry}${this.suffix}`;
  }

  nextOperationId(): string {
    this.operation += 1;
    return `operation-${this.operation}${this.suffix}`;
  }
}

class TestRetryScheduler implements JournalSyncRetryScheduler {
  private readonly scheduled: Array<{
    readonly delayMs: number;
    readonly task: () => void;
    cancelled: boolean;
    delivered: boolean;
  }> = [];

  schedule(delayMs: number, task: () => void): () => void {
    const scheduled = {
      delayMs,
      task,
      cancelled: false,
      delivered: false,
    };
    this.scheduled.push(scheduled);
    return () => {
      scheduled.cancelled = true;
    };
  }

  get pendingDelays(): readonly number[] {
    return this.scheduled
      .filter(item => !item.cancelled && !item.delivered)
      .map(item => item.delayMs);
  }

  runNext(): void {
    const next = this.scheduled.find(
      item => !item.cancelled && !item.delivered,
    );
    if (next === undefined) {
      throw new Error('No retry is scheduled.');
    }
    next.delivered = true;
    next.task();
  }

  runScheduledEvenIfCancelled(index: number): void {
    const scheduled = this.scheduled[index];
    if (scheduled === undefined) {
      throw new Error(`No retry exists at index ${index}.`);
    }
    scheduled.task();
  }
}

class TestRetryTrigger implements JournalSyncRetryTrigger {
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    this.listeners.forEach(listener => listener());
  }
}

const flushMicrotasks = async (): Promise<void> => {
  for (let iteration = 0; iteration < 12; iteration += 1) {
    await Promise.resolve();
  }
};

describe('offline-first Journal synchronisation', () => {
  it('keeps a local write and its durable outbox when the remote is offline', async () => {
    const remote: JournalRemoteAdapter = {
      async push() {
        return journalRemoteError({
          code: 'offline',
          message: 'No network',
          retryable: true,
        });
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const engine = createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    });
    const opened = await engine.open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    const captured = await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Offline dinner',
    });
    expect(captured.ok).toBe(true);

    const synced = await opened.value.sync.synchronize();

    expect(synced).toMatchObject({
      ok: false,
      error: {kind: 'offline', retryable: true},
    });
    expect(opened.value.meals.getListSnapshot().items).toHaveLength(1);
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);
    expect(opened.value.sync.getSnapshot()).toMatchObject({kind: 'offline'});
  });

  it('restarts with the durable outbox and removes it only after an exact acknowledgement', async () => {
    const localStore = new InMemoryJournalLocalStore();
    const dependencies = {
      localStore,
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    };
    const first = await createJournalEngine(dependencies).open(scope());
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const captured = await first.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Durable dinner',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const pushedOperations: string[] = [];
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        pushedOperations.push(change.operationId);
        return journalRemoteOk({
          kind: 'acknowledged',
          operationId: change.operationId,
          acceptedRevision: change.localRevision,
        });
      },
      async pull() {
        return journalRemoteOk({changes: [], cursor: 'cursor-1'});
      },
    };

    const restarted = await createJournalEngine({
      ...dependencies,
      remoteAdapter: remote,
    }).open(first.value.scope);
    if (!restarted.ok) {
      throw new Error(restarted.error.message);
    }
    const result = await restarted.value.sync.synchronize();

    expect(result).toEqual({ok: true, value: {pushed: 1, pulled: 0}});
    expect(pushedOperations).toEqual(['operation-1']);
    expect(restarted.value.outbox.getSnapshot()).toEqual([]);
    expect(
      restarted.value.meals.getSnapshot(captured.value.id)?.syncState,
    ).toMatchObject({kind: 'synced', syncedRevision: 1});
  });

  it('retries a lost acknowledgement idempotently without duplicating the remote change', async () => {
    const backend = createInMemoryJournalRemoteAdapter();
    let loseFirstAcknowledgement = true;
    const remote: JournalRemoteAdapter = {
      async push(input) {
        const accepted = await backend.push(input);
        if (accepted.ok && loseFirstAcknowledgement) {
          loseFirstAcknowledgement = false;
          return journalRemoteError({
            code: 'offline',
            message: 'Acknowledgement was lost',
            retryable: true,
          });
        }
        return accepted;
      },
      pull: input => backend.pull(input),
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.activities.capture({
      category: 'walking',
      startedAt: 1_700_000_000_000,
    });

    expect(await opened.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'offline'},
    });
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);

    expect(await opened.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 1, pulled: 0},
    });
    expect(opened.value.outbox.getSnapshot()).toHaveLength(0);
    const remoteFeed = await backend.pull({scope: opened.value.scope});
    expect(remoteFeed).toMatchObject({
      ok: true,
      value: {changes: [expect.objectContaining({operationId: 'operation-1'})]},
    });
    if (remoteFeed.ok) {
      expect(remoteFeed.value.changes).toHaveLength(1);
    }
  });

  it('retries a retryable failure in the background without another local write', async () => {
    const scheduler = new TestRetryScheduler();
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        pushAttempts += 1;
        if (pushAttempts < 3) {
          return journalRemoteError({
            code: 'offline',
            message: 'No network',
            retryable: true,
          });
        }
        return journalRemoteOk({
          kind: 'acknowledged',
          operationId: change.operationId,
          acceptedRevision: change.localRevision,
        });
      },
      async pull() {
        return journalRemoteOk({changes: [], cursor: 'cursor-recovered'});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Retry dinner',
    });

    const deactivate = opened.value.sync.activate({
      scheduler,
      retryPolicy: {initialDelayMs: 10, maximumDelayMs: 40},
    });
    await flushMicrotasks();

    expect(pushAttempts).toBe(1);
    expect(scheduler.pendingDelays).toEqual([10]);
    scheduler.runNext();
    await flushMicrotasks();
    expect(pushAttempts).toBe(2);
    expect(scheduler.pendingDelays).toEqual([20]);

    scheduler.runNext();
    await flushMicrotasks();

    expect(pushAttempts).toBe(3);
    expect(opened.value.outbox.getSnapshot()).toEqual([]);
    expect(opened.value.sync.getSnapshot()).toEqual({kind: 'idle'});
    expect(scheduler.pendingDelays).toEqual([]);
    deactivate();
  });

  it('retries immediately when connectivity or foreground state offers a retry opportunity', async () => {
    const scheduler = new TestRetryScheduler();
    const retryTrigger = new TestRetryTrigger();
    let online = false;
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        pushAttempts += 1;
        return online
          ? journalRemoteOk({
              kind: 'acknowledged',
              operationId: change.operationId,
              acceptedRevision: change.localRevision,
            })
          : journalRemoteError({
              code: 'offline',
              message: 'No network',
              retryable: true,
            });
      },
      async pull() {
        return journalRemoteOk({changes: [], cursor: 'cursor-online'});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.activities.capture({
      category: 'walking',
      startedAt: 1_700_000_000_000,
    });
    const deactivate = opened.value.sync.activate({
      scheduler,
      retryTrigger,
      retryPolicy: {initialDelayMs: 10_000},
    });
    await flushMicrotasks();
    expect(scheduler.pendingDelays).toEqual([10_000]);

    online = true;
    retryTrigger.emit();
    await flushMicrotasks();

    expect(pushAttempts).toBe(2);
    expect(opened.value.outbox.getSnapshot()).toEqual([]);
    expect(scheduler.pendingDelays).toEqual([]);
    deactivate();
  });

  it('caps exponential retry delays and cancels late timers when deactivated', async () => {
    const scheduler = new TestRetryScheduler();
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      async push() {
        pushAttempts += 1;
        return journalRemoteError({
          code: 'offline',
          message: 'No network',
          retryable: true,
        });
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Offline snack',
    });
    const deactivate = opened.value.sync.activate({
      scheduler,
      retryPolicy: {initialDelayMs: 10, maximumDelayMs: 25},
    });
    await flushMicrotasks();
    expect(scheduler.pendingDelays).toEqual([10]);

    scheduler.runNext();
    await flushMicrotasks();
    expect(scheduler.pendingDelays).toEqual([20]);
    scheduler.runNext();
    await flushMicrotasks();
    expect(scheduler.pendingDelays).toEqual([25]);
    scheduler.runNext();
    await flushMicrotasks();
    expect(scheduler.pendingDelays).toEqual([25]);

    deactivate();
    deactivate();
    expect(scheduler.pendingDelays).toEqual([]);
    scheduler.runScheduledEvenIfCancelled(3);
    await flushMicrotasks();

    expect(pushAttempts).toBe(4);
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);
  });

  it('treats the configured maximum retry delay as a hard upper bound', async () => {
    const scheduler = new TestRetryScheduler();
    const remote: JournalRemoteAdapter = {
      async push() {
        return journalRemoteError({
          code: 'offline',
          message: 'No network',
          retryable: true,
        });
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Hard retry cap',
    });
    const deactivate = opened.value.sync.activate({
      scheduler,
      retryPolicy: {initialDelayMs: 100, maximumDelayMs: 25},
    });
    await flushMicrotasks();

    expect(scheduler.pendingDelays).toEqual([25]);
    deactivate();
  });

  it('keeps retry ownership when one of multiple active consumers is disposed', async () => {
    const scheduler = new TestRetryScheduler();
    let resolvePush:
      | ((value: JournalRemoteResult<JournalRemotePushResponse>) => void)
      | undefined;
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      push() {
        pushAttempts += 1;
        if (pushAttempts === 1) {
          return new Promise(resolve => {
            resolvePush = resolve;
          });
        }
        return Promise.resolve(
          journalRemoteError({
            code: 'offline',
            message: 'Still offline',
            retryable: true,
          }),
        );
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Shared activation',
    });

    const deactivateFirst = opened.value.sync.activate({
      scheduler,
      retryPolicy: {initialDelayMs: 10},
    });
    await flushMicrotasks();
    const deactivateSecond = opened.value.sync.activate({
      scheduler,
      retryPolicy: {initialDelayMs: 10},
    });
    deactivateFirst();
    resolvePush?.(
      journalRemoteError({
        code: 'offline',
        message: 'No network',
        retryable: true,
      }),
    );
    await flushMicrotasks();

    expect(pushAttempts).toBe(2);
    expect(scheduler.pendingDelays).toEqual([10]);
    deactivateSecond();
    expect(scheduler.pendingDelays).toEqual([]);
  });

  it('does not automatically repeat a non-retryable remote rejection', async () => {
    const scheduler = new TestRetryScheduler();
    const retryTrigger = new TestRetryTrigger();
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      async push() {
        pushAttempts += 1;
        return journalRemoteError({
          code: 'permission_denied',
          message: 'Access denied',
          retryable: false,
        });
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Rejected meal',
    });
    const deactivate = opened.value.sync.activate({scheduler, retryTrigger});
    await flushMicrotasks();

    expect(pushAttempts).toBe(1);
    expect(scheduler.pendingDelays).toEqual([]);
    retryTrigger.emit();
    await flushMicrotasks();

    expect(pushAttempts).toBe(1);
    deactivate();
    retryTrigger.emit();
    await flushMicrotasks();
    expect(pushAttempts).toBe(1);
  });

  it('ignores a retryable failure that finishes after the active Workspace is disposed', async () => {
    const scheduler = new TestRetryScheduler();
    let resolvePush:
      | ((value: JournalRemoteResult<JournalRemotePushResponse>) => void)
      | undefined;
    const remote: JournalRemoteAdapter = {
      push() {
        return new Promise(resolve => {
          resolvePush = resolve;
        });
      },
      async pull() {
        throw new Error('pull must not run after a failed push');
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Disposed sync',
    });
    const deactivate = opened.value.sync.activate({scheduler});
    await flushMicrotasks();
    deactivate();
    resolvePush?.(
      journalRemoteError({
        code: 'offline',
        message: 'Late network failure',
        retryable: true,
      }),
    );
    await flushMicrotasks();

    expect(opened.value.sync.getSnapshot()).toEqual({kind: 'idle'});
    expect(scheduler.pendingDelays).toEqual([]);
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);
  });

  it('does not lose a retry opportunity emitted while a failed request is still in flight', async () => {
    const scheduler = new TestRetryScheduler();
    const retryTrigger = new TestRetryTrigger();
    let resolveFirstPush:
      | ((value: JournalRemoteResult<JournalRemotePushResponse>) => void)
      | undefined;
    let pushAttempts = 0;
    const remote: JournalRemoteAdapter = {
      push({change}) {
        pushAttempts += 1;
        if (pushAttempts === 1) {
          return new Promise(resolve => {
            resolveFirstPush = resolve;
          });
        }
        return Promise.resolve(
          journalRemoteOk({
            kind: 'acknowledged',
            operationId: change.operationId,
            acceptedRevision: change.localRevision,
          }),
        );
      },
      async pull() {
        return journalRemoteOk({changes: [], cursor: 'cursor-after-trigger'});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Reconnect race',
    });
    const deactivate = opened.value.sync.activate({
      scheduler,
      retryTrigger,
      retryPolicy: {initialDelayMs: 10_000},
    });
    await flushMicrotasks();

    retryTrigger.emit();
    resolveFirstPush?.(
      journalRemoteError({
        code: 'offline',
        message: 'The old request still failed',
        retryable: true,
      }),
    );
    await flushMicrotasks();

    expect(pushAttempts).toBe(2);
    expect(opened.value.outbox.getSnapshot()).toEqual([]);
    expect(scheduler.pendingDelays).toEqual([]);
    deactivate();
  });

  it('pulls a validated remote entry once and keeps it locally across restart', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const first = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const captured = await first.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Shared meal',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 36},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    expect((await first.value.sync.synchronize()).ok).toBe(true);

    const secondStore = new InMemoryJournalLocalStore();
    const secondEngineDependencies = {
      localStore: secondStore,
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    };
    const second = await createJournalEngine(secondEngineDependencies).open(
      first.value.scope,
    );
    if (!second.ok) {
      throw new Error(second.error.message);
    }

    expect(await second.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 0, pulled: 1},
    });
    expect(second.value.meals.getListSnapshot().items).toEqual([
      expect.objectContaining({
        id: captured.value.id,
        name: 'Shared meal',
        mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 36},
        syncState: expect.objectContaining({kind: 'synced'}),
      }),
    ]);
    expect(second.value.outbox.getSnapshot()).toEqual([]);

    const restarted = await createJournalEngine(secondEngineDependencies).open(
      first.value.scope,
    );
    if (!restarted.ok) {
      throw new Error(restarted.error.message);
    }
    expect(await restarted.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 0, pulled: 0},
    });
    expect(restarted.value.meals.getListSnapshot().items).toHaveLength(1);
  });

  it('rejects a valid change from another owner and never commits its cursor', async () => {
    const otherScope: JournalWorkspaceScope = {
      ...scope(),
      productUserId: valueOf(parseProductUserId('owner-2')),
    };
    const sourceBackend = createInMemoryJournalRemoteAdapter();
    const source = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: sourceBackend,
    }).open(otherScope);
    if (!source.ok) {
      throw new Error(source.error.message);
    }
    await source.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Another owner meal',
    });
    await source.value.sync.synchronize();
    const foreignFeed = await sourceBackend.pull({scope: otherScope});
    if (!foreignFeed.ok) {
      throw new Error(foreignFeed.error.message);
    }
    const requestedCursors: Array<string | undefined> = [];
    const maliciousRemote: JournalRemoteAdapter = {
      async push() {
        throw new Error('No local writes expected');
      },
      async pull(input) {
        requestedCursors.push(input.cursor);
        return journalRemoteOk({
          changes: foreignFeed.value.changes,
          cursor: 'foreign-cursor',
        });
      },
    };
    const target = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: maliciousRemote,
    }).open(scope());
    if (!target.ok) {
      throw new Error(target.error.message);
    }

    const firstAttempt = await target.value.sync.synchronize();
    const secondAttempt = await target.value.sync.synchronize();

    expect(firstAttempt).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    expect(secondAttempt).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    expect(requestedCursors).toEqual([undefined, undefined]);
    expect(target.value.meals.getListSnapshot().items).toEqual([]);
  });

  it('ignores a late pull after its Workspace activation is cancelled', async () => {
    let resolvePull:
      | ((value: JournalRemoteResult<JournalRemotePullResponse>) => void)
      | undefined;
    const requestedCursors: Array<string | undefined> = [];
    let pulls = 0;
    const remote: JournalRemoteAdapter = {
      async push() {
        throw new Error('No local writes expected');
      },
      pull(input) {
        pulls += 1;
        requestedCursors.push(input.cursor);
        if (pulls > 1) {
          return Promise.resolve(
            journalRemoteOk({changes: [], cursor: 'cursor-after-switch'}),
          );
        }
        return new Promise(resolve => {
          resolvePull = resolve;
        });
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    const deactivate = opened.value.sync.activate();
    const pending = opened.value.sync.synchronize();
    deactivate();
    resolvePull?.(journalRemoteOk({changes: [], cursor: 'stale-cursor'}));

    expect(await pending).toEqual({
      ok: false,
      error: {kind: 'cancelled', retryable: false},
    });
    expect(opened.value.sync.getSnapshot()).toEqual({kind: 'idle'});
    expect(await opened.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 0, pulled: 0},
    });
    expect(requestedCursors).toEqual([undefined, undefined]);
  });

  it('never acknowledges a newer local edit with an older in-flight result', async () => {
    let acknowledge:
      | ((value: JournalRemoteResult<JournalRemotePushResponse>) => void)
      | undefined;
    const remote: JournalRemoteAdapter = {
      push() {
        return new Promise(resolve => {
          acknowledge = resolve;
        });
      },
      async pull() {
        return journalRemoteOk({changes: [], cursor: 'cursor-race'});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const captured = await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Before',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }

    const pendingSync = opened.value.sync.synchronize();
    const revised = await opened.value.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'After'},
    });
    if (!revised.ok) {
      throw new Error(revised.error.message);
    }
    acknowledge?.(
      journalRemoteOk({
        kind: 'acknowledged',
        operationId: 'operation-1',
        acceptedRevision: captured.value.revision,
      }),
    );
    expect((await pendingSync).ok).toBe(true);

    expect(opened.value.meals.getSnapshot(captured.value.id)).toMatchObject({
      revision: 2,
      name: 'After',
      syncState: {kind: 'pending', operationCount: 1},
    });
    expect(opened.value.outbox.getSnapshot()).toEqual([
      expect.objectContaining({operationId: 'operation-2', localRevision: 2}),
    ]);
  });

  it('compacts an offline create and edits into one causally valid remote write', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const captured = await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Draft',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const revised = await opened.value.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      name: {kind: 'set', value: 'Final'},
      notes: {kind: 'set', value: 'Edited offline'},
    });
    if (!revised.ok) {
      throw new Error(revised.error.message);
    }

    expect(await opened.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 1, pulled: 0},
    });
    expect(opened.value.outbox.getSnapshot()).toEqual([]);
    const feed = await remote.pull({scope: opened.value.scope});
    expect(feed).toMatchObject({
      ok: true,
      value: {
        changes: [
          expect.objectContaining({
            baseRevision: null,
            localRevision: 2,
            changedFields: expect.arrayContaining(['name', 'notes']),
            document: expect.objectContaining({name: 'Final'}),
          }),
        ],
      },
    });
  });

  it('merges independent offline fields and uploads the combined revision', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const createDevice = (suffix: string) =>
      createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock: new TestClock(),
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      });
    const seed = await createDevice('-seed').open(scope());
    if (!seed.ok) {
      throw new Error(seed.error.message);
    }
    await seed.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Base name',
    });
    await seed.value.sync.synchronize();

    const left = await createDevice('-left').open(scope());
    const right = await createDevice('-right').open(scope());
    if (!left.ok || !right.ok) {
      throw new Error('Devices did not open.');
    }
    await left.value.sync.synchronize();
    await right.value.sync.synchronize();
    const leftBase = left.value.meals.getListSnapshot().items[0];
    const rightBase = right.value.meals.getListSnapshot().items[0];
    if (leftBase === undefined || rightBase === undefined) {
      throw new Error('Base meal was not pulled.');
    }
    await left.value.meals.revise({
      mealId: leftBase.id,
      expectedRevision: leftBase.revision,
      name: {kind: 'set', value: 'Left name'},
    });
    await right.value.meals.revise({
      mealId: rightBase.id,
      expectedRevision: rightBase.revision,
      notes: {kind: 'set', value: 'Right note'},
    });
    expect((await left.value.sync.synchronize()).ok).toBe(true);

    expect(await right.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 1, pulled: 0},
    });
    expect(right.value.meals.getSnapshot(rightBase.id)).toMatchObject({
      revision: 3,
      name: 'Left name',
      notes: 'Right note',
      syncState: {kind: 'synced', syncedRevision: 3},
    });
    expect(right.value.outbox.getSnapshot()).toEqual([]);
  });

  it('surfaces a same-field remote edit as a recoverable Journal Conflict', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const createDevice = (suffix: string) =>
      createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock: new TestClock(),
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      });
    const seed = await createDevice('-conflict-seed').open(scope());
    if (!seed.ok) {
      throw new Error(seed.error.message);
    }
    await seed.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Base',
    });
    await seed.value.sync.synchronize();
    const left = await createDevice('-conflict-left').open(scope());
    const right = await createDevice('-conflict-right').open(scope());
    if (!left.ok || !right.ok) {
      throw new Error('Devices did not open.');
    }
    await left.value.sync.synchronize();
    await right.value.sync.synchronize();
    const leftBase = left.value.meals.getListSnapshot().items[0];
    const rightBase = right.value.meals.getListSnapshot().items[0];
    if (leftBase === undefined || rightBase === undefined) {
      throw new Error('Base meal was not pulled.');
    }
    await left.value.meals.revise({
      mealId: leftBase.id,
      expectedRevision: leftBase.revision,
      name: {kind: 'set', value: 'Remote choice'},
    });
    await right.value.meals.revise({
      mealId: rightBase.id,
      expectedRevision: rightBase.revision,
      name: {kind: 'set', value: 'Local choice'},
    });
    await left.value.sync.synchronize();

    expect(await right.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    const conflicted = right.value.meals.getSnapshot(rightBase.id);
    expect(conflicted).toMatchObject({
      name: 'Local choice',
      syncState: {kind: 'conflict', conflictingFields: ['name']},
    });
    const inspected = await right.value.meals.inspectConflicts(rightBase.id);
    expect(inspected).toMatchObject({
      ok: true,
      value: [
        {
          conflictingFields: ['name'],
          proposal: {
            kind: 'meal_revision',
            changes: {name: {kind: 'set', value: 'Remote choice'}},
          },
          detectedValues: {
            name: {kind: 'present', value: 'Local choice'},
          },
        },
      ],
    });
    if (
      !inspected.ok ||
      inspected.value[0] === undefined ||
      conflicted === undefined
    ) {
      throw new Error('Expected a recoverable conflict.');
    }
    const resolved = await right.value.meals.resolveConflict({
      mealId: rightBase.id,
      conflictId: inspected.value[0].conflictId,
      expectedRevision: conflicted.revision,
      decision: 'keep_current',
    });
    expect(resolved.ok).toBe(true);
    expect(await right.value.sync.synchronize()).toMatchObject({ok: true});
    const finalFeed = await remote.pull({scope: right.value.scope});
    expect(finalFeed).toMatchObject({
      ok: true,
      value: {
        changes: [
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            document: expect.objectContaining({name: 'Local choice'}),
          }),
        ],
      },
    });
  });

  it('detects a same-field conflict hidden by a later independent remote revision', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const createDevice = (suffix: string) =>
      createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock: new TestClock(),
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      });
    const seed = await createDevice('-history-seed').open(scope());
    if (!seed.ok) {
      throw new Error(seed.error.message);
    }
    const captured = await seed.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Base',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    await seed.value.sync.synchronize();

    const remoteWriter = await createDevice('-history-remote').open(scope());
    const localWriter = await createDevice('-history-local').open(scope());
    if (!remoteWriter.ok || !localWriter.ok) {
      throw new Error('Devices did not open.');
    }
    await remoteWriter.value.sync.synchronize();
    await localWriter.value.sync.synchronize();
    const remoteBase = remoteWriter.value.meals.getSnapshot(captured.value.id);
    const localBase = localWriter.value.meals.getSnapshot(captured.value.id);
    if (remoteBase === undefined || localBase === undefined) {
      throw new Error('Base meal was not pulled.');
    }
    const localEdit = await localWriter.value.meals.revise({
      mealId: localBase.id,
      expectedRevision: localBase.revision,
      name: {kind: 'set', value: 'Local name'},
    });
    const remoteName = await remoteWriter.value.meals.revise({
      mealId: remoteBase.id,
      expectedRevision: remoteBase.revision,
      name: {kind: 'set', value: 'Remote name'},
    });
    if (!localEdit.ok || !remoteName.ok) {
      throw new Error('Concurrent name edits failed.');
    }
    await remoteWriter.value.sync.synchronize();
    const remoteNote = await remoteWriter.value.meals.revise({
      mealId: remoteName.value.id,
      expectedRevision: remoteName.value.revision,
      notes: {kind: 'set', value: 'Later remote note'},
    });
    if (!remoteNote.ok) {
      throw new Error(remoteNote.error.message);
    }
    await remoteWriter.value.sync.synchronize();

    expect(await localWriter.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    expect(localWriter.value.meals.getSnapshot(localBase.id)).toMatchObject({
      name: 'Local name',
      syncState: {kind: 'conflict', conflictingFields: ['name']},
    });
    expect(await localWriter.value.meals.inspectConflicts(localBase.id)).toMatchObject({
      ok: true,
      value: [
        {
          conflictingFields: ['name'],
          proposal: {
            kind: 'meal_revision',
            changes: {name: {kind: 'set', value: 'Remote name'}},
          },
        },
      ],
    });
  });

  it('persists and applies a concurrent external link conflict', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const createDevice = (suffix: string, localStore = new InMemoryJournalLocalStore()) => ({
      localStore,
      engine: createJournalEngine({
        localStore,
        clock: new TestClock(),
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      }),
    });
    const seedDevice = createDevice('-links-seed');
    const seed = await seedDevice.engine.open(scope());
    if (!seed.ok) {
      throw new Error(seed.error.message);
    }
    const captured = await seed.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Linked meal',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    await seed.value.sync.synchronize();

    const leftDevice = createDevice('-links-left');
    const rightStore = new InMemoryJournalLocalStore();
    const rightDevice = createDevice('-links-right', rightStore);
    const left = await leftDevice.engine.open(scope());
    const right = await rightDevice.engine.open(scope());
    if (!left.ok || !right.ok) {
      throw new Error('Devices did not open.');
    }
    await left.value.sync.synchronize();
    await right.value.sync.synchronize();
    const leftBase = left.value.meals.getSnapshot(captured.value.id);
    const rightBase = right.value.meals.getSnapshot(captured.value.id);
    if (leftBase === undefined || rightBase === undefined) {
      throw new Error('Base meal was not pulled.');
    }
    const leftRecord = externalRecord('remote-link');
    const rightRecord = externalRecord('local-link');
    await left.value.meals.linkExternalEvent({
      mealId: leftBase.id,
      expectedRevision: leftBase.revision,
      record: leftRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_010_000,
        carbohydratesGrams: 20,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    await right.value.meals.linkExternalEvent({
      mealId: rightBase.id,
      expectedRevision: rightBase.revision,
      record: rightRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_020_000,
        carbohydratesGrams: 15,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    await left.value.sync.synchronize();

    expect(await right.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    const conflicted = right.value.meals.getSnapshot(rightBase.id);
    expect(conflicted).toMatchObject({
      syncState: {kind: 'conflict', conflictingFields: ['externalLinks']},
    });
    const restarted = await createJournalEngine({
      localStore: rightStore,
      clock: new TestClock(),
      ids: new TestIds('-links-right-restarted'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!restarted.ok || conflicted === undefined) {
      throw new Error('Conflicted device did not reopen.');
    }
    const inspected = await restarted.value.meals.inspectConflicts(rightBase.id);
    expect(inspected).toMatchObject({
      ok: true,
      value: [
        {
          conflictingFields: ['externalLinks'],
          proposal: {
            kind: 'meal_external_links',
            externalLinks: [
              {record: expect.objectContaining({recordKey: leftRecord.recordKey})},
            ],
          },
          detectedValues: {
            externalLinks: {
              kind: 'present',
              value: [
                {record: expect.objectContaining({recordKey: rightRecord.recordKey})},
              ],
            },
          },
        },
      ],
    });
    if (!inspected.ok || inspected.value[0] === undefined) {
      throw new Error('Expected an inspectable external link conflict.');
    }
    const resolved = await restarted.value.meals.resolveConflict({
      mealId: rightBase.id,
      conflictId: inspected.value[0].conflictId,
      expectedRevision: conflicted.revision,
      decision: 'apply_proposed',
    });
    expect(resolved).toMatchObject({
      ok: true,
      value: {
        externalLinks: [
          {record: expect.objectContaining({recordKey: leftRecord.recordKey})},
        ],
      },
    });
    expect(await restarted.value.sync.synchronize()).toMatchObject({ok: true});
  });

  it('persists a concurrent external unlink conflict instead of silently returning', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const createDevice = (suffix: string) =>
      createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock: new TestClock(),
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      });
    const seed = await createDevice('-unlink-seed').open(scope());
    if (!seed.ok) {
      throw new Error(seed.error.message);
    }
    const captured = await seed.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Unlink conflict',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const originalRecord = externalRecord('original-link');
    const linked = await seed.value.meals.linkExternalEvent({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      record: originalRecord,
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_010_000,
        carbohydratesGrams: 25,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }
    await seed.value.sync.synchronize();
    const unlinker = await createDevice('-unlink-remote').open(scope());
    const linker = await createDevice('-unlink-local').open(scope());
    if (!unlinker.ok || !linker.ok) {
      throw new Error('Devices did not open.');
    }
    await unlinker.value.sync.synchronize();
    await linker.value.sync.synchronize();
    const unlinkBase = unlinker.value.meals.getSnapshot(captured.value.id);
    const linkBase = linker.value.meals.getSnapshot(captured.value.id);
    if (unlinkBase === undefined || linkBase === undefined) {
      throw new Error('Linked base was not pulled.');
    }
    await unlinker.value.meals.unlinkExternalEvent({
      mealId: unlinkBase.id,
      expectedRevision: unlinkBase.revision,
      record: originalRecord,
    });
    await linker.value.meals.linkExternalEvent({
      mealId: linkBase.id,
      expectedRevision: linkBase.revision,
      record: externalRecord('concurrent-link'),
      snapshot: {
        kind: 'carbohydrate',
        externalCarbTime: 1_700_000_020_000,
        carbohydratesGrams: 10,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    await unlinker.value.sync.synchronize();

    expect(await linker.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    expect(await linker.value.meals.inspectConflicts(linkBase.id)).toMatchObject({
      ok: true,
      value: [
        {
          conflictingFields: ['externalLinks'],
          proposal: {kind: 'meal_external_links', externalLinks: []},
        },
      ],
    });
  });

  it('pulls an acknowledged purge as a durable remote tombstone', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const ownerClock = new TestClock();
    const owner = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: ownerClock,
      ids: new TestIds('-purge-owner'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!owner.ok) {
      throw new Error(owner.error.message);
    }
    const captured = await owner.value.activities.capture({
      category: 'cycling',
      startedAt: ownerClock.value,
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    await owner.value.sync.synchronize();

    const followerStore = new InMemoryJournalLocalStore();
    const followerDependencies = {
      localStore: followerStore,
      clock: new TestClock(),
      ids: new TestIds('-purge-follower'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    };
    const follower = await createJournalEngine(followerDependencies).open(
      owner.value.scope,
    );
    if (!follower.ok) {
      throw new Error(follower.error.message);
    }
    await follower.value.sync.synchronize();
    expect(
      follower.value.activities.getSnapshot(captured.value.id),
    ).toBeDefined();

    const trashed = await owner.value.activities.trash({
      activityId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok) {
      throw new Error(trashed.error.message);
    }
    await owner.value.sync.synchronize();
    ownerClock.value += JOURNAL_TRASH_RETENTION_MS;
    await owner.value.maintenance.purgeExpiredTrash();
    await owner.value.sync.synchronize();

    expect(await follower.value.sync.synchronize()).toMatchObject({
      ok: true,
      value: {pulled: 2},
    });
    expect(
      follower.value.activities.getSnapshot(captured.value.id),
    ).toBeUndefined();
    const restarted = await createJournalEngine(followerDependencies).open(
      owner.value.scope,
    );
    if (!restarted.ok) {
      throw new Error(restarted.error.message);
    }
    expect(
      restarted.value.activities.getSnapshot(captured.value.id),
    ).toBeUndefined();
    expect(await restarted.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 0, pulled: 0},
    });
  });

  it('opens schema-v1 local state written before sync cursor fields existed', async () => {
    const store = new InMemoryJournalLocalStore();
    const first = await createJournalEngine({
      localStore: store,
      clock: new TestClock(),
      ids: new TestIds('-legacy'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    }).open(scope());
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    await first.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Old local schema',
    });
    const stored = await store.read(first.value.scope);
    const legacy = {...(stored.value as Record<string, unknown>)};
    delete legacy.remoteCursor;
    delete legacy.remoteTombstones;
    store.seed(first.value.scope, legacy);

    const reopened = await createJournalEngine({
      localStore: store,
      clock: new TestClock(),
      ids: new TestIds('-legacy-reopen'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    }).open(first.value.scope);

    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.meals.getListSnapshot().items).toHaveLength(1);
    }
  });

  it('rejects reuse of an idempotency key for different medical content', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds('-idempotency'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Original content',
    });
    await opened.value.sync.synchronize();
    const feed = await remote.pull({scope: opened.value.scope});
    if (!feed.ok || feed.value.changes.length !== 1) {
      throw new Error('Expected one remote change.');
    }
    const original = feed.value.changes[0] as RemoteJournalChange;
    if (
      original.changeKind !== 'upsert' ||
      original.document.documentKind !== 'meal'
    ) {
      throw new Error('Expected a remote upsert.');
    }
    const forged: RemoteJournalChange = {
      ...original,
      document: {...original.document, name: 'Forged content'},
    };

    expect(
      await remote.push({scope: opened.value.scope, change: forged}),
    ).toMatchObject({
      ok: false,
      error: {code: 'remote_rejected', retryable: false},
    });
  });

  it('syncs a purge even when an entry lived entirely offline through retention', async () => {
    const remote = createInMemoryJournalRemoteAdapter();
    const clock = new TestClock();
    const localStore = new InMemoryJournalLocalStore();
    const dependencies = {
      localStore,
      clock,
      ids: new TestIds('-offline-purge'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: remote,
    };
    const opened = await createJournalEngine(dependencies).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const captured = await opened.value.meals.capture({
      mealStart: clock.value,
      name: 'Never uploaded',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const trashed = await opened.value.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok) {
      throw new Error(trashed.error.message);
    }
    clock.value += JOURNAL_TRASH_RETENTION_MS;
    await opened.value.maintenance.purgeExpiredTrash();

    expect(await opened.value.sync.synchronize()).toEqual({
      ok: true,
      value: {pushed: 1, pulled: 0},
    });
    const feed = await remote.pull({scope: opened.value.scope});
    expect(feed).toMatchObject({
      ok: true,
      value: {
        changes: [
          expect.objectContaining({changeKind: 'purge', baseRevision: null}),
        ],
      },
    });
    expect(opened.value.maintenance.getTombstoneSnapshot()).toHaveLength(1);
    expect(opened.value.outbox.getSnapshot()).toEqual([]);

    const reopened = await createJournalEngine({
      ...dependencies,
      ids: new TestIds('-offline-purge-reopened'),
    }).open(opened.value.scope);
    expect(reopened).toMatchObject({ok: true});
    if (!reopened.ok) {
      throw new Error(reopened.error.message);
    }
    expect(reopened.value.maintenance.getTombstoneSnapshot()).toHaveLength(1);
    expect(reopened.value.outbox.getSnapshot()).toEqual([]);
  });

  it('never resurrects a reserved ID from an out-of-order remote upsert', async () => {
    const backend = createInMemoryJournalRemoteAdapter();
    const clock = new TestClock();
    const owner = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock,
      ids: new TestIds('-ordered-delete'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: backend,
    }).open(scope());
    if (!owner.ok) {
      throw new Error(owner.error.message);
    }
    const captured = await owner.value.meals.capture({
      mealStart: clock.value,
      name: 'Deleted remotely',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    await owner.value.sync.synchronize();
    const trashed = await owner.value.meals.trash({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok) {
      throw new Error(trashed.error.message);
    }
    await owner.value.sync.synchronize();
    clock.value += JOURNAL_TRASH_RETENTION_MS;
    await owner.value.maintenance.purgeExpiredTrash();
    await owner.value.sync.synchronize();
    const feed = await backend.pull({scope: owner.value.scope});
    if (!feed.ok) {
      throw new Error(feed.error.message);
    }
    const reversed: JournalRemoteAdapter = {
      async push() {
        throw new Error('No local writes expected');
      },
      async pull() {
        return journalRemoteOk({
          changes: [...feed.value.changes].reverse(),
          cursor: 'reversed-feed',
        });
      },
    };
    const target = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: new TestClock(),
      ids: new TestIds('-reversed-target'),
      mediaStore: new AppOwnedUriJournalMediaStore(),
      remoteAdapter: reversed,
    }).open(owner.value.scope);
    if (!target.ok) {
      throw new Error(target.error.message);
    }

    await target.value.sync.synchronize();

    expect(target.value.meals.getSnapshot(captured.value.id)).toBeUndefined();
  });

  it.each(['keep_current', 'apply_proposed'] as const)(
    'rebases a remote purge conflict so %s can resync',
    async decision => {
    const remote = createInMemoryJournalRemoteAdapter();
    const ownerClock = new TestClock();
    const createDevice = (suffix: string, clock = new TestClock()) =>
      createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock,
        ids: new TestIds(suffix),
        mediaStore: new AppOwnedUriJournalMediaStore(),
        remoteAdapter: remote,
      });
    const owner = await createDevice(
      `-delete-owner-${decision}`,
      ownerClock,
    ).open(scope());
    if (!owner.ok) {
      throw new Error(owner.error.message);
    }
    const captured = await owner.value.activities.capture({
      category: 'walking',
      startedAt: ownerClock.value,
      notes: 'Base note',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    await owner.value.sync.synchronize();
    const editor = await createDevice(`-delete-editor-${decision}`).open(
      scope(),
    );
    if (!editor.ok) {
      throw new Error(editor.error.message);
    }
    await editor.value.sync.synchronize();
    const editorBase = editor.value.activities.getSnapshot(captured.value.id);
    if (editorBase === undefined) {
      throw new Error('Editor did not pull the Activity.');
    }
    await editor.value.activities.revise({
      activityId: editorBase.id,
      expectedRevision: editorBase.revision,
      notes: {kind: 'set', value: 'Unsynced local edit'},
    });
    const trashed = await owner.value.activities.trash({
      activityId: captured.value.id,
      expectedRevision: captured.value.revision,
    });
    if (!trashed.ok) {
      throw new Error(trashed.error.message);
    }
    await owner.value.sync.synchronize();
    ownerClock.value += JOURNAL_TRASH_RETENTION_MS;
    await owner.value.maintenance.purgeExpiredTrash();
    await owner.value.sync.synchronize();

    expect(await editor.value.sync.synchronize()).toMatchObject({
      ok: false,
      error: {kind: 'error', code: 'remote_rejected'},
    });
    expect(editor.value.activities.getSnapshot(editorBase.id)).toMatchObject({
      notes: 'Unsynced local edit',
      syncState: {kind: 'conflict', conflictingFields: ['lifecycle']},
    });
    const inspected = await editor.value.activities.inspectConflicts(
      editorBase.id,
    );
    expect(inspected).toMatchObject({
      ok: true,
      value: [
        {
          proposal: {kind: 'activity_lifecycle', lifecycle: 'trashed'},
          detectedValues: {
            lifecycle: {kind: 'present', value: {kind: 'active'}},
          },
        },
      ],
    });
    const conflicted = editor.value.activities.getSnapshot(editorBase.id);
    if (
      !inspected.ok ||
      inspected.value[0] === undefined ||
      conflicted === undefined
    ) {
      throw new Error('Expected a recoverable purge conflict.');
    }
    const resolved = await editor.value.activities.resolveConflict({
      activityId: editorBase.id,
      conflictId: inspected.value[0].conflictId,
      expectedRevision: conflicted.revision,
      decision,
    });
    expect(resolved).toMatchObject({
      ok: true,
      value: {
        notes: 'Unsynced local edit',
        lifecycle:
          decision === 'keep_current'
            ? {kind: 'active'}
            : {kind: 'trashed'},
      },
    });
    expect(await editor.value.sync.synchronize()).toMatchObject({
      ok: true,
      value: {pushed: 1},
    });
    expect(editor.value.outbox.getSnapshot()).toEqual([]);
    const feed = await remote.pull({scope: editor.value.scope});
    if (!feed.ok) {
      throw new Error(feed.error.message);
    }
    expect(feed.value.changes[feed.value.changes.length - 1]).toMatchObject({
      changeKind: 'upsert',
      baseRevision: expect.any(Number),
      document: {
        notes: 'Unsynced local edit',
        lifecycle:
          decision === 'keep_current'
            ? {kind: 'active'}
            : {kind: 'trashed'},
      },
    });
    },
  );
});
