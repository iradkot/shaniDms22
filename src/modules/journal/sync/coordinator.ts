import type {JournalWorkspaceRuntime} from '../engine/workspaceRuntime';
import type {JournalOutboxOperation} from '../engine/types';
import type {MealImageSnapshot} from '../domain/meals';
import {
  projectActivityRemoteDocument,
  projectMealRemoteDocument,
} from './remoteDocumentProjection';
import {
  JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
  type RemoteJournalChange,
} from './remoteChangeTypes';
import type {JournalRemoteAdapter, JournalRemoteFailure} from './remoteAdapter';
import {decodeRemoteJournalChange} from './remoteChangeCodec';

export type JournalSyncStatus =
  | {
      readonly kind: 'disabled';
      readonly reason: 'remote_adapter_unavailable';
    }
  | {readonly kind: 'idle'}
  | {readonly kind: 'syncing'; readonly startedAt: number}
  | {
      readonly kind: 'offline';
      readonly message: string;
      readonly retryable: boolean;
    }
  | {
      readonly kind: 'error';
      readonly code: JournalRemoteFailure['code'];
      readonly message: string;
      readonly retryable: boolean;
    };

export type JournalSyncRunResult =
  | {
      readonly ok: true;
      readonly value: {readonly pushed: number; readonly pulled: number};
    }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly kind: 'offline';
            readonly message: string;
            readonly retryable: boolean;
          }
        | {
            readonly kind: 'error';
            readonly code: JournalRemoteFailure['code'];
            readonly message: string;
            readonly retryable: boolean;
          }
        | {
            readonly kind: 'disabled';
            readonly reason: 'remote_adapter_unavailable';
            readonly retryable: false;
          }
        | {readonly kind: 'cancelled'; readonly retryable: false};
    };

export interface JournalSyncController {
  getSnapshot(): JournalSyncStatus;
  subscribe(listener: () => void): () => void;
  synchronize(): Promise<JournalSyncRunResult>;
  /** Starts background retries for this active Workspace. */
  activate(options?: JournalSyncActivationOptions): () => void;
}

export interface JournalSyncRetryScheduler {
  schedule(delayMs: number, task: () => void): () => void;
}

/**
 * Emits a retry opportunity, such as connectivity becoming available or the
 * application returning to the foreground. It carries no Workspace data.
 */
export interface JournalSyncRetryTrigger {
  subscribe(listener: () => void): () => void;
}

export interface JournalSyncRetryPolicy {
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
}

export interface JournalSyncActivationOptions {
  readonly scheduler?: JournalSyncRetryScheduler;
  readonly retryTrigger?: JournalSyncRetryTrigger;
  readonly retryPolicy?: Partial<JournalSyncRetryPolicy>;
}

const DEFAULT_RETRY_POLICY: JournalSyncRetryPolicy = {
  initialDelayMs: 1_000,
  maximumDelayMs: 60_000,
};

const defaultRetryScheduler: JournalSyncRetryScheduler = {
  schedule(delayMs, task) {
    const timer = setTimeout(task, delayMs);
    return () => clearTimeout(timer);
  },
};

const positiveFiniteInteger = (
  value: number | undefined,
  fallback: number,
): number =>
  value !== undefined && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;

const resolveRetryPolicy = (
  input: Partial<JournalSyncRetryPolicy> | undefined,
): JournalSyncRetryPolicy => {
  const requestedInitialDelayMs = positiveFiniteInteger(
    input?.initialDelayMs,
    DEFAULT_RETRY_POLICY.initialDelayMs,
  );
  const maximumDelayMs = positiveFiniteInteger(
    input?.maximumDelayMs,
    DEFAULT_RETRY_POLICY.maximumDelayMs,
  );
  return {
    initialDelayMs: Math.min(requestedInitialDelayMs, maximumDelayMs),
    maximumDelayMs,
  };
};

const compactOutbox = (
  operations: readonly JournalOutboxOperation[],
): readonly JournalOutboxOperation[] => {
  const groups = new Map<string, JournalOutboxOperation[]>();
  operations.forEach(operation => {
    const key = `${operation.entityKind}:${operation.entityId}`;
    const group = groups.get(key) ?? [];
    group.push(operation);
    groups.set(key, group);
  });
  return [...groups.values()].reduce<JournalOutboxOperation[]>(
    (output, group) => {
      const first = group[0];
      const latest = group[group.length - 1];
      if (first === undefined || latest === undefined) {
        return output;
      }
      if (latest.kind === 'purge') {
        output.push(latest);
        return output;
      }
      const changedFields = group.reduce<string[]>(
        (fields, operation) => [...fields, ...operation.changedFields],
        [],
      );
      output.push({
        ...latest,
        baseRevision: first.baseRevision,
        changedFields: [...new Set(changedFields)],
      });
      return output;
    },
    [],
  );
};

type ProjectChangeResult =
  | {
      readonly ok: true;
      readonly value: RemoteJournalChange;
      readonly preparedMealImage?: MealImageSnapshot;
    }
  | {readonly ok: false; readonly error: JournalRemoteFailure};

const projectChange = async (
  runtime: JournalWorkspaceRuntime,
  operation: JournalOutboxOperation,
): Promise<ProjectChangeResult> => {
  if (operation.kind === 'purge') {
    const tombstone = runtime
      .getTombstoneSnapshot()
      .find(
        item =>
          item.entityKind === operation.entityKind &&
          item.entityId === operation.entityId,
      );
    return tombstone === undefined
      ? {
          ok: false,
          error: {
            code: 'remote_rejected',
            message: 'A pending Journal purge could not be projected safely.',
            retryable: false,
          },
        }
      : {
          ok: true,
          value: {
          schemaVersion: JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
          changeKind: 'purge',
          operationId: operation.operationId,
          baseRevision: operation.baseRevision,
          localRevision: operation.localRevision,
          changedFields: operation.changedFields,
          scope: {
            ownerProductUserId: runtime.scope.productUserId,
            workspaceId: runtime.scope.workspaceId,
            nightscoutSourceId: runtime.scope.nightscoutSourceId,
          },
          tombstone,
          },
        };
  }
  let snapshot = runtime.getEntitySnapshot(
    operation.entityKind,
    operation.entityId,
  );
  let preparedMealImage: MealImageSnapshot | undefined;
  if (snapshot === undefined) {
    return {
      ok: false,
      error: {
        code: 'remote_rejected',
        message: 'A pending Journal operation has no local entity.',
        retryable: false,
      },
    };
  }
  if (
    snapshot.kind === 'meal' &&
    snapshot.image !== undefined &&
    runtime.dependencies.mediaStore.prepareMealImageForRemote !== undefined
  ) {
    const prepared = await runtime.dependencies.mediaStore.prepareMealImageForRemote(
      runtime.scope,
      snapshot.id,
      snapshot.image,
    );
    if (!prepared.ok) {
      return {
        ok: false,
        error: {
          code: prepared.error.retryable ? 'offline' : 'remote_rejected',
          message: prepared.error.message,
          retryable: prepared.error.retryable,
        },
      };
    }
    snapshot = {...snapshot, image: prepared.value};
    preparedMealImage = prepared.value;
  }
  const projected =
    snapshot.kind === 'meal'
      ? projectMealRemoteDocument(snapshot)
      : projectActivityRemoteDocument(snapshot);
  return projected.ok
    ? {
        ok: true,
        value: {
        schemaVersion: JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION,
        changeKind: 'upsert',
        operationId: operation.operationId,
        baseRevision: operation.baseRevision,
        localRevision: snapshot.revision,
        changedFields: operation.changedFields,
         document: projected.value,
         },
        ...(preparedMealImage === undefined ? {} : {preparedMealImage}),
       }
    : {
        ok: false,
        error: {
          code: 'remote_rejected',
          message: 'A pending Journal operation could not be projected safely.',
          retryable: false,
        },
      };
};

const failureResult = (error: JournalRemoteFailure): JournalSyncRunResult =>
  error.code === 'offline'
    ? {
        ok: false,
        error: {
          kind: 'offline',
          message: error.message,
          retryable: error.retryable,
        },
      }
    : {
        ok: false,
        error: {
          kind: 'error',
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      };

export const createJournalSyncCoordinator = (
  runtime: JournalWorkspaceRuntime,
  adapter: JournalRemoteAdapter,
): JournalSyncController => {
  let status: JournalSyncStatus = {kind: 'idle'};
  let activeGeneration = 0;
  let activeCount = 0;
  let running: Promise<JournalSyncRunResult> | undefined;
  let retryAttempt = 0;
  let retryScheduler = defaultRetryScheduler;
  let retryPolicy = DEFAULT_RETRY_POLICY;
  let cancelScheduledRetry: (() => void) | undefined;
  let immediateRetryRequested = false;
  const listeners = new Set<() => void>();
  let knownOperations = new Set(
    runtime.getOutboxSnapshot().map(operation => operation.operationId),
  );

  const publish = (next: JournalSyncStatus) => {
    status = next;
    listeners.forEach(listener => listener());
  };

  const cancelled = (): JournalSyncRunResult => {
    publish({kind: 'idle'});
    return {ok: false, error: {kind: 'cancelled', retryable: false}};
  };

  const cancelRetry = () => {
    cancelScheduledRetry?.();
    cancelScheduledRetry = undefined;
  };

  const scheduleRetry = (generation: number) => {
    if (
      activeCount === 0 ||
      generation !== activeGeneration ||
      cancelScheduledRetry !== undefined
    ) {
      return;
    }
    const delayMs = Math.min(
      retryPolicy.maximumDelayMs,
      retryPolicy.initialDelayMs * 2 ** Math.min(retryAttempt, 30),
    );
    retryAttempt = Math.min(retryAttempt + 1, 31);
    cancelScheduledRetry = retryScheduler.schedule(delayMs, () => {
      cancelScheduledRetry = undefined;
      if (activeCount === 0 || generation !== activeGeneration) {
        return;
      }
      synchronize().then(
        () => undefined,
        () => undefined,
      );
    });
  };

  const run = async (
    generation: number,
    mergeAttempts = 0,
  ): Promise<JournalSyncRunResult> => {
    publish({kind: 'syncing', startedAt: runtime.dependencies.clock.now()});
    let pushed = 0;
    for (const operation of compactOutbox(runtime.getOutboxSnapshot())) {
      if (generation !== activeGeneration && activeCount > 0) {
        return cancelled();
      }
      let projected;
      try {
        projected = await projectChange(runtime, operation);
      } catch (caught) {
        const error: JournalRemoteFailure = {
          code: 'unknown',
          message:
            caught instanceof Error
              ? caught.message
              : 'Meal Image preparation failed unexpectedly.',
          retryable: true,
        };
        publish({kind: 'error', ...error});
        return failureResult(error);
      }
      if (!projected.ok) {
        publish(
          projected.error.code === 'offline'
            ? {
                kind: 'offline',
                message: projected.error.message,
                retryable: projected.error.retryable,
              }
            : {kind: 'error', ...projected.error},
        );
        return failureResult(projected.error);
      }
      const change = projected.value;
      let result;
      try {
        result = await adapter.push({scope: runtime.scope, change});
      } catch (caught) {
        if (generation !== activeGeneration) {
          return cancelled();
        }
        const error: JournalRemoteFailure = {
          code: 'unknown',
          message:
            caught instanceof Error
              ? caught.message
              : 'The remote Journal adapter failed.',
          retryable: true,
        };
        publish({kind: 'error', ...error});
        return failureResult(error);
      }
      if (generation !== activeGeneration) {
        return cancelled();
      }
      if (!result.ok) {
        publish(
          result.error.code === 'offline'
            ? {
                kind: 'offline',
                message: result.error.message,
                retryable: result.error.retryable,
              }
            : {kind: 'error', ...result.error},
        );
        return failureResult(result.error);
      }
      if (result.value.kind === 'conflict') {
        const decodedConflict = decodeRemoteJournalChange(
          result.value.remoteChange,
        );
        if (decodedConflict.ok) {
          const remoteScope =
            decodedConflict.value.changeKind === 'upsert'
              ? decodedConflict.value.document.scope
              : decodedConflict.value.scope;
          if (
            remoteScope.ownerProductUserId === runtime.scope.productUserId &&
            remoteScope.workspaceId === runtime.scope.workspaceId &&
            remoteScope.nightscoutSourceId ===
              runtime.scope.nightscoutSourceId &&
            generation === activeGeneration
          ) {
            const integration = await runtime.integrateConcurrentRemoteChange(
              decodedConflict.value,
              runtime.dependencies.clock.now(),
            );
            if (integration === 'merged' && mergeAttempts < 3) {
              return run(generation, mergeAttempts + 1);
            }
          }
        }
        const error: JournalRemoteFailure = {
          code: 'remote_rejected',
          message: 'The remote Journal contains a concurrent revision.',
          retryable: false,
        };
        publish({kind: 'error', ...error});
        return failureResult(error);
      }
      if (
        result.value.operationId !== operation.operationId ||
        result.value.acceptedRevision !== change.localRevision
      ) {
        const error: JournalRemoteFailure = {
          code: 'remote_rejected',
          message: 'The remote Journal returned an invalid acknowledgement.',
          retryable: false,
        };
        publish({kind: 'error', ...error});
        return failureResult(error);
      }
      if (generation !== activeGeneration) {
        return cancelled();
      }
      await runtime.acknowledgeRemoteOperation(
        operation.operationId,
        result.value.acceptedRevision,
        runtime.dependencies.clock.now(),
        projected.preparedMealImage,
      );
      pushed += 1;
    }
    let pullResult;
    try {
      const cursor = runtime.getRemoteCursor();
      pullResult = await adapter.pull(
        cursor === undefined
          ? {scope: runtime.scope}
          : {scope: runtime.scope, cursor},
      );
    } catch (caught) {
      if (generation !== activeGeneration) {
        return cancelled();
      }
      const error: JournalRemoteFailure = {
        code: 'unknown',
        message:
          caught instanceof Error
            ? caught.message
            : 'The remote Journal adapter failed.',
        retryable: true,
      };
      publish({kind: 'error', ...error});
      return failureResult(error);
    }
    if (generation !== activeGeneration) {
      return cancelled();
    }
    if (!pullResult.ok) {
      publish(
        pullResult.error.code === 'offline'
          ? {
              kind: 'offline',
              message: pullResult.error.message,
              retryable: pullResult.error.retryable,
            }
          : {kind: 'error', ...pullResult.error},
      );
      return failureResult(pullResult.error);
    }
    if (
      pullResult.value.cursor !== undefined &&
      (pullResult.value.cursor.trim().length === 0 ||
        pullResult.value.cursor.length > 512)
    ) {
      const error: JournalRemoteFailure = {
        code: 'remote_rejected',
        message: 'The remote Journal returned an invalid cursor.',
        retryable: false,
      };
      publish({kind: 'error', ...error});
      return failureResult(error);
    }
    const decoded = pullResult.value.changes.map(decodeRemoteJournalChange);
    const invalidChange = decoded.find(change => !change.ok);
    if (invalidChange !== undefined) {
      const error: JournalRemoteFailure = {
        code: 'remote_rejected',
        message: 'The remote Journal returned an invalid change.',
        retryable: false,
      };
      publish({kind: 'error', ...error});
      return failureResult(error);
    }
    const changes = decoded.reduce<RemoteJournalChange[]>(
      (output, change) => (change.ok ? [...output, change.value] : output),
      [],
    );
    const wrongScope = changes.some(change => {
      const scope =
        change.changeKind === 'upsert' ? change.document.scope : change.scope;
      return (
        scope.ownerProductUserId !== runtime.scope.productUserId ||
        scope.workspaceId !== runtime.scope.workspaceId ||
        scope.nightscoutSourceId !== runtime.scope.nightscoutSourceId
      );
    });
    if (wrongScope) {
      const error: JournalRemoteFailure = {
        code: 'remote_rejected',
        message: 'The remote Journal returned a change from another scope.',
        retryable: false,
      };
      publish({kind: 'error', ...error});
      return failureResult(error);
    }
    if (generation !== activeGeneration) {
      return cancelled();
    }
    const pulled = await runtime.applyRemoteChanges(
      changes,
      pullResult.value.cursor,
      runtime.dependencies.clock.now(),
    );
    publish({kind: 'idle'});
    return {ok: true, value: {pushed, pulled}};
  };

  const synchronize = (): Promise<JournalSyncRunResult> => {
    if (running !== undefined) {
      return running;
    }
    const generation = activeGeneration;
    const clearRunning = () => {
      running = undefined;
      knownOperations = new Set(
        runtime.getOutboxSnapshot().map(operation => operation.operationId),
      );
    };
    const pending = run(generation);
    running = pending.then(
      result => {
        clearRunning();
        const retryImmediately =
          immediateRetryRequested &&
          activeCount > 0 &&
          !result.ok &&
          (result.error.retryable || result.error.kind === 'cancelled');
        immediateRetryRequested = false;
        if (result.ok) {
          retryAttempt = 0;
          cancelRetry();
        } else if (retryImmediately) {
          cancelRetry();
        } else if (result.error.retryable) {
          scheduleRetry(generation);
        }
        const hasPendingLocalWork =
          result.ok &&
          activeCount > 0 &&
          runtime.getOutboxSnapshot().length > 0;
        if (retryImmediately || hasPendingLocalWork) {
          Promise.resolve()
            .then(() => synchronize())
            .then(
              () => undefined,
              () => undefined,
            );
        }
        return result;
      },
      error => {
        clearRunning();
        throw error;
      },
    );
    return running;
  };

  const requestSynchronization = () => {
    cancelRetry();
    if (running !== undefined) {
      immediateRetryRequested = true;
      return;
    }
    synchronize().then(
      () => undefined,
      () => undefined,
    );
  };

  const activate = (options?: JournalSyncActivationOptions): (() => void) => {
    const beginsActiveSession = activeCount === 0;
    activeCount += 1;
    if (beginsActiveSession) {
      activeGeneration += 1;
      retryScheduler = options?.scheduler ?? defaultRetryScheduler;
      retryPolicy = resolveRetryPolicy(options?.retryPolicy);
      retryAttempt = 0;
      cancelRetry();
    }
    const generation = activeGeneration;
    requestSynchronization();
    const unsubscribe = runtime.subscribe(() => {
      const next = new Set(
        runtime.getOutboxSnapshot().map(operation => operation.operationId),
      );
      const hasNew = [...next].some(
        operation => !knownOperations.has(operation),
      );
      knownOperations = next;
      if (hasNew && activeCount > 0) {
        requestSynchronization();
      }
    });
    const unsubscribeRetryTrigger = options?.retryTrigger?.subscribe(() => {
      const blockedByNonRetryableFailure =
        (status.kind === 'offline' || status.kind === 'error') &&
        !status.retryable;
      if (
        activeCount === 0 ||
        generation !== activeGeneration ||
        blockedByNonRetryableFailure
      ) {
        return;
      }
      requestSynchronization();
    });
    let disposed = false;
    return () => {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      unsubscribeRetryTrigger?.();
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0 && generation === activeGeneration) {
        cancelRetry();
        retryAttempt = 0;
        immediateRetryRequested = false;
        activeGeneration += 1;
      }
    };
  };

  return {
    getSnapshot: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    synchronize,
    activate,
  };
};
