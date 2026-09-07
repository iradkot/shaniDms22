import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {AppState} from 'react-native';

import {nativeNightscoutVaultAuthSession} from 'app/services/backend/nativeNightscoutVaultSync';
import type {NightscoutVaultAuthSession} from 'app/services/backend/nightscoutVaultSynchronizer';
import {nativeSecureCredentialStore} from 'app/services/secureCredentialStore';
import {
  getLlmCredentialStatus,
  provisionLlmCredential,
  removeLlmCredential,
  serverVaultCredentialMarker,
} from 'app/services/llm/shaniLlmProxy';
import {isE2E} from 'app/utils/e2e';
import {getAiConnectionErrorCode} from 'app/product/settings/aiConnectionFeedback';
import {isConfiguredAiCredential} from 'app/services/llm/credentialReadiness';

export type LlmProviderKind = 'openai';
export type AiAgentPersonality = 'tachles' | 'nice' | 'buddha';

export type AiSettings = {
  enabled: boolean;
  provider: LlmProviderKind;
  apiKey: string;
  openAiModel: string;
  personality: AiAgentPersonality;
};

export type AiCredentialSyncStatus =
  | {readonly state: 'idle'; readonly pending: false}
  | {readonly state: 'configured'; readonly pending: false}
  | {readonly state: 'pending' | 'syncing'; readonly pending: true}
  | {
      readonly state: 'error';
      readonly pending: boolean;
      readonly code: string;
      readonly message: string;
    };

export interface AiCredentialRemote {
  readonly status: (expectedUserId?: string) => Promise<boolean>;
  readonly provision: (credential: string, expectedUserId?: string) => Promise<void>;
  readonly remove: (expectedUserId?: string) => Promise<void>;
}

type AiSettingsContextValue = {
  settings: AiSettings;
  isLoaded: boolean;
  credentialSyncStatus: AiCredentialSyncStatus;
  setSetting: <K extends keyof AiSettings>(
    key: K,
    value: AiSettings[K],
  ) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  retryCredentialSync: () => Promise<void>;
};

const LEGACY_STORAGE_KEY = 'ai.settings.v1';
const LEGACY_CREDENTIAL_SERVICE = 'shani.ai.openai';
const LEGACY_QUARANTINE_SERVICE = 'shani.ai.openai.quarantine.v1';
const LEGACY_QUARANTINE_KEY = 'ai.settings.legacyQuarantine.v1';
const LATEST_OPENAI_MODEL = 'gpt-5.5';

const DEFAULT_SETTINGS: AiSettings = {
  enabled: true,
  provider: 'openai',
  apiKey: '',
  openAiModel: LATEST_OPENAI_MODEL,
  personality: 'nice',
};

const defaultCredentialRemote: AiCredentialRemote = {
  status: owner => getLlmCredentialStatus('openai', owner),
  provision: (credential, owner) => provisionLlmCredential('openai', credential, owner),
  remove: owner => removeLlmCredential('openai', owner),
};

const AiSettingsContext = createContext<AiSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  credentialSyncStatus: {state: 'idle', pending: false},
  setSetting: async () => {},
  resetToDefaults: async () => {},
  retryCredentialSync: async () => {},
});

type StoredAiSettings = Omit<AiSettings, 'apiKey'>;
type CredentialIntent = 'provision' | 'remove';

const storedSettings = (settings: AiSettings): StoredAiSettings => ({
  enabled: settings.enabled,
  provider: 'openai',
  openAiModel: LATEST_OPENAI_MODEL,
  personality: settings.personality,
});

const decodeStoredSettings = (
  raw: unknown,
): Partial<StoredAiSettings> & {readonly legacyApiKey?: string} => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const value = raw as Record<string, unknown>;
  const personality = value.personality;
  const legacyApiKey =
    typeof value.apiKey === 'string' && value.apiKey.trim()
      ? value.apiKey.trim()
      : undefined;
  return {
    ...(typeof value.enabled === 'boolean' ? {enabled: value.enabled} : {}),
    provider: 'openai',
    openAiModel: LATEST_OPENAI_MODEL,
    ...(personality === 'tachles' ||
    personality === 'nice' ||
    personality === 'buddha'
      ? {personality}
      : {}),
    ...(legacyApiKey === undefined ? {} : {legacyApiKey}),
  };
};

const accountToken = (ownerUserId: string | null): string =>
  ownerUserId ? `u${sha1(ownerUserId)}` : 'signed-out-local';

const accountStorageKey = (ownerUserId: string | null): string =>
  `ai.settings.v2:${accountToken(ownerUserId)}`;

const accountCredentialService = (ownerUserId: string | null): string =>
  `shani.ai.openai.v2.${accountToken(ownerUserId)}`;

const accountIntentKey = (ownerUserId: string): string =>
  `ai.credential.intent.v1:${accountToken(ownerUserId)}`;

const normalizeOwner = (ownerUserId: string | null): string | null =>
  ownerUserId?.trim() || null;

const decodeCredentialIntent = (raw: string | null): CredentialIntent | null =>
  raw === 'provision' || raw === 'remove' ? raw : null;

const connectionError = (error: unknown, pending: boolean): AiCredentialSyncStatus => ({
  state: 'error',
  pending,
  code: getAiConnectionErrorCode(error),
  message: 'The AI connection could not be completed.',
});

const accountChangedError = (): Error => Object.assign(
  new Error('The signed-in account changed before saving.'),
  {code: 'account_changed'},
);

const canRetryAutomatically = (status: AiCredentialSyncStatus): boolean =>
  status.state === 'pending' ||
  (status.state === 'error' &&
    ['network', 'timeout', 'upstream', 'rate_limited', 'upstream_timeout', 'upstream_unavailable'].includes(status.code));

let legacyMigrationTail: Promise<void> = Promise.resolve();

/**
 * Old builds used one process-wide credential. It is safe to retain it only
 * in the signed-out namespace. When an authenticated account is already
 * active, ownership cannot be proven, so the value is quarantined instead of
 * being uploaded to that account.
 */
const migrateOrQuarantineLegacySettings = async (
  ownerUserId: string | null,
): Promise<void> => {
  const [legacyRaw, legacySecureCredential] = await Promise.all([
    AsyncStorage.getItem(LEGACY_STORAGE_KEY),
    nativeSecureCredentialStore.read(LEGACY_CREDENTIAL_SERVICE),
  ]);
  if (legacyRaw === null && !legacySecureCredential) {
    return;
  }

  let decoded = decodeStoredSettings(undefined);
  if (legacyRaw !== null) {
    try {
      decoded = decodeStoredSettings(JSON.parse(legacyRaw));
    } catch {
      decoded = decodeStoredSettings(undefined);
    }
  }
  const {legacyApiKey, ...preferences} = decoded;
  const credential = legacyApiKey ?? legacySecureCredential;

  if (ownerUserId === null) {
    await AsyncStorage.setItem(
      accountStorageKey(null),
      JSON.stringify(storedSettings({...DEFAULT_SETTINGS, ...preferences})),
    );
    if (credential) {
      await nativeSecureCredentialStore.write(
        accountCredentialService(null),
        credential,
      );
    }
  } else {
    if (credential) {
      await nativeSecureCredentialStore.write(
        LEGACY_QUARANTINE_SERVICE,
        credential,
      );
    }
    await AsyncStorage.setItem(
      LEGACY_QUARANTINE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        reason: 'unattributed',
        quarantinedAt: Date.now(),
      }),
    );
  }

  await Promise.all([
    AsyncStorage.removeItem(LEGACY_STORAGE_KEY),
    nativeSecureCredentialStore.remove(LEGACY_CREDENTIAL_SERVICE),
  ]);
};

const prepareLegacySettings = (ownerUserId: string | null): Promise<void> => {
  const result = legacyMigrationTail.then(
    () => migrateOrQuarantineLegacySettings(ownerUserId),
    () => migrateOrQuarantineLegacySettings(ownerUserId),
  );
  legacyMigrationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

export const useAiSettings = () => useContext(AiSettingsContext);

export const AiSettingsProvider = ({
  children,
  authSession = nativeNightscoutVaultAuthSession,
  credentialRemote = defaultCredentialRemote,
}: {
  children: React.ReactNode;
  authSession?: NightscoutVaultAuthSession;
  credentialRemote?: AiCredentialRemote;
}) => {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [credentialSyncStatus, setCredentialSyncStatus] =
    useState<AiCredentialSyncStatus>({state: 'idle', pending: false});
  const [ownerUserId, setOwnerUserId] = useState<string | null>(() =>
    normalizeOwner(authSession.getCurrentUserId()),
  );
  const settingsRef = useRef(settings);
  const ownerUserIdRef = useRef(ownerUserId);
  const mutationTail = useRef<Promise<void>>(Promise.resolve());
  const syncStatusRef = useRef(credentialSyncStatus);
  syncStatusRef.current = credentialSyncStatus;

  // Initialization, writes and retries share one queue. A slow status read
  // cannot overwrite a completed save or remove another queued credential.
  const enqueue = useCallback((operation: () => Promise<void>): Promise<void> => {
    const result = mutationTail.current.then(operation);
    mutationTail.current = result.catch(() => undefined);
    return result;
  }, []);

  const setCurrentSettings = useCallback((next: AiSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const persist = useCallback(
    async (next: AiSettings, owner: string | null) => {
      await AsyncStorage.setItem(
        accountStorageKey(owner),
        JSON.stringify(storedSettings(next)),
      );
    },
    [],
  );

  const reconcileCredential = useCallback(
    async (expectedOwner: string): Promise<void> => {
      if (ownerUserIdRef.current !== expectedOwner ||
          normalizeOwner(authSession.getCurrentUserId()) !== expectedOwner) {
        throw accountChangedError();
      }
      const intent = decodeCredentialIntent(
        await AsyncStorage.getItem(accountIntentKey(expectedOwner)),
      );
      if (intent === null) {
        if (ownerUserIdRef.current !== expectedOwner) {
          throw accountChangedError();
        }
        try {
          const configured = await credentialRemote.status(expectedOwner);
          if (ownerUserIdRef.current !== expectedOwner) {
            throw accountChangedError();
          }
          // A process interruption after clearing a confirmed intent can
          // leave its secure staging copy behind. It is no longer pending.
          await nativeSecureCredentialStore.remove(accountCredentialService(expectedOwner));
          if (ownerUserIdRef.current !== expectedOwner) {
            throw accountChangedError();
          }
          const next = {
            ...settingsRef.current,
            apiKey: configured ? serverVaultCredentialMarker : '',
          };
          setCurrentSettings(next);
          setCredentialSyncStatus(
            configured
              ? {state: 'configured', pending: false}
              : {state: 'idle', pending: false},
          );
        } catch (error) {
          if (ownerUserIdRef.current === expectedOwner) {
            setCredentialSyncStatus(connectionError(error, false));
          }
          throw error;
        }
        return;
      }

      if (ownerUserIdRef.current === expectedOwner) {
        setCredentialSyncStatus({state: 'syncing', pending: true});
      }
      let provisionedMarker = serverVaultCredentialMarker;
      let pendingIntent = true;
      try {
        if (intent === 'provision') {
          const credential = await nativeSecureCredentialStore.read(
            accountCredentialService(expectedOwner),
          );
          if (!credential) {
            throw new Error('Pending AI credential is unavailable.');
          }
          provisionedMarker =
            isE2E && credential.startsWith('e2e-openai-')
              ? credential
              : serverVaultCredentialMarker;
          if (authSession.getCurrentUserId()?.trim() !== expectedOwner) {
            throw accountChangedError();
          }
          await credentialRemote.provision(credential, expectedOwner);
        } else {
          if (authSession.getCurrentUserId()?.trim() !== expectedOwner) {
            throw accountChangedError();
          }
          await credentialRemote.remove(expectedOwner);
        }
        // Clear the acknowledged intent before deleting its secure staging
        // copy, so a crash cannot leave an unsendable pending upload.
        await AsyncStorage.removeItem(accountIntentKey(expectedOwner));
        pendingIntent = false;
        if (intent === 'provision') {
          await nativeSecureCredentialStore.remove(accountCredentialService(expectedOwner));
        }
        if (ownerUserIdRef.current !== expectedOwner) {
          throw accountChangedError();
        }
        const next = {
          ...settingsRef.current,
          apiKey: intent === 'provision' ? provisionedMarker : '',
        };
        await persist(next, expectedOwner);
        if (ownerUserIdRef.current !== expectedOwner) {
          throw accountChangedError();
        }
        setCurrentSettings(next);
        setCredentialSyncStatus(
          intent === 'provision'
            ? {state: 'configured', pending: false}
            : {state: 'idle', pending: false},
        );
      } catch (error) {
        if (ownerUserIdRef.current === expectedOwner) {
          setCredentialSyncStatus(connectionError(error, pendingIntent));
        }
        throw error;
      }
    }, [authSession, credentialRemote, persist, setCurrentSettings]);

  useEffect(
    () =>
      authSession.subscribe(userId => {
        const nextOwner = normalizeOwner(userId);
        if (nextOwner === ownerUserIdRef.current) {
          return;
        }
        ownerUserIdRef.current = nextOwner;
        settingsRef.current = DEFAULT_SETTINGS;
        setSettings(DEFAULT_SETTINGS);
        setCredentialSyncStatus({state: 'idle', pending: false});
        setIsLoaded(false);
        setOwnerUserId(nextOwner);
      }),
    [authSession],
  );

  useEffect(() => {
    ownerUserIdRef.current = ownerUserId;
    let mounted = true;
    const load = async () => {
      try {
        if (!mounted || ownerUserIdRef.current !== ownerUserId) {
          return;
        }
        await prepareLegacySettings(ownerUserId);
        const raw = await AsyncStorage.getItem(accountStorageKey(ownerUserId));
        const parsed = raw
          ? decodeStoredSettings(JSON.parse(raw))
          : decodeStoredSettings(undefined);
        const preferences = {...parsed};
        delete preferences.legacyApiKey;
        let next: AiSettings = {
          ...DEFAULT_SETTINGS,
          ...preferences,
          apiKey: '',
          openAiModel: LATEST_OPENAI_MODEL,
        };

        if (ownerUserId === null) {
          const localCredential =
            (await nativeSecureCredentialStore.read(
              accountCredentialService(null),
            )) ?? '';
          next = {...next, apiKey: localCredential};
          if (mounted && ownerUserIdRef.current === null) {
            setCurrentSettings(next);
            setCredentialSyncStatus(
              localCredential
                ? {state: 'configured', pending: false}
                : {state: 'idle', pending: false},
            );
          }
          return;
        }

        const intent = decodeCredentialIntent(
          await AsyncStorage.getItem(accountIntentKey(ownerUserId)),
        );
        if (mounted && ownerUserIdRef.current === ownerUserId) {
          setCurrentSettings(next);
          if (intent !== null) {
            setCredentialSyncStatus({state: 'pending', pending: true});
          }
          // Preferences are usable while the independent remote connection
          // check continues. AI stays unavailable until that check confirms it.
          setIsLoaded(true);
        }
        if (intent === 'provision') {
          try {
            const configured = await credentialRemote.status(ownerUserId);
            if (configured && mounted && ownerUserIdRef.current === ownerUserId) {
              setCurrentSettings({...settingsRef.current, apiKey: serverVaultCredentialMarker});
            }
          } catch {
            // Status lookup must not discard or prevent retrying a staged key.
          }
        }
        await reconcileCredential(ownerUserId);
      } catch (error) {
        if (mounted && ownerUserIdRef.current === ownerUserId) {
          setCredentialSyncStatus(current =>
            current.state === 'error' ? current : connectionError(error, false),
          );
        }
      } finally {
        if (mounted && ownerUserIdRef.current === ownerUserId) {
          setIsLoaded(true);
        }
      }
    };
    enqueue(load).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [credentialRemote, enqueue, ownerUserId, reconcileCredential, setCurrentSettings]);

  const setSetting = useCallback(
    <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
      const mutationOwner = ownerUserId;
      return enqueue(async () => {
        if (ownerUserIdRef.current !== mutationOwner) {
          throw accountChangedError();
        }
        const prev = settingsRef.current;
        const next = {
          ...prev,
          [key]: value,
          openAiModel:
            key === 'openAiModel' ? LATEST_OPENAI_MODEL : prev.openAiModel,
        } as AiSettings;

        if (key !== 'apiKey') {
          await persist(next, mutationOwner);
          if (ownerUserIdRef.current === mutationOwner) {
            setCurrentSettings(next);
          }
          return;
        }

        const credential = String(value).trim();
        if (mutationOwner === null) {
          if (credential) {
            await nativeSecureCredentialStore.write(
              accountCredentialService(null),
              credential,
            );
          } else {
            await nativeSecureCredentialStore.remove(
              accountCredentialService(null),
            );
          }
          next.apiKey = credential;
          await persist(next, null);
          if (ownerUserIdRef.current === null) {
            setCurrentSettings(next);
            setCredentialSyncStatus(
              credential
                ? {state: 'configured', pending: false}
                : {state: 'idle', pending: false},
            );
          }
          return;
        }

        if (credential) {
          await nativeSecureCredentialStore.write(
            accountCredentialService(mutationOwner),
            credential,
          );
          await AsyncStorage.setItem(
            accountIntentKey(mutationOwner),
            'provision',
          );
          // First-time setup stays unavailable until confirmed. An existing
          // server key remains usable while its replacement is being checked.
          next.apiKey = isConfiguredAiCredential(prev.apiKey) ? prev.apiKey : '';
        } else {
          await nativeSecureCredentialStore.remove(
            accountCredentialService(mutationOwner),
          );
          await AsyncStorage.setItem(accountIntentKey(mutationOwner), 'remove');
          next.apiKey = '';
        }
        await persist(next, mutationOwner);
        if (ownerUserIdRef.current === mutationOwner) {
          setCurrentSettings(next);
          setCredentialSyncStatus({state: 'pending', pending: true});
        }
        await reconcileCredential(mutationOwner);
      });
    }, [enqueue, ownerUserId, persist, reconcileCredential, setCurrentSettings],
  );

  const retryCredentialSync = useCallback(() => {
    const owner = ownerUserIdRef.current;
    if (owner === null) {
      return Promise.resolve();
    }
    return enqueue(() => reconcileCredential(owner));
  }, [enqueue, reconcileCredential]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      const becameActive = state === 'active' && previousState !== 'active';
      previousState = state;
      if (becameActive && canRetryAutomatically(syncStatusRef.current)) {
        retryCredentialSync().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [retryCredentialSync]);

  const resetToDefaults = useCallback(() => {
    const mutationOwner = ownerUserId;
    return enqueue(async () => {
      if (ownerUserIdRef.current !== mutationOwner) {
        throw accountChangedError();
      }
      await persist(DEFAULT_SETTINGS, mutationOwner);
      if (mutationOwner === null) {
        await nativeSecureCredentialStore.remove(accountCredentialService(null));
        if (ownerUserIdRef.current !== mutationOwner) {
          return;
        }
        setCurrentSettings(DEFAULT_SETTINGS);
        setCredentialSyncStatus({state: 'idle', pending: false});
        return;
      }
      await nativeSecureCredentialStore.remove(
        accountCredentialService(mutationOwner),
      );
      await AsyncStorage.setItem(accountIntentKey(mutationOwner), 'remove');
      if (ownerUserIdRef.current !== mutationOwner) {
        return;
      }
      setCurrentSettings(DEFAULT_SETTINGS);
      setCredentialSyncStatus({state: 'pending', pending: true});
      await reconcileCredential(mutationOwner);
    });
  }, [enqueue, ownerUserId, persist, reconcileCredential, setCurrentSettings]);

  const value = useMemo<AiSettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      credentialSyncStatus,
      setSetting,
      resetToDefaults,
      retryCredentialSync,
    }),
    [
      settings,
      isLoaded,
      credentialSyncStatus,
      setSetting,
      resetToDefaults,
      retryCredentialSync,
    ],
  );

  return (
    <AiSettingsContext.Provider value={value}>
      {children}
    </AiSettingsContext.Provider>
  );
};

export default AiSettingsContext;
