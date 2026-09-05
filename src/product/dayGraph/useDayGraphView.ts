import {useEffect, useRef, useState} from 'react';
import {DEFAULT_DAY_GRAPH_PREFERENCES} from '../personalization/types';
import type {StoredDayGraphPreferences} from '../personalization/types';
import type {DayGraphChartPreferencesRuntime} from './runtime';

type SaveStatus = 'idle' | 'saving' | 'error';

/** Keeps exploratory zoom separate from the explicit, locally saved default. */
export const useDayGraphView = (
  dayStartMs: number,
  focusedMs: number | undefined,
  preferences: DayGraphChartPreferencesRuntime | undefined,
) => {
  const defaults = preferences?.value ?? DEFAULT_DAY_GRAPH_PREFERENCES;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const scopeKey = preferences?.scopeKey;
  const previousScope = useRef(scopeKey);
  const [mode, setMode] = useState(defaults.mode);
  const [windowHours, setWindowHours] = useState<
    StoredDayGraphPreferences['windowHours']
  >(focusedMs === undefined ? defaults.windowHours : 3);
  const [windowAnchor, setWindowAnchor] = useState(focusedMs);
  const [remembered, setRemembered] = useState(defaults);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveAttempt = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    if (previousScope.current !== scopeKey) {
      previousScope.current = scopeKey;
      setMode(defaultsRef.current.mode);
    }
    setWindowHours(
      focusedMs === undefined ? defaultsRef.current.windowHours : 3,
    );
    setWindowAnchor(focusedMs);
  }, [dayStartMs, focusedMs, scopeKey]);

  useEffect(() => {
    setRemembered(defaultsRef.current);
  }, [defaults.mode, defaults.windowHours, scopeKey]);

  useEffect(() => {
    saving.current = false;
    setSaveStatus('idle');
    return () => {
      // A late completion must not update a different account/layout or an unmounted chart.
      saveAttempt.current += 1;
    };
  }, [scopeKey]);

  const isRemembered =
    remembered.mode === mode && remembered.windowHours === windowHours;
  const save = async (): Promise<void> => {
    if (!preferences?.onSave || saving.current || isRemembered) {
      return;
    }
    const value: StoredDayGraphPreferences = {
      schemaVersion: 1,
      mode,
      windowHours,
    };
    const attempt = ++saveAttempt.current;
    saving.current = true;
    setSaveStatus('saving');
    try {
      await preferences.onSave(value);
      if (attempt === saveAttempt.current) {
        setRemembered(value);
        setSaveStatus('idle');
      }
    } catch {
      if (attempt === saveAttempt.current) {
        setSaveStatus('error');
      }
    } finally {
      if (attempt === saveAttempt.current) {
        saving.current = false;
      }
    }
  };

  return {
    mode,
    setMode,
    windowHours,
    setWindowHours,
    windowAnchor,
    setWindowAnchor,
    isRemembered,
    saveStatus,
    save,
  };
};
