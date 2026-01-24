import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TabsSettings = {
  showFoodTracking: boolean;
  showSportTracking: boolean;
  showNotifications: boolean;
  showAiAnalyst: boolean;
};

type TabsSettingsContextValue = {
  settings: TabsSettings;
  isLoaded: boolean;
  setSetting: <K extends keyof TabsSettings>(key: K, value: TabsSettings[K]) => void;
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'tabs.settings.v1';

const DEFAULT_SETTINGS: TabsSettings = {
  showFoodTracking: false,
  showSportTracking: false,
  showNotifications: false,
  showAiAnalyst: true,
};

const TabsSettingsContext = createContext<TabsSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
  resetToDefaults: () => {},
});

export const useTabsSettings = () => useContext(TabsSettingsContext);

export const TabsSettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [settings, setSettings] = useState<TabsSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) {
          return;
        }

        if (!stored) {
          setIsLoaded(true);
          return;
        }

        const parsed = JSON.parse(stored) as Partial<TabsSettings>;

        setSettings(prev => ({
          ...prev,
          ...parsed,
        }));
      } catch (e) {
        // If parsing/storage fails, keep defaults.
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: TabsSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // Best-effort persistence.
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof TabsSettings>(key: K, value: TabsSettings[K]) => {
      setSettings(prev => {
        const next = {
          ...prev,
          [key]: value,
        };
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

  const value = useMemo<TabsSettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setSetting,
      resetToDefaults,
    }),
    [settings, isLoaded, setSetting, resetToDefaults],
  );

  return (
    <TabsSettingsContext.Provider value={value}>
      {children}
    </TabsSettingsContext.Provider>
  );
};

export default TabsSettingsContext;
