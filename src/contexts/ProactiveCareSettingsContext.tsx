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
import type {PreMealAssistanceSettings} from 'app/modules/preMealAssistance';
import {nativeNightscoutVaultAuthSession} from 'app/services/backend/nativeNightscoutVaultSync';
import type {NightscoutVaultAuthSession} from 'app/services/backend/nightscoutVaultSynchronizer';

export type ProactiveCareSettings = {
  enabled: boolean;
  events: {
    hypoNow: boolean;
    hypoRiskSoon: boolean;
    postHypoFollowUp: boolean;
  };
  dailyBrief: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  preMealAssistance: PreMealAssistanceSettings;
};

type ProactiveCareSettingsContextValue = {
  settings: ProactiveCareSettings;
  isLoaded: boolean;
  setSetting: <K extends keyof ProactiveCareSettings>(
    key: K,
    value: ProactiveCareSettings[K],
  ) => void;
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'proactive.care.settings.v1';

const scopedStorageKey = (userId: string | null): string =>
  `${STORAGE_KEY}:${encodeURIComponent(userId?.trim() || 'signed-out')}`;

export const DEFAULT_PROACTIVE_CARE_SETTINGS: ProactiveCareSettings = {
  enabled: true,
  events: {
    hypoNow: true,
    hypoRiskSoon: false,
    postHypoFollowUp: true,
  },
  dailyBrief: {
    enabled: true,
    hour: 8,
    minute: 0,
  },
  preMealAssistance: {
    enabled: false,
    notificationsEnabled: false,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const integerInRangeOr = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum
    ? value
    : fallback;

/** Strictly decodes stored settings while preserving safe defaults for new fields. */
export const normalizeProactiveCareSettings = (
  raw: unknown,
): ProactiveCareSettings => {
  const value = isRecord(raw) ? raw : {};
  const events = isRecord(value.events) ? value.events : {};
  const dailyBrief = isRecord(value.dailyBrief) ? value.dailyBrief : {};
  const preMealAssistance = isRecord(value.preMealAssistance)
    ? value.preMealAssistance
    : {};
  const legacyHypoNow =
    typeof value.hypoNowEnabled === 'boolean'
      ? value.hypoNowEnabled
      : undefined;

  return {
    enabled: booleanOr(
      value.enabled,
      legacyHypoNow ?? DEFAULT_PROACTIVE_CARE_SETTINGS.enabled,
    ),
    events: {
      hypoNow: booleanOr(
        events.hypoNow,
        legacyHypoNow ?? DEFAULT_PROACTIVE_CARE_SETTINGS.events.hypoNow,
      ),
      hypoRiskSoon: booleanOr(
        events.hypoRiskSoon,
        DEFAULT_PROACTIVE_CARE_SETTINGS.events.hypoRiskSoon,
      ),
      postHypoFollowUp: booleanOr(
        events.postHypoFollowUp,
        DEFAULT_PROACTIVE_CARE_SETTINGS.events.postHypoFollowUp,
      ),
    },
    dailyBrief: {
      enabled: booleanOr(
        dailyBrief.enabled,
        DEFAULT_PROACTIVE_CARE_SETTINGS.dailyBrief.enabled,
      ),
      hour: integerInRangeOr(
        dailyBrief.hour,
        0,
        23,
        DEFAULT_PROACTIVE_CARE_SETTINGS.dailyBrief.hour,
      ),
      minute: integerInRangeOr(
        dailyBrief.minute,
        0,
        59,
        DEFAULT_PROACTIVE_CARE_SETTINGS.dailyBrief.minute,
      ),
    },
    preMealAssistance: {
      enabled: booleanOr(
        preMealAssistance.enabled,
        DEFAULT_PROACTIVE_CARE_SETTINGS.preMealAssistance.enabled,
      ),
      notificationsEnabled: booleanOr(
        preMealAssistance.notificationsEnabled,
        DEFAULT_PROACTIVE_CARE_SETTINGS.preMealAssistance.notificationsEnabled,
      ),
    },
  };
};

const ProactiveCareSettingsContext = createContext<ProactiveCareSettingsContextValue>({
  settings: DEFAULT_PROACTIVE_CARE_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
  resetToDefaults: () => {},
});

export const useProactiveCareSettings = () => useContext(ProactiveCareSettingsContext);

export const ProactiveCareSettingsProvider = ({
  children,
  authSession = nativeNightscoutVaultAuthSession,
}: {
  children: React.ReactNode;
  authSession?: NightscoutVaultAuthSession;
}) => {
  const [settings, setSettings] = useState<ProactiveCareSettings>(
    DEFAULT_PROACTIVE_CARE_SETTINGS,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(() =>
    authSession.getCurrentUserId()?.trim() || null,
  );
  const ownerUserIdRef = useRef(ownerUserId);

  useEffect(
    () =>
      authSession.subscribe(userId => {
        const nextOwner = userId?.trim() || null;
        if (nextOwner === ownerUserIdRef.current) {
          return;
        }
        ownerUserIdRef.current = nextOwner;
        setSettings(DEFAULT_PROACTIVE_CARE_SETTINGS);
        setIsLoaded(false);
        setOwnerUserId(nextOwner);
      }),
    [authSession],
  );

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const scopedKey = scopedStorageKey(ownerUserId);
        let stored = await AsyncStorage.getItem(scopedKey);
        if (stored === null && ownerUserId === null) {
          stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored !== null) {
            await AsyncStorage.setItem(scopedKey, stored);
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
        if (!isMounted || ownerUserIdRef.current !== ownerUserId) {
          return;
        }

        if (!stored) {
          setIsLoaded(true);
          return;
        }

        setSettings(normalizeProactiveCareSettings(JSON.parse(stored)));
      } catch {
        if (isMounted && ownerUserIdRef.current === ownerUserId) {
          setSettings(DEFAULT_PROACTIVE_CARE_SETTINGS);
        }
      } finally {
        if (isMounted && ownerUserIdRef.current === ownerUserId) {
          setIsLoaded(true);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [ownerUserId]);

  const persist = useCallback(async (
    next: ProactiveCareSettings,
    expectedOwnerUserId: string | null,
  ) => {
    try {
      await AsyncStorage.setItem(
        scopedStorageKey(expectedOwnerUserId),
        JSON.stringify(next),
      );
    } catch {
      // best effort
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof ProactiveCareSettings>(key: K, value: ProactiveCareSettings[K]) => {
      const mutationOwner = ownerUserId;
      if (ownerUserIdRef.current !== mutationOwner) {
        return;
      }
      setSettings(prev => {
        const next = {
          ...prev,
          [key]: value,
        } as ProactiveCareSettings;
        persist(next, mutationOwner);
        return next;
      });
    },
    [ownerUserId, persist],
  );

  const resetToDefaults = useCallback(() => {
    const mutationOwner = ownerUserId;
    if (ownerUserIdRef.current !== mutationOwner) {
      return;
    }
    setSettings(DEFAULT_PROACTIVE_CARE_SETTINGS);
    persist(DEFAULT_PROACTIVE_CARE_SETTINGS, mutationOwner);
  }, [ownerUserId, persist]);

  const value = useMemo(
    () => ({
      settings,
      isLoaded,
      setSetting,
      resetToDefaults,
    }),
    [settings, isLoaded, setSetting, resetToDefaults],
  );

  return (
    <ProactiveCareSettingsContext.Provider value={value}>
      {children}
    </ProactiveCareSettingsContext.Provider>
  );
};
