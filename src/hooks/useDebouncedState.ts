import React from 'react';
import {useEffect, useRef} from 'react';
import {useCallback} from 'react';
import {useState} from 'react';

export const useDebouncedState = <T>(
  initialValue: T,
  delay: number,
): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [value, setValue] = useState(initialValue);
  const timeout = useRef<NodeJS.Timeout>();

  const debouncedSetState = useCallback(
    (newValue: React.SetStateAction<T>) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
      timeout.current = setTimeout(() => {
        setValue(newValue);
      }, delay);
    },
    [delay],
  );

  useEffect(() => {
    return () => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
    };
  }, []);

  return [value, debouncedSetState];
};

// example usage
