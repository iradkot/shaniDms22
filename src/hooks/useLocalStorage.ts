import AsyncStorage from '@react-native-async-storage/async-storage';
import {useState, useEffect} from 'react';

async function getStorageValue(key: string, defaultValue: any) {
  // getting stored value
  const saved = await AsyncStorage.getItem(key);
  let initial;
  if (typeof saved === 'string') {
    initial = JSON.parse(saved);
  } else {
    initial = saved;
  }
  return initial;
}

export const useLocalStorage = (key: string, defaultValue: any) => {
  const [value, setValue] = useState(() => {
    return getStorageValue(key, JSON.stringify(defaultValue));
  });

  useEffect(() => {
    // storing input name
    AsyncStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

export default useLocalStorage;
