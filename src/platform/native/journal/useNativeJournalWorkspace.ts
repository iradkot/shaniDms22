import {useEffect, useMemo, useState} from 'react';
import type {
  JournalEngine,
  JournalResult,
  JournalWorkspace,
  JournalWorkspaceScope,
} from '../../../modules/journal';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from '../../../modules/workspaces';
import {nativeJournalEngine} from './nativeJournalEngine';
import {nativeJournalForegroundRetryTrigger} from './nativeJournalRetryTrigger';
import {retryPendingNativeMealImageDeletions} from '../mealMedia';

export type NativeJournalWorkspaceState =
  | {readonly status: 'unavailable'}
  | {readonly status: 'loading'}
  | {readonly status: 'ready'; readonly workspace: JournalWorkspace}
  | {readonly status: 'error'; readonly message: string};

/**
 * Opening maintenance is best-effort: retention is attempted on every app
 * session, while a cleanup failure never makes already-durable entries
 * unavailable to the Product User.
 */
export const openJournalWorkspaceWithMaintenance = async (
  engine: JournalEngine,
  scope: JournalWorkspaceScope,
): Promise<JournalResult<JournalWorkspace>> => {
  const opened = await engine.open(scope);
  if (!opened.ok) {
    return opened;
  }
  try {
    await opened.value.maintenance.purgeExpiredTrash();
  } catch {
    // A later session retries maintenance; opening the local Journal still wins.
  }
  return opened;
};

export const useNativeJournalWorkspace = (input: {
  readonly firebaseUserId?: string | null;
  readonly nightscoutBaseUrl?: string | null;
}): NativeJournalWorkspaceState => {
  const identity = useMemo(() => {
    if (!input.firebaseUserId || !input.nightscoutBaseUrl) {
      return undefined;
    }
    return deriveWorkspaceIdentity(
      {
        firebaseUserId: input.firebaseUserId,
        nightscoutBaseUrl: input.nightscoutBaseUrl,
      },
      sha1WorkspaceIdentityDigest,
    );
  }, [input.firebaseUserId, input.nightscoutBaseUrl]);
  const [state, setState] = useState<NativeJournalWorkspaceState>(() =>
    identity === undefined ? {status: 'unavailable'} : {status: 'loading'},
  );
  const [loadedScopeKey, setLoadedScopeKey] = useState(() =>
    identity?.ok ? identity.value.scope.workspaceId : 'unavailable',
  );
  const scopeKey = identity?.ok
    ? identity.value.scope.workspaceId
    : 'unavailable';
  const pendingState: NativeJournalWorkspaceState =
    identity === undefined
      ? {status: 'unavailable'}
      : identity.ok
        ? {status: 'loading'}
        : {status: 'error', message: identity.reason};

  useEffect(() => {
    let active = true;
    let deactivateSync: (() => void) | undefined;
    let unsubscribeMediaRetry: (() => void) | undefined;
    if (identity === undefined) {
      setLoadedScopeKey(scopeKey);
      setState({status: 'unavailable'});
      return () => {
        active = false;
      };
    }
    if (!identity.ok) {
      setLoadedScopeKey(scopeKey);
      setState({status: 'error', message: identity.reason});
      return () => {
        active = false;
      };
    }
    setLoadedScopeKey(scopeKey);
    setState({status: 'loading'});
    retryPendingNativeMealImageDeletions().catch(() => undefined);
    unsubscribeMediaRetry = nativeJournalForegroundRetryTrigger.subscribe(
      () => retryPendingNativeMealImageDeletions().catch(() => undefined),
    );
    openJournalWorkspaceWithMaintenance(
      nativeJournalEngine,
      identity.value.scope,
    ).then(result => {
      if (!active) {
        return;
      }
      if (result.ok) {
        deactivateSync = result.value.sync.activate({
          retryTrigger: nativeJournalForegroundRetryTrigger,
        });
      }
      setState(
        result.ok
          ? {status: 'ready', workspace: result.value}
          : {status: 'error', message: result.error.message},
      );
    });
    return () => {
      active = false;
      deactivateSync?.();
      unsubscribeMediaRetry?.();
    };
  }, [identity, scopeKey]);

  return loadedScopeKey === scopeKey ? state : pendingState;
};
