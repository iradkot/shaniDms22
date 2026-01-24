import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LlmProviderKind = 'openai';

export type AiSettings = {
  enabled: boolean;
  provider: LlmProviderKind;
  apiKey: string;
  openAiModel: string;
};

type AiSettingsContextValue = {
  settings: AiSettings;
  isLoaded: boolean;
  setSetting: <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => void;
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'ai.settings.v1';

const DEFAULT_SETTINGS: AiSettings = {
  enabled: true,
  provider: 'openai',
  apiKey: '',
  openAiModel: 'gpt-4o-mini',
};

const AiSettingsContext = createContext<AiSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
  resetToDefaults: () => {},
});

export const useAiSettings = () => useContext(AiSettingsContext);

export const AiSettingsProvider = ({children}: {children: React.ReactNode}) => {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
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

        const parsed = JSON.parse(stored) as Partial<AiSettings>;
        setSettings(prev => ({...prev, ...parsed}));
      } catch (e) {
        // Best-effort: keep defaults.
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: AiSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
      setSettings(prev => {
        const next = {
          ...prev,
          [key]: value,
        } as AiSettings;
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

  const value = useMemo<AiSettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setSetting,
      resetToDefaults,
    }),
    [settings, isLoaded, setSetting, resetToDefaults],
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
};

export default AiSettingsContext;
