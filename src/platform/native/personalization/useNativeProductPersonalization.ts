import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  resolveProductPersonalizationChange,
  type PersonalizationLayout,
  type ProductPersonalizationChange,
  type ProductPersonalizationSyncScope,
  type StoredProductPersonalization,
} from '../../../product/personalization';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from '../../../modules/workspaces';
import {nativeProductPersonalizationRepository} from './nativeProductPersonalizationStore';

export type NativeProductPersonalizationState =
  | {readonly status: 'unavailable'}
  | {readonly status: 'loading'}
  | {readonly status: 'error'; readonly message: string}
  | {
      readonly status: 'ready';
      readonly preferences: StoredProductPersonalization;
      readonly saving: boolean;
      readonly syncing: boolean;
      readonly pendingSyncCount: number;
      readonly remoteSyncEnabled: boolean;
      readonly saveError?: string;
      readonly syncError?: string;
      readonly save: (change: ProductPersonalizationChange) => Promise<boolean>;
    };

type ReadyState = Extract<
  NativeProductPersonalizationState,
  {readonly status: 'ready'}
>;

type InternalState =
  | {readonly status: 'unavailable' | 'loading'}
  | {readonly status: 'error'; readonly message: string}
  | Omit<ReadyState, 'save'>;

const syncErrorMessage =
  'Some preferences are waiting for a secure connection before syncing.';

export const useNativeProductPersonalization = (input: {
  readonly firebaseUserId?: string | null;
  readonly nightscoutBaseUrl?: string | null;
  readonly layout: PersonalizationLayout;
}): NativeProductPersonalizationState => {
  const scope = useMemo<ProductPersonalizationSyncScope | undefined>(() => {
    if (!input.firebaseUserId || !input.nightscoutBaseUrl) {
      return undefined;
    }
    const identity = deriveWorkspaceIdentity(
      {
        firebaseUserId: input.firebaseUserId,
        nightscoutBaseUrl: input.nightscoutBaseUrl,
      },
      sha1WorkspaceIdentityDigest,
    );
    return identity.ok
      ? {
          productUserId: identity.value.scope.productUserId,
          workspaceId: identity.value.scope.workspaceId,
          nightscoutSourceId: identity.value.scope.nightscoutSourceId,
          layout: input.layout,
        }
      : undefined;
  }, [input.firebaseUserId, input.layout, input.nightscoutBaseUrl]);
  const [loaded, setLoaded] = useState<InternalState>(() =>
    scope === undefined ? {status: 'unavailable'} : {status: 'loading'},
  );
  const scopeKey = scope
    ? `${scope.productUserId}:${scope.workspaceId}:${scope.nightscoutSourceId}:${scope.layout}`
    : 'unavailable';
  const [loadedScopeKey, setLoadedScopeKey] = useState(scopeKey);
  const renderedScopeKey = useRef(scopeKey);
  renderedScopeKey.current = scopeKey;
  const operationTail = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(0);
  const latestPreferences = useRef<StoredProductPersonalization | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setInterval> | undefined;
    latestSave.current += 1;
    latestPreferences.current = undefined;
    operationTail.current = Promise.resolve();
    if (scope === undefined) {
      setLoadedScopeKey(scopeKey);
      setLoaded({status: 'unavailable'});
      return () => {
        active = false;
      };
    }

    const enqueueSynchronization = () => {
      const sequence = latestSave.current;
      const run = operationTail.current.then(async () => {
        if (active) {
          setLoaded(current => {
            if (current.status !== 'ready') {
              return current;
            }
            const withoutSyncError = {...current};
            delete withoutSyncError.syncError;
            return {...withoutSyncError, syncing: true};
          });
        }
        try {
          const result =
            await nativeProductPersonalizationRepository.synchronize(scope);
          if (active && latestSave.current === sequence) {
            latestPreferences.current = result.preferences;
            setLoaded({
              status: 'ready',
              preferences: result.preferences,
              saving: false,
              syncing: false,
              pendingSyncCount: result.pendingCount,
              remoteSyncEnabled: result.remoteEnabled,
              ...(result.failedSections.length === 0
                ? {}
                : {syncError: syncErrorMessage}),
            });
          }
        } catch {
          if (active && latestSave.current === sequence) {
            setLoaded(current =>
              current.status === 'ready'
                ? {...current, syncing: false, syncError: syncErrorMessage}
                : current,
            );
          }
        }
      });
      operationTail.current = run.then(
        () => undefined,
        () => undefined,
      );
    };

    setLoadedScopeKey(scopeKey);
    setLoaded({status: 'loading'});
    nativeProductPersonalizationRepository
      .open(scope)
      .then(preferences => {
        if (!active) {
          return;
        }
        latestPreferences.current = preferences;
        setLoaded({
          status: 'ready',
          preferences,
          saving: false,
          syncing: false,
          pendingSyncCount: 0,
          remoteSyncEnabled: false,
        });
        enqueueSynchronization();
        retryTimer = setInterval(enqueueSynchronization, 30_000);
      })
      .catch(error => {
        if (active) {
          setLoaded({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Product preferences could not be opened.',
          });
        }
      });
    return () => {
      active = false;
      if (retryTimer !== undefined) {
        clearInterval(retryTimer);
      }
    };
  }, [scope, scopeKey]);

  const save = useCallback(
    async (change: ProductPersonalizationChange): Promise<boolean> => {
      if (
        scope === undefined ||
        renderedScopeKey.current !== scopeKey ||
        latestPreferences.current === undefined
      ) {
        return false;
      }
      const before = latestPreferences.current;
      const optimistic = resolveProductPersonalizationChange(before, change);
      latestPreferences.current = optimistic;
      const sequence = latestSave.current + 1;
      latestSave.current = sequence;
      setLoaded(current => ({
        status: 'ready',
        preferences: optimistic,
        saving: true,
        syncing: current.status === 'ready' ? current.syncing : false,
        pendingSyncCount:
          current.status === 'ready' ? current.pendingSyncCount : 0,
        remoteSyncEnabled:
          current.status === 'ready' ? current.remoteSyncEnabled : false,
      }));

      let locallySaved = false;
      let durable = optimistic;
      const write = operationTail.current.then(async () => {
        durable = await nativeProductPersonalizationRepository.save(
          scope,
          before,
          optimistic,
        );
        locallySaved = true;
        try {
          return await nativeProductPersonalizationRepository.synchronize(
            scope,
          );
        } catch {
          return undefined;
        }
      });
      operationTail.current = write.then(
        () => undefined,
        () => undefined,
      );
      try {
        const synchronized = await write;
        if (
          renderedScopeKey.current === scopeKey &&
          latestSave.current === sequence
        ) {
          const preferences = synchronized?.preferences ?? durable;
          latestPreferences.current = preferences;
          setLoaded({
            status: 'ready',
            preferences,
            saving: false,
            syncing: false,
            pendingSyncCount: synchronized?.pendingCount ?? 1,
            remoteSyncEnabled: synchronized?.remoteEnabled ?? false,
            ...(synchronized === undefined ||
            synchronized.failedSections.length > 0
              ? {syncError: syncErrorMessage}
              : {}),
          });
        }
      } catch (error) {
        if (
          renderedScopeKey.current === scopeKey &&
          latestSave.current === sequence
        ) {
          setLoaded({
            status: 'ready',
            preferences: optimistic,
            saving: false,
            syncing: false,
            pendingSyncCount: 1,
            remoteSyncEnabled: false,
            saveError:
              error instanceof Error
                ? error.message
                : 'Product preferences could not be saved.',
          });
        }
      }
      return locallySaved;
    },
    [scope, scopeKey],
  );

  if (loadedScopeKey !== scopeKey) {
    return scope === undefined ? {status: 'unavailable'} : {status: 'loading'};
  }
  return loaded.status === 'ready' ? {...loaded, save} : loaded;
};
