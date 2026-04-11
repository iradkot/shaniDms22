import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppThemeId, applyThemeToSingleton, getThemeById, theme as singletonTheme} from 'app/style/theme';
import {ThemeType} from 'app/types/theme';

type ThemeSettingsContextValue = {
  themeId: AppThemeId;
  activeTheme: ThemeType;
  isLoaded: boolean;
  setThemeId: (id: AppThemeId) => void;
};

const STORAGE_KEY = 'theme.settings.v1';
const DEFAULT_THEME_ID: AppThemeId = 'calmBlue';

const ThemeSettingsContext = createContext<ThemeSettingsContextValue>({
  themeId: DEFAULT_THEME_ID,
  activeTheme: singletonTheme,
  isLoaded: false,
  setThemeId: () => {},
});

export const useThemeSettings = () => useContext(ThemeSettingsContext);

export const ThemeSettingsProvider = ({children}: {children: React.ReactNode}) => {
  const [themeId, setThemeIdState] = useState<AppThemeId>(DEFAULT_THEME_ID);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) return;
        if (stored === 'calmBlue' || stored === 'darkFocus' || stored === 'highContrastRisk' || stored === 'sunsetGlow') {
          setThemeIdState(stored);
          applyThemeToSingleton(stored);
        } else {
          applyThemeToSingleton(DEFAULT_THEME_ID);
        }
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeId = useCallback((id: AppThemeId) => {
    setThemeIdState(id);
    applyThemeToSingleton(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const activeTheme = useMemo(() => getThemeById(themeId), [themeId]);

  const value = useMemo<ThemeSettingsContextValue>(
    () => ({themeId, activeTheme, isLoaded, setThemeId}),
    [themeId, activeTheme, isLoaded, setThemeId],
  );

  return <ThemeSettingsContext.Provider value={value}>{children}</ThemeSettingsContext.Provider>;
};
