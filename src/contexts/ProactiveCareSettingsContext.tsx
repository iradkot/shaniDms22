import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProactiveCareSettings = {
  hypoNowEnabled: boolean;
  language: 'he' | 'en';
  preferredFastCarb: string;
  avoidChocolateForImmediateHypo: boolean;
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

const DEFAULT_SETTINGS: ProactiveCareSettings = {
  hypoNowEnabled: true,
  language: 'he',
  preferredFastCarb: 'מיץ תפוזים קטן',
  avoidChocolateForImmediateHypo: true,
};

const ProactiveCareSettingsContext = createContext<ProactiveCareSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
  resetToDefaults: () => {},
});

export const useProactiveCareSettings = () => useContext(ProactiveCareSettingsContext);

export const ProactiveCareSettingsProvider = ({children}: {children: React.ReactNode}) => {
  const [settings, setSettings] = useState<ProactiveCareSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) return;

        if (!stored) {
          setIsLoaded(true);
          return;
        }

        const parsed = JSON.parse(stored) as Partial<ProactiveCareSettings>;
        setSettings(prev => ({...prev, ...parsed}));
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: ProactiveCareSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best effort
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof ProactiveCareSettings>(key: K, value: ProactiveCareSettings[K]) => {
      setSettings(prev => {
        const next = {
          ...prev,
          [key]: value,
        } as ProactiveCareSettings;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

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
