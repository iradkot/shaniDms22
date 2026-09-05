import {
  JOURNAL_ERROR_CODES,
  journalError,
  journalOk,
} from '../contracts/result';
import type {JournalResult} from '../contracts/result';
import {
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../domain/identifiers';
import type {JournalWorkspaceScope} from '../domain/journal';
import {LocalActivitiesWorkspace} from './activitiesWorkspaceImpl';
import {LocalMealsWorkspace} from './mealsWorkspaceImpl';
import {LocalJournalMaintenance} from './journalMaintenanceImpl';
import {invalidInput} from './operationHelpers';
import {decodePersistedJournalState, emptyJournalState} from './stateCodec';
import type {
  JournalEngine,
  JournalEngineDependencies,
  JournalWorkspace,
} from './types';
import {JournalWorkspaceRuntime} from './workspaceRuntime';
import {createJournalSyncCoordinator} from '../sync/coordinator';
import type {JournalSyncController} from '../sync/coordinator';

const disabledSyncController: JournalSyncController = {
  getSnapshot: () => ({
    kind: 'disabled',
    reason: 'remote_adapter_unavailable',
  }),
  subscribe: () => () => undefined,
  synchronize: async () => ({
    ok: false,
    error: {
      kind: 'disabled',
      reason: 'remote_adapter_unavailable',
      retryable: false,
    },
  }),
  activate: () => () => undefined,
};

const scopeKey = (scope: JournalWorkspaceScope): string =>
  [scope.productUserId, scope.workspaceId, scope.nightscoutSourceId]
    .map(value => encodeURIComponent(value))
    .join(':');

const validateScope = (
  scope: JournalWorkspaceScope,
): JournalResult<JournalWorkspaceScope> => {
  const productUserId = parseProductUserId(scope.productUserId, [
    'scope',
    'productUserId',
  ]);
  const workspaceId = parseWorkspaceId(scope.workspaceId, [
    'scope',
    'workspaceId',
  ]);
  const nightscoutSourceId = parseNightscoutSourceId(scope.nightscoutSourceId, [
    'scope',
    'nightscoutSourceId',
  ]);
  if (!productUserId.ok || !workspaceId.ok || !nightscoutSourceId.ok) {
    return invalidInput([
      ...(!productUserId.ok ? productUserId.issues : []),
      ...(!workspaceId.ok ? workspaceId.issues : []),
      ...(!nightscoutSourceId.ok ? nightscoutSourceId.issues : []),
    ]);
  }
  return journalOk({
    productUserId: productUserId.value,
    workspaceId: workspaceId.value,
    nightscoutSourceId: nightscoutSourceId.value,
  });
};

const localOpenFailure = (error: unknown): JournalResult<JournalWorkspace> =>
  journalError({
    code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE,
    message:
      error instanceof Error
        ? `The local Journal could not be opened: ${error.message}`
        : 'The local Journal could not be opened.',
    retryable: true,
  });

export const createJournalEngine = (
  dependencies: JournalEngineDependencies,
): JournalEngine => {
  const workspaces = new Map<
    string,
    Promise<JournalResult<JournalWorkspace>>
  >();

  const open = async (
    untrustedScope: JournalWorkspaceScope,
  ): Promise<JournalResult<JournalWorkspace>> => {
    const validatedScope = validateScope(untrustedScope);
    if (!validatedScope.ok) {
      return validatedScope;
    }
    const scope = validatedScope.value;
    const key = scopeKey(scope);
    const existing = workspaces.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const loading = (async (): Promise<JournalResult<JournalWorkspace>> => {
      let localRead;
      try {
        localRead = await dependencies.localStore.read(scope);
      } catch (error) {
        return localOpenFailure(error);
      }
      const state =
        localRead.value === null
          ? emptyJournalState(scope)
          : decodePersistedJournalState(localRead.value, scope);
      if ('ok' in state && state.ok === false) {
        return journalError({
          code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE,
          message: `The local Journal data is invalid (${state.reason}).`,
          retryable: false,
        });
      }
      const persisted = 'ok' in state ? state.value : state;
      const runtime = new JournalWorkspaceRuntime(
        dependencies,
        persisted,
        localRead.generation,
      );
      const sync =
        dependencies.remoteAdapter === undefined
          ? disabledSyncController
          : createJournalSyncCoordinator(runtime, dependencies.remoteAdapter);
      const workspace: JournalWorkspace = {
        scope,
        meals: new LocalMealsWorkspace(runtime),
        activities: new LocalActivitiesWorkspace(runtime),
        maintenance: new LocalJournalMaintenance(runtime),
        outbox: {
          getSnapshot: runtime.getOutboxSnapshot,
          subscribe: runtime.subscribe,
        },
        sync,
      };
      return journalOk(workspace);
    })();
    workspaces.set(key, loading);
    loading.then(result => {
      if (!result.ok && result.error.retryable) {
        workspaces.delete(key);
      }
    });
    return loading;
  };

  return {open};
};
