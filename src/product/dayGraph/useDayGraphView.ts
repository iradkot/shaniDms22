import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {DEFAULT_DAY_GRAPH_PREFERENCES} from '../personalization/types';
import type {StoredDayGraphPreferences} from '../personalization/types';
import type {DayGraphChartPreferencesRuntime} from './runtime';

type SaveStatus = 'idle' | 'saving' | 'error';
type Mode = StoredDayGraphPreferences['mode'];
type WindowHours = StoredDayGraphPreferences['windowHours'];

interface ViewSession {
  scopeKey: string | undefined;
  hasKnownScope: boolean;
  live: boolean;
  mode: Mode;
  windowHours: WindowHours;
  defaultWindowHours: WindowHours;
  userMode: boolean;
  userZoom: boolean;
  explicitDefaultZoom: boolean;
  pendingMode: boolean;
  remembered: StoredDayGraphPreferences;
  sequence: number;
  status: SaveStatus;
  pending?: {value: StoredDayGraphPreferences; completion: Promise<void>};
}

const sameView = (
  left: StoredDayGraphPreferences,
  right: StoredDayGraphPreferences,
) => left.mode === right.mode && left.windowHours === right.windowHours;

const createSession = (
  scopeKey: string | undefined,
  defaults: StoredDayGraphPreferences,
  focusedMs: number | undefined,
): ViewSession => ({
  scopeKey,
  hasKnownScope: scopeKey !== undefined,
  live: true,
  mode: defaults.mode,
  windowHours: focusedMs === undefined ? defaults.windowHours : 3,
  defaultWindowHours: defaults.windowHours,
  userMode: false,
  userZoom: false,
  explicitDefaultZoom: false,
  pendingMode: false,
  remembered: defaults,
  sequence: 0,
  status: 'idle',
});

/** Mode persists immediately; exploratory zoom only persists with an explicit save. */
export const useDayGraphView = (
  dayStartMs: number,
  focusedMs: number | undefined,
  preferences: DayGraphChartPreferencesRuntime | undefined,
) => {
  const defaults = preferences?.value ?? DEFAULT_DAY_GRAPH_PREFERENCES;
  const scopeKey = preferences?.scopeKey;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const sessionRef = useRef(createSession(scopeKey, defaults, focusedMs));
  const [mode, updateMode] = useState(defaults.mode);
  const [windowHours, updateWindowHours] = useState<WindowHours>(
    sessionRef.current.windowHours,
  );
  const [windowAnchor, setWindowAnchor] = useState(focusedMs);
  const [remembered, setRemembered] = useState(defaults);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const persist = useCallback(
    (value: StoredDayGraphPreferences): Promise<void> => {
      const session = sessionRef.current;
      const runtime = preferencesRef.current;
      const writer = runtime?.onSave;
      if (
        !writer ||
        runtime.hydrated === false ||
        runtime.scopeKey !== session.scopeKey
      ) {
        return Promise.resolve();
      }
      if (session.pending && sameView(session.pending.value, value)) {
        return session.pending.completion;
      }
      if (
        !session.pending &&
        session.status !== 'error' &&
        sameView(session.remembered, value)
      ) {
        return Promise.resolve();
      }
      const sequence = ++session.sequence;
      session.status = 'saving';
      setSaveStatus('saving');
      const isCurrent = () =>
        session.live &&
        sessionRef.current === session &&
        session.sequence === sequence;
      // The personalization owner serializes durable writes. Submit every latest
      // intent now, including one made just before navigating away from this chart.
      const submit = async () => writer(value);
      const completion = submit()
        .then(
          () => {
            if (isCurrent()) {
              session.remembered = value;
              session.status = 'idle';
              setRemembered(value);
              setSaveStatus('idle');
            }
          },
          () => {
            if (isCurrent()) {
              session.status = 'error';
              setSaveStatus('error');
            }
          },
        )
        .finally(() => {
          if (session.sequence === sequence) {
            delete session.pending;
          }
        });
      session.pending = {value, completion};
      return completion;
    },
    [],
  );

  useLayoutEffect(() => {
    const previous = sessionRef.current;
    if (previous.scopeKey === scopeKey) {
      return;
    }
    previous.live = false;
    const session = createSession(scopeKey, defaults, focusedMs);
    // A first account hydration can arrive after interaction. A later account
    // or layout switch always starts its own session, even through undefined.
    if (!previous.hasKnownScope) {
      session.userMode = previous.userMode;
      session.pendingMode = previous.pendingMode;
      session.userZoom = previous.userZoom;
      if (previous.userMode) {
        session.mode = previous.mode;
      }
      if (previous.userZoom) {
        session.windowHours = previous.windowHours;
      }
    }
    session.hasKnownScope ||= previous.hasKnownScope;
    sessionRef.current = session;
    updateMode(session.mode);
    updateWindowHours(session.windowHours);
    setRemembered(session.remembered);
    setSaveStatus('idle');
    setWindowAnchor(focusedMs);
  }, [defaults, focusedMs, scopeKey]);

  useLayoutEffect(() => {
    if (preferences?.hydrated === false) {
      return;
    }
    const session = sessionRef.current;
    if (!session.userMode) {
      session.mode = defaults.mode;
      updateMode(defaults.mode);
    }
    if (!session.explicitDefaultZoom) {
      session.defaultWindowHours = defaults.windowHours;
    }
    if (!session.userZoom && focusedMs === undefined) {
      session.windowHours = session.defaultWindowHours;
      updateWindowHours(session.windowHours);
    }
    const nextRemembered: StoredDayGraphPreferences = {
      schemaVersion: 1,
      mode: session.userMode ? session.remembered.mode : defaults.mode,
      windowHours: session.explicitDefaultZoom
        ? session.remembered.windowHours
        : defaults.windowHours,
    };
    if (!sameView(nextRemembered, session.remembered)) {
      session.remembered = nextRemembered;
      setRemembered(nextRemembered);
    }
    if (session.pendingMode && preferences?.onSave) {
      session.pendingMode = false;
      persist({
        schemaVersion: 1,
        mode: session.mode,
        windowHours: session.defaultWindowHours,
      });
    }
  }, [
    defaults.mode,
    defaults.windowHours,
    focusedMs,
    persist,
    preferences?.hydrated,
    preferences?.onSave,
    scopeKey,
  ]);

  const previousFocus = useRef({dayStartMs, focusedMs});
  useLayoutEffect(() => {
    if (
      previousFocus.current.dayStartMs === dayStartMs &&
      previousFocus.current.focusedMs === focusedMs
    ) {
      return;
    }
    previousFocus.current = {dayStartMs, focusedMs};
    const session = sessionRef.current;
    session.userZoom = false;
    session.windowHours =
      focusedMs === undefined ? session.defaultWindowHours : 3;
    updateWindowHours(session.windowHours);
    setWindowAnchor(focusedMs);
  }, [dayStartMs, focusedMs]);

  useEffect(() => {
    sessionRef.current.live = true;
    return () => {
      sessionRef.current.live = false;
    };
  }, []);

  const setMode = useCallback(
    (next: Mode) => {
      const session = sessionRef.current;
      if (session.mode === next && session.status !== 'error') {
        return;
      }
      session.mode = next;
      session.userMode = true;
      updateMode(next);
      const runtime = preferencesRef.current;
      session.pendingMode = !runtime?.onSave || runtime.hydrated === false;
      if (!session.pendingMode) {
        persist({
          schemaVersion: 1,
          mode: next,
          windowHours: session.defaultWindowHours,
        });
      }
    },
    [persist],
  );

  const setWindowHours = useCallback((next: WindowHours) => {
    const session = sessionRef.current;
    session.userZoom = true;
    session.windowHours = next;
    updateWindowHours(next);
  }, []);

  const save = useCallback((): Promise<void> => {
    const runtime = preferencesRef.current;
    if (!runtime?.onSave || runtime.hydrated === false) {
      return Promise.resolve();
    }
    const session = sessionRef.current;
    session.explicitDefaultZoom = true;
    session.defaultWindowHours = session.windowHours;
    return persist({
      schemaVersion: 1,
      mode: session.mode,
      windowHours: session.windowHours,
    });
  }, [persist]);

  const isRemembered =
    saveStatus !== 'error' &&
    remembered.mode === mode &&
    remembered.windowHours === windowHours;

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
