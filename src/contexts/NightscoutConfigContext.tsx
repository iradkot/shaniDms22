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
  labelFromNightscoutBaseUrl,
  loadNightscoutProfiles,
  normalizeNightscoutApiSecretToSha1,
  normalizeNightscoutUrl,
  persistNightscoutProfiles,
  NightscoutProfile,
} from 'app/services/nightscoutProfiles';
import {clearNightscoutInstance, configureNightscoutInstance} from 'app/api/shaniNightscoutInstances';

export type NightscoutConfigContextValue = {
  profiles: NightscoutProfile[];
  activeProfile: NightscoutProfile | null;
  isLoaded: boolean;
  /** Adds a profile and selects it as active. Accepts loosely formatted URL/secret inputs. */
  addProfile: (params: {urlInput: string; secretInput: string}) => Promise<void>;
  /** Switches the currently active profile by ID. */
  setActiveProfileId: (id: string) => Promise<void>;
  /** Updates an existing profile. If secretInput is empty, keeps the existing secret. */
  updateProfile: (params: {profileId: string; urlInput: string; secretInput?: string}) => Promise<void>;
  /** Deletes a profile by ID and re-selects an active profile if needed. */
  deleteProfile: (profileId: string) => Promise<void>;
};

const NightscoutConfigContext = createContext<NightscoutConfigContextValue>({
  profiles: [],
  activeProfile: null,
  isLoaded: false,
  addProfile: async () => {},
  setActiveProfileId: async () => {},
  updateProfile: async () => {},
  deleteProfile: async () => {},
});

export const useNightscoutConfig = () => useContext(NightscoutConfigContext);

/**
 * Loads Nightscout profiles from local storage and keeps the axios client
 * configured to the currently active profile.
 */
export const NightscoutConfigProvider = ({children}: {children: React.ReactNode}) => {
  const [profiles, setProfiles] = useState<NightscoutProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const profilesRef = useRef<NightscoutProfile[]>([]);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const {profiles: storedProfiles, activeProfileId: storedActiveId} =
          await loadNightscoutProfiles();

        if (!isMounted) return;

        const resolvedActiveId =
          storedActiveId && storedProfiles.some(p => p.id === storedActiveId)
            ? storedActiveId
            : storedProfiles[0]?.id ?? null;

        setProfiles(storedProfiles);
        setActiveProfileIdState(resolvedActiveId);

        if (resolvedActiveId) {
          const active = storedProfiles.find(p => p.id === resolvedActiveId) ?? null;
          if (active) {
            configureNightscoutInstance({baseUrl: active.baseUrl, apiSecretSha1: active.apiSecretSha1});
          }
        }

        // Persist repaired active ID if needed.
        if (storedProfiles.length > 0 && resolvedActiveId !== storedActiveId) {
          await persistNightscoutProfiles(storedProfiles, resolvedActiveId);
        }
      } catch {
        // Best-effort: keep empty.
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const addProfile = useCallback(
    async (params: {urlInput: string; secretInput: string}) => {
      const normalizedUrl = normalizeNightscoutUrl(params.urlInput);
      if (!normalizedUrl) {
        throw new Error('Please enter a valid Nightscout URL (http/https).');
      }

      const apiSecretSha1 = normalizeNightscoutApiSecretToSha1(params.secretInput);
      if (!apiSecretSha1) {
        throw new Error('Please enter your Nightscout API secret/token.');
      }

      const profile = createNightscoutProfile({
        baseUrl: normalizedUrl,
        apiSecretSha1,
      });

      const nextProfiles = [profile, ...profilesRef.current];
      setProfiles(nextProfiles);
      setActiveProfileIdState(profile.id);

      configureNightscoutInstance({baseUrl: profile.baseUrl, apiSecretSha1: profile.apiSecretSha1});
      await persistNightscoutProfiles(nextProfiles, profile.id);
    },
    [],
  );

  const setActiveProfileId = useCallback(
    async (id: string) => {
      const nextActive = profiles.find(p => p.id === id);
      if (!nextActive) return;

      setActiveProfileIdState(id);
      configureNightscoutInstance({baseUrl: nextActive.baseUrl, apiSecretSha1: nextActive.apiSecretSha1});
      await persistNightscoutProfiles(profiles, id);
    },
    [profiles],
  );

  const updateProfile = useCallback(
    async (params: {profileId: string; urlInput: string; secretInput?: string}) => {
      const normalizedUrl = normalizeNightscoutUrl(params.urlInput);
      if (!normalizedUrl) {
        throw new Error('Please enter a valid Nightscout URL (http/https).');
      }

      const secretTrimmed = (params.secretInput ?? '').trim();
      const nextSecretSha1 = secretTrimmed
        ? normalizeNightscoutApiSecretToSha1(secretTrimmed)
        : null;
      if (secretTrimmed && !nextSecretSha1) {
        throw new Error('Please enter a valid Nightscout API secret/token.');
      }

      const currentProfiles = profilesRef.current;
      const nextProfiles = currentProfiles.map(p => {
        if (p.id !== params.profileId) return p;

        const nextLabelDerived = labelFromNightscoutBaseUrl(normalizedUrl);
        const prevLabelDerived = labelFromNightscoutBaseUrl(p.baseUrl);
        const label = p.label === prevLabelDerived ? nextLabelDerived : p.label;

        return {
          ...p,
          baseUrl: normalizedUrl,
          label,
          apiSecretSha1: nextSecretSha1 ?? p.apiSecretSha1,
        };
      });

      setProfiles(nextProfiles);

      // If the updated profile is the active one, reconfigure axios.
      const updatedActive = nextProfiles.find(p => p.id === activeProfileId) ?? null;
      if (updatedActive) {
        configureNightscoutInstance({
          baseUrl: updatedActive.baseUrl,
          apiSecretSha1: updatedActive.apiSecretSha1,
        });
      }

      await persistNightscoutProfiles(nextProfiles, activeProfileId);
    },
    [activeProfileId],
  );

  const deleteProfile = useCallback(
    async (profileId: string) => {
      const nextProfiles = profilesRef.current.filter(p => p.id !== profileId);
      const nextActiveId =
        activeProfileId && activeProfileId !== profileId
          ? activeProfileId
          : nextProfiles[0]?.id ?? null;

      setProfiles(nextProfiles);
      setActiveProfileIdState(nextActiveId);

      if (nextActiveId) {
        const active = nextProfiles.find(p => p.id === nextActiveId) ?? null;
        if (active) {
          configureNightscoutInstance({baseUrl: active.baseUrl, apiSecretSha1: active.apiSecretSha1});
        }
      } else {
        clearNightscoutInstance();
      }

      await persistNightscoutProfiles(nextProfiles, nextActiveId);
    },
    [activeProfileId],
  );

  const value = useMemo<NightscoutConfigContextValue>(
    () => ({
      profiles,
      activeProfile,
      isLoaded,
      addProfile,
      setActiveProfileId,
      updateProfile,
      deleteProfile,
    }),
    [profiles, activeProfile, isLoaded, addProfile, setActiveProfileId, updateProfile, deleteProfile],
  );

  return (
    <NightscoutConfigContext.Provider value={value}>
      {children}
    </NightscoutConfigContext.Provider>
  );
};
