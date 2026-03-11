import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLanguage = 'en' | 'he';
const STORAGE_KEY = 'app.language.v1';

function detectDeviceLanguage(): AppLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    return locale.toLowerCase().startsWith('he') ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

export async function getStoredAppLanguage(): Promise<AppLanguage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'he' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return detectDeviceLanguage();
}

type Ctx = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  isLoaded: boolean;
};

const AppLanguageContext = createContext<Ctx>({
  language: 'en',
  setLanguage: async () => {},
  isLoaded: false,
});

export const AppLanguageProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    getStoredAppLanguage().then(lang => {
      if (!mounted) return;
      setLanguageState(lang);
      setIsLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = async (lang: AppLanguage) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  };

  const value = useMemo(() => ({language, setLanguage, isLoaded}), [language, isLoaded]);
  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
};

export const useAppLanguage = () => useContext(AppLanguageContext);
