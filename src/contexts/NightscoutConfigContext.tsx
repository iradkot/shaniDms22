import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createNightscoutProfile,
  countRecoverableLegacyNightscoutProfiles,
  labelFromNightscoutBaseUrl,
  loadNightscoutProfiles,
  normalizeNightscoutApiSecretToSha1,
  normalizeNightscoutUrl,
  persistNightscoutProfiles,
  recoverLegacyNightscoutProfiles,
  NightscoutProfile,
} from 'app/services/nightscoutProfiles';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {configureAndroidWidgetBackgroundSync} from 'app/services/androidGlucoseLiveSurface';
import {
  testNightscoutConnection,
  type NightscoutConnectionTestResult,
} from 'app/services/nightscoutConnectionTest';
import {
  nativeNightscoutVaultSynchronizer,
  nativeNightscoutVaultAuthSession,
} from 'app/services/backend/nativeNightscoutVaultSync';
import type {
  NightscoutVaultAuthSession,
  NightscoutVaultSyncSnapshot,
  NightscoutVaultSynchronizer,
} from 'app/services/backend/nightscoutVaultSynchronizer';

export type NightscoutConfigContextValue = {
  profiles: NightscoutProfile[];
  activeProfile: NightscoutProfile | null;
  isLoaded: boolean;
  /** Only a count is visible before the user confirms ownership of old device connections. */
  pendingLegacyProfileCount: number;
  /** Revalidates and restores old device connections after explicit user confirmation. */
  recoverLegacyProfiles: () => Promise<void>;
  /** Adds a profile and selects it as active. Accepts loosely formatted URL/secret inputs. */
  addProfile: (params: {
    urlInput: string;
    secretInput: string;
  }) => Promise<void>;
  /** Verifies a connection without persisting credentials or selecting a profile. */
  testProfileConnection: (params: {
    urlInput: string;
    secretInput?: string;
    profileId?: string;
  }) => Promise<NightscoutConnectionTestResult>;
  /** Switches the currently active profile by ID. */
  setActiveProfileId: (id: string) => Promise<void>;
  /** Updates an existing profile. If secretInput is empty, keeps the existing secret. */
  updateProfile: (params: {
    profileId: string;
    urlInput: string;
    secretInput?: string;
  }) => Promise<void>;
  /** Deletes a profile by ID and re-selects an active profile if needed. */
  deleteProfile: (profileId: string) => Promise<void>;
  /** Server-vault synchronization never blocks local Nightscout usage. */
  vaultSyncStatus: NightscoutVaultSyncSnapshot;
  /** Manually retries a durable pending server-vault reconciliation. */
  retryVaultSync: () => Promise<void>;
};

const NightscoutConfigContext = createContext<NightscoutConfigContextValue>({
  profiles: [],
  activeProfile: null,
  isLoaded: false,
  pendingLegacyProfileCount: 0,
  recoverLegacyProfiles: async () => {
    throw new Error('Sign in before recovering saved connections.');
  },
  addProfile: async () => {},
  testProfileConnection: async () => ({
    ok: true,
    entriesCount: 0,
    authMethod: 'query',
  }),
  setActiveProfileId: async () => {},
  updateProfile: async () => {},
  deleteProfile: async () => {},
  vaultSyncStatus: {state: 'idle', pending: false},
  retryVaultSync: async () => {},
});

export const useNightscoutConfig = () => useContext(NightscoutConfigContext);

/**
 * Loads Nightscout profiles from local storage and keeps the axios client
 * configured to the currently active profile.
 */
export const NightscoutConfigProvider = ({
  children,
  authSession = nativeNightscoutVaultAuthSession,
  vaultSynchronizer = nativeNightscoutVaultSynchronizer,
}: {
  children: React.ReactNode;
  /** Auth seam keeps every local profile and credential in one account namespace. */
  authSession?: NightscoutVaultAuthSession;
  /** Injection seam for deterministic tests and alternate Native runtimes. */
  vaultSynchronizer?: NightscoutVaultSynchronizer;
}) => {
  const [profiles, setProfiles] = useState<NightscoutProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(
    null,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [pendingLegacyProfileCount, setPendingLegacyProfileCount] = useState(0);
  const [vaultSyncStatus, setVaultSyncStatus] =
    useState<NightscoutVaultSyncSnapshot>(() =>
      vaultSynchronizer.getSnapshot(),
    );
  const [ownerUserId, setOwnerUserId] = useState<string | null>(
    () => authSession.getCurrentUserId()?.trim() || null,
  );
  const [ownerSessionRevision, setOwnerSessionRevision] = useState(0);
  const profilesRef = useRef<NightscoutProfile[]>([]);
  const activeProfileIdRef = useRef<string | null>(null);
  const ownerUserIdRef = useRef(ownerUserId);
  const ownerSessionRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const mutationTail = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  useEffect(() => {
    ownerUserIdRef.current = ownerUserId;
  }, [ownerUserId]);

  useEffect(() => {
    const unsubscribe = authSession.subscribe(userId => {
      const nextOwnerUserId = userId?.trim() || null;
      if (nextOwnerUserId === ownerUserIdRef.current) {
        return;
      }
      ownerUserIdRef.current = nextOwnerUserId;
      ownerSessionRevisionRef.current += 1;
      setOwnerSessionRevision(ownerSessionRevisionRef.current);
      profilesRef.current = [];
      activeProfileIdRef.current = null;
      setProfiles([]);
      setActiveProfileIdState(null);
      setIsLoaded(false);
      setPendingLegacyProfileCount(0);
      clearNightscoutInstance();
      configureAndroidWidgetBackgroundSync({enabled: false});
      setOwnerUserId(nextOwnerUserId);
    });
    return unsubscribe;
  }, [authSession]);

  useEffect(() => {
    let isMounted = true;
    const isCurrentSession = () =>
      isMounted &&
      ownerUserIdRef.current === ownerUserId &&
      ownerSessionRevisionRef.current === ownerSessionRevision;

    const load = async () => {
      try {
        const {profiles: storedProfiles, activeProfileId: storedActiveId} =
          await loadNightscoutProfiles(ownerUserId);

        if (!isCurrentSession()) {
          return;
        }

        const resolvedActiveId =
          storedActiveId && storedProfiles.some(p => p.id === storedActiveId)
            ? storedActiveId
            : storedProfiles[0]?.id ?? null;

        setProfiles(storedProfiles);
        profilesRef.current = storedProfiles;
        setActiveProfileIdState(resolvedActiveId);
        activeProfileIdRef.current = resolvedActiveId;

        if (resolvedActiveId) {
          const active =
            storedProfiles.find(p => p.id === resolvedActiveId) ?? null;
          if (active) {
            configureNightscoutInstance({
              baseUrl: active.baseUrl,
              apiSecretSha1: active.apiSecretSha1,
              ownerUserId,
            });
            configureAndroidWidgetBackgroundSync({
              baseUrl: active.baseUrl,
              apiSecretSha1: active.apiSecretSha1,
              enabled: true,
            });
          }
        } else {
          configureAndroidWidgetBackgroundSync({enabled: false});
        }

        // Persist repaired active ID if needed.
        if (storedProfiles.length > 0 && resolvedActiveId !== storedActiveId) {
          await persistNightscoutProfiles(
            storedProfiles,
            resolvedActiveId,
            ownerUserId,
          );
        }
        const recoveryCount = await countRecoverableLegacyNightscoutProfiles(
          ownerUserId,
        );
        if (isCurrentSession()) {
          setPendingLegacyProfileCount(recoveryCount);
        }
        // Startup must not invent a desired server state. A fresh device with
        // no local profile may still have a valid vault connection created by
        // another device. `activate()` retries only a durable explicit intent.
      } catch {
        // Best-effort: keep empty.
      } finally {
        if (isCurrentSession()) {
          setIsLoaded(true);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [ownerUserId, ownerSessionRevision, vaultSynchronizer]);

  const serializeMutation = useCallback(
    (operation: () => Promise<void>): Promise<void> => {
      const run = mutationTail.current.then(operation, operation);
      mutationTail.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  useEffect(() => {
    const refresh = () => setVaultSyncStatus(vaultSynchronizer.getSnapshot());
    refresh();
    const unsubscribeSnapshot = vaultSynchronizer.subscribe(refresh);
    const deactivate = vaultSynchronizer.activate();
    return () => {
      unsubscribeSnapshot();
      deactivate();
    };
  }, [vaultSynchronizer]);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const resolveConnectionInputs = useCallback(
    (params: {urlInput: string; secretInput?: string; profileId?: string}) => {
      const normalizedUrl = normalizeNightscoutUrl(params.urlInput);
      if (!normalizedUrl) {
        throw new Error('Please enter a valid Nightscout URL (http/https).');
      }
      const existingProfile = params.profileId
        ? profilesRef.current.find(profile => profile.id === params.profileId)
        : null;
      const secretTrimmed = (params.secretInput ?? '').trim();
      const apiSecretSha1 = secretTrimmed
        ? normalizeNightscoutApiSecretToSha1(secretTrimmed)
        : existingProfile?.apiSecretSha1 ?? null;
      if (!apiSecretSha1) {
        throw new Error('Please enter your Nightscout API secret/token.');
      }
      return {normalizedUrl, apiSecretSha1};
    },
    [],
  );

  const testProfileConnection = useCallback(
    async (params: {
      urlInput: string;
      secretInput?: string;
      profileId?: string;
    }) => {
      if (ownerUserIdRef.current !== ownerUserId) {
        throw new Error('The signed-in account changed before testing.');
      }
      const {normalizedUrl, apiSecretSha1} = resolveConnectionInputs(params);
      return testNightscoutConnection({baseUrl: normalizedUrl, apiSecretSha1});
    },
    [ownerUserId, resolveConnectionInputs],
  );

  const addProfile = useCallback(
    (params: {urlInput: string; secretInput: string}) => {
      const mutationOwnerUserId = ownerUserId;
      return serializeMutation(async () => {
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }
        const {normalizedUrl, apiSecretSha1} = resolveConnectionInputs(params);
        await testNightscoutConnection({baseUrl: normalizedUrl, apiSecretSha1});
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }

        const profile = createNightscoutProfile({
          baseUrl: normalizedUrl,
          apiSecretSha1,
        });

        const nextProfiles = [profile, ...profilesRef.current];
        profilesRef.current = nextProfiles;
        activeProfileIdRef.current = profile.id;
        setProfiles(nextProfiles);
        setActiveProfileIdState(profile.id);

        configureNightscoutInstance({
          baseUrl: profile.baseUrl,
          apiSecretSha1: profile.apiSecretSha1,
          ownerUserId: mutationOwnerUserId,
        });
        configureAndroidWidgetBackgroundSync({
          baseUrl: profile.baseUrl,
          apiSecretSha1: profile.apiSecretSha1,
          enabled: true,
        });
        await persistNightscoutProfiles(
          nextProfiles,
          profile.id,
          mutationOwnerUserId,
        );
        if (ownerUserIdRef.current === mutationOwnerUserId) {
          await vaultSynchronizer.requestReconciliation('provision');
        }
      });
    },
    [
      ownerUserId,
      resolveConnectionInputs,
      serializeMutation,
      vaultSynchronizer,
    ],
  );

  const setActiveProfileId = useCallback(
    (id: string) => {
      const mutationOwnerUserId = ownerUserId;
      return serializeMutation(async () => {
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }
        const currentProfiles = profilesRef.current;
        const nextActive = currentProfiles.find(p => p.id === id);
        if (!nextActive) {
          return;
        }

        activeProfileIdRef.current = id;
        setActiveProfileIdState(id);
        configureNightscoutInstance({
          baseUrl: nextActive.baseUrl,
          apiSecretSha1: nextActive.apiSecretSha1,
          ownerUserId: mutationOwnerUserId,
        });
        configureAndroidWidgetBackgroundSync({
          baseUrl: nextActive.baseUrl,
          apiSecretSha1: nextActive.apiSecretSha1,
          enabled: true,
        });
        await persistNightscoutProfiles(
          currentProfiles,
          id,
          mutationOwnerUserId,
        );
        if (ownerUserIdRef.current === mutationOwnerUserId) {
          await vaultSynchronizer.requestReconciliation('provision');
        }
      });
    },
    [ownerUserId, serializeMutation, vaultSynchronizer],
  );

  const updateProfile = useCallback(
    (params: {profileId: string; urlInput: string; secretInput?: string}) => {
      const mutationOwnerUserId = ownerUserId;
      return serializeMutation(async () => {
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }
        const {normalizedUrl, apiSecretSha1} = resolveConnectionInputs(params);
        const secretTrimmed = (params.secretInput ?? '').trim();
        const nextSecretSha1 = secretTrimmed ? apiSecretSha1 : null;
        await testNightscoutConnection({baseUrl: normalizedUrl, apiSecretSha1});
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }

        const currentProfiles = profilesRef.current;
        const nextProfiles = currentProfiles.map(p => {
          if (p.id !== params.profileId) {
            return p;
          }

          const nextLabelDerived = labelFromNightscoutBaseUrl(normalizedUrl);
          const prevLabelDerived = labelFromNightscoutBaseUrl(p.baseUrl);
          const label =
            p.label === prevLabelDerived ? nextLabelDerived : p.label;

          return {
            ...p,
            baseUrl: normalizedUrl,
            label,
            apiSecretSha1: nextSecretSha1 ?? p.apiSecretSha1,
          };
        });

        profilesRef.current = nextProfiles;
        setProfiles(nextProfiles);

        // If the updated profile is the active one, reconfigure axios.
        const currentActiveProfileId = activeProfileIdRef.current;
        const updatedActive =
          nextProfiles.find(p => p.id === currentActiveProfileId) ?? null;
        if (updatedActive) {
          configureNightscoutInstance({
            baseUrl: updatedActive.baseUrl,
            apiSecretSha1: updatedActive.apiSecretSha1,
            ownerUserId: mutationOwnerUserId,
          });
          configureAndroidWidgetBackgroundSync({
            baseUrl: updatedActive.baseUrl,
            apiSecretSha1: updatedActive.apiSecretSha1,
            enabled: true,
          });
        }

        await persistNightscoutProfiles(
          nextProfiles,
          currentActiveProfileId,
          mutationOwnerUserId,
        );
        if (ownerUserIdRef.current === mutationOwnerUserId) {
          await vaultSynchronizer.requestReconciliation('provision');
        }
      });
    },
    [
      ownerUserId,
      resolveConnectionInputs,
      serializeMutation,
      vaultSynchronizer,
    ],
  );

  const deleteProfile = useCallback(
    (profileId: string) => {
      const mutationOwnerUserId = ownerUserId;
      return serializeMutation(async () => {
        if (ownerUserIdRef.current !== mutationOwnerUserId) {
          throw new Error('The signed-in account changed before saving.');
        }
        const nextProfiles = profilesRef.current.filter(
          p => p.id !== profileId,
        );
        const currentActiveProfileId = activeProfileIdRef.current;
        const nextActiveId =
          currentActiveProfileId && currentActiveProfileId !== profileId
            ? currentActiveProfileId
            : nextProfiles[0]?.id ?? null;

        profilesRef.current = nextProfiles;
        activeProfileIdRef.current = nextActiveId;
        setProfiles(nextProfiles);
        setActiveProfileIdState(nextActiveId);

        if (nextActiveId) {
          const active = nextProfiles.find(p => p.id === nextActiveId) ?? null;
          if (active) {
            configureNightscoutInstance({
              baseUrl: active.baseUrl,
              apiSecretSha1: active.apiSecretSha1,
              ownerUserId: mutationOwnerUserId,
            });
            configureAndroidWidgetBackgroundSync({
              baseUrl: active.baseUrl,
              apiSecretSha1: active.apiSecretSha1,
              enabled: true,
            });
          }
        } else {
          clearNightscoutInstance();
          configureAndroidWidgetBackgroundSync({enabled: false});
        }

        await persistNightscoutProfiles(
          nextProfiles,
          nextActiveId,
          mutationOwnerUserId,
        );
        if (ownerUserIdRef.current === mutationOwnerUserId) {
          await vaultSynchronizer.requestReconciliation(
            nextActiveId ? 'provision' : 'remove',
          );
        }
      });
    },
    [ownerUserId, serializeMutation, vaultSynchronizer],
  );

  const retryVaultSync = useCallback(
    () => vaultSynchronizer.retryPending(),
    [vaultSynchronizer],
  );

  const recoverLegacyProfiles = useCallback(() => {
    const recoveryOwner = ownerUserId;
    const recoverySessionRevision = ownerSessionRevisionRef.current;
    return serializeMutation(async () => {
      if (!recoveryOwner) {
        throw new Error('Sign in before recovering saved connections.');
      }
      const isOwnerCurrent = () =>
        mountedRef.current &&
        ownerUserIdRef.current === recoveryOwner &&
        ownerSessionRevisionRef.current === recoverySessionRevision;
      const recovered = await recoverLegacyNightscoutProfiles({
        ownerUserId: recoveryOwner,
        isOwnerCurrent,
        verifyConnection: async profile => {
          await testNightscoutConnection({
            baseUrl: profile.baseUrl,
            apiSecretSha1: profile.apiSecretSha1,
          });
        },
      });
      if (!isOwnerCurrent()) {
        throw new Error(
          'The signed-in account changed before recovery completed.',
        );
      }
      profilesRef.current = recovered.profiles;
      activeProfileIdRef.current = recovered.activeProfileId;
      setProfiles(recovered.profiles);
      setActiveProfileIdState(recovered.activeProfileId);
      setPendingLegacyProfileCount(0);
      const active = recovered.profiles.find(
        profile => profile.id === recovered.activeProfileId,
      );
      if (active) {
        configureNightscoutInstance({
          baseUrl: active.baseUrl,
          apiSecretSha1: active.apiSecretSha1,
          ownerUserId: recoveryOwner,
        });
        configureAndroidWidgetBackgroundSync({
          baseUrl: active.baseUrl,
          apiSecretSha1: active.apiSecretSha1,
          enabled: true,
        });
        await vaultSynchronizer.requestReconciliation('provision');
      }
    });
  }, [ownerUserId, serializeMutation, vaultSynchronizer]);

  const value = useMemo<NightscoutConfigContextValue>(
    () => ({
      profiles,
      activeProfile,
      isLoaded,
      pendingLegacyProfileCount,
      recoverLegacyProfiles,
      addProfile,
      testProfileConnection,
      setActiveProfileId,
      updateProfile,
      deleteProfile,
      vaultSyncStatus,
      retryVaultSync,
    }),
    [
      profiles,
      activeProfile,
      isLoaded,
      pendingLegacyProfileCount,
      recoverLegacyProfiles,
      addProfile,
      testProfileConnection,
      setActiveProfileId,
      updateProfile,
      deleteProfile,
      vaultSyncStatus,
      retryVaultSync,
    ],
  );

  return (
    <NightscoutConfigContext.Provider value={value}>
      {children}
    </NightscoutConfigContext.Provider>
  );
};
