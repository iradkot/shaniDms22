import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useRef, useState} from 'react';

async function getStorageValue<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const saved = await AsyncStorage.getItem(key);
    return saved === null ? defaultValue : (JSON.parse(saved) as T);
  } catch {
    return defaultValue;
  }
}

export const useLocalStorage = <T>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    let active = true;

    setHydratedKey(null);
    getStorageValue(key, defaultValueRef.current)
      .then(storedValue => {
        if (!active) {
          return;
        }
        setValue(storedValue);
        setHydratedKey(key);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (hydratedKey !== key) {
      return;
    }
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
  }, [hydratedKey, key, value]);

  return [value, setValue] as const;
};

export default useLocalStorage;
