import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW} from 'app/constants/GLUCOSE_WINDOWS';
import {setAndroidWidgetThresholds} from 'app/services/androidGlucoseLiveSurface';
import {nativeNightscoutVaultAuthSession} from 'app/services/backend/nativeNightscoutVaultSync';
import type {NightscoutVaultAuthSession} from 'app/services/backend/nightscoutVaultSynchronizer';
import {DEFAULT_GLUCOSE_RANGE_THRESHOLDS, isValidGlucoseRangeThresholds} from 'app/modules/settings';
import type {TrendsRangeThresholds} from 'app/modules/trends';

export type GlucoseSettings = {
  /** mg/dL; values below this are considered very low. */
  severeHypo: number;
  /** mg/dL; values below this are considered low. */
  hypo: number;
  /** mg/dL; values above this are considered high. */
  hyper: number;
  /** mg/dL; values above this are considered very high. */
  severeHyper: number;

  /** Local time window start hour (0..23). */
  nightStartHour: number;
  /** Local time window end hour (0..23). */
  nightEndHour: number;

  /** Meal window starts (0..23). */
  breakfastStartHour: number;
  lunchStartHour: number;
  dinnerStartHour: number;
};

type GlucoseSettingsContextValue = {
  settings: GlucoseSettings;
  isLoaded: boolean;
  setSetting: <K extends keyof GlucoseSettings>(key: K, value: GlucoseSettings[K]) => void;
  saveRanges: (thresholds: TrendsRangeThresholds) => Promise<void>;
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'glucose.settings.v1';

const scopedStorageKey = (userId: string | null): string =>
  `${STORAGE_KEY}:${encodeURIComponent(userId?.trim() || 'signed-out')}`;

const DEFAULT_SETTINGS: GlucoseSettings = {
  severeHypo: DEFAULT_GLUCOSE_RANGE_THRESHOLDS.veryLowMaxMgDl,
  hypo: DEFAULT_GLUCOSE_RANGE_THRESHOLDS.targetMinMgDl,
  hyper: DEFAULT_GLUCOSE_RANGE_THRESHOLDS.targetMaxMgDl,
  severeHyper: DEFAULT_GLUCOSE_RANGE_THRESHOLDS.highMaxMgDl,

  nightStartHour: DEFAULT_NIGHT_WINDOW.startHour,
  nightEndHour: DEFAULT_NIGHT_WINDOW.endHour,

  breakfastStartHour: 5,
  lunchStartHour: 11,
  dinnerStartHour: 16,
};

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== 'number') {
    return null;
  }
  return Number.isFinite(v) ? v : null;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function sanitize(partial: Partial<GlucoseSettings>): GlucoseSettings {
  const severeHypo = toFiniteNumber(partial.severeHypo) ?? DEFAULT_SETTINGS.severeHypo;
  const hypo = toFiniteNumber(partial.hypo) ?? DEFAULT_SETTINGS.hypo;
  const hyper = toFiniteNumber(partial.hyper) ?? DEFAULT_SETTINGS.hyper;
  const severeHyper = toFiniteNumber(partial.severeHyper) ?? DEFAULT_SETTINGS.severeHyper;

  const nightStartHourRaw = toFiniteNumber(partial.nightStartHour);
  const nightEndHourRaw = toFiniteNumber(partial.nightEndHour);
  const nightStartHour = clampInt(
    nightStartHourRaw ?? DEFAULT_SETTINGS.nightStartHour,
    0,
    23,
  );
  const nightEndHour = clampInt(
    nightEndHourRaw ?? DEFAULT_SETTINGS.nightEndHour,
    0,
    23,
  );

  const breakfastStartHour = clampInt(
    toFiniteNumber(partial.breakfastStartHour) ?? DEFAULT_SETTINGS.breakfastStartHour,
    0,
    23,
  );
  const lunchStartHour = clampInt(
    toFiniteNumber(partial.lunchStartHour) ?? DEFAULT_SETTINGS.lunchStartHour,
    0,
    23,
  );
  const dinnerStartHour = clampInt(
    toFiniteNumber(partial.dinnerStartHour) ?? DEFAULT_SETTINGS.dinnerStartHour,
    0,
    23,
  );

  const validRanges = isValidGlucoseRangeThresholds({
    veryLowMaxMgDl: severeHypo,
    targetMinMgDl: hypo,
    targetMaxMgDl: hyper,
    highMaxMgDl: severeHyper,
  });
  const areMealHoursOrdered = breakfastStartHour < lunchStartHour && lunchStartHour < dinnerStartHour;
  return {
    severeHypo: validRanges ? severeHypo : DEFAULT_SETTINGS.severeHypo,
    hypo: validRanges ? hypo : DEFAULT_SETTINGS.hypo,
    hyper: validRanges ? hyper : DEFAULT_SETTINGS.hyper,
    severeHyper: validRanges ? severeHyper : DEFAULT_SETTINGS.severeHyper,
    nightStartHour,
    nightEndHour,
    breakfastStartHour: areMealHoursOrdered ? breakfastStartHour : DEFAULT_SETTINGS.breakfastStartHour,
    lunchStartHour: areMealHoursOrdered ? lunchStartHour : DEFAULT_SETTINGS.lunchStartHour,
    dinnerStartHour: areMealHoursOrdered ? dinnerStartHour : DEFAULT_SETTINGS.dinnerStartHour,
  };
}

function applyToGlobals(s: GlucoseSettings) {
  // Mutate exported config objects so existing imports see the latest values.
  cgmRange[CGM_STATUS_CODES.EXTREME_LOW] = s.severeHypo;
  cgmRange.TARGET.min = s.hypo;
  cgmRange.TARGET.max = s.hyper;
  cgmRange[CGM_STATUS_CODES.VERY_HIGH] = s.hyper;
  cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] = s.severeHyper;

  DEFAULT_NIGHT_WINDOW.startHour = s.nightStartHour;
  DEFAULT_NIGHT_WINDOW.endHour = s.nightEndHour;
}

const GlucoseSettingsContext = createContext<GlucoseSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
  saveRanges: async () => { throw new Error('Glucose settings are unavailable.'); },
  resetToDefaults: () => {},
});

export const useGlucoseSettings = () => useContext(GlucoseSettingsContext);

export const GlucoseSettingsProvider = ({
  children,
  authSession = nativeNightscoutVaultAuthSession,
}: {
  children: React.ReactNode;
  authSession?: NightscoutVaultAuthSession;
}) => {
  const [settings, setSettings] = useState<GlucoseSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(() =>
    authSession.getCurrentUserId()?.trim() || null,
  );
  const ownerUserIdRef = useRef(ownerUserId);
  const ownerRevision = useRef(0);
  const [ownerVersion, setOwnerVersion] = useState(0);
  const settingsRef = useRef(settings);
  const loadedRef = useRef(false);
  const writeTail = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(
    () =>
      authSession.subscribe(userId => {
        const nextOwner = userId?.trim() || null;
        if (nextOwner === ownerUserIdRef.current) {
          return;
        }
        ownerUserIdRef.current = nextOwner;
        ownerRevision.current += 1;
        setOwnerVersion(ownerRevision.current);
        settingsRef.current = DEFAULT_SETTINGS;
        loadedRef.current = false;
        setSettings(DEFAULT_SETTINGS);
        applyToGlobals(DEFAULT_SETTINGS);
        setAndroidWidgetThresholds(DEFAULT_SETTINGS.hypo, DEFAULT_SETTINGS.hyper);
        setIsLoaded(false);
        setOwnerUserId(nextOwner);
      }),
    [authSession],
  );

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const scopedKey = scopedStorageKey(ownerUserId);
        let stored = await AsyncStorage.getItem(scopedKey);
        if (stored === null && ownerUserId === null) {
          stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored !== null) {
            await AsyncStorage.setItem(scopedKey, stored);
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
        if (!isMounted || ownerUserIdRef.current !== ownerUserId || ownerRevision.current !== ownerVersion) {
          return;
        }

        if (!stored) {
          applyToGlobals(DEFAULT_SETTINGS);
          return;
        }

        const parsed = JSON.parse(stored) as Partial<GlucoseSettings>;
        const next = sanitize(parsed);
        settingsRef.current = next;
        setSettings(next);
        applyToGlobals(next);
      } catch {
        // Best-effort: keep defaults.
        if (isMounted && ownerUserIdRef.current === ownerUserId && ownerRevision.current === ownerVersion) {
          applyToGlobals(DEFAULT_SETTINGS);
        }
      } finally {
        if (isMounted && ownerUserIdRef.current === ownerUserId && ownerRevision.current === ownerVersion) {
          loadedRef.current = true;
          setIsLoaded(true);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [ownerUserId, ownerVersion]);

  // One ordered, atomic write publishes the new ranges only after persistence.
  // A stale editor cannot modify a newly selected account (including A -> B -> A).
  const updateSettings = useCallback((
    change: (current: GlucoseSettings) => GlucoseSettings,
  ): Promise<void> => {
    const expectedOwnerUserId = ownerUserId;
    const expectedRevision = ownerVersion;
    const assertCurrent = () => {
      if (!mountedRef.current || !loadedRef.current || ownerUserIdRef.current !== expectedOwnerUserId ||
          ownerRevision.current !== expectedRevision) {
        throw new Error('Glucose settings changed. Open Settings again.');
      }
    };
    const run = writeTail.current.then(async () => {
      assertCurrent();
      const next = change(settingsRef.current);
      await AsyncStorage.setItem(
        scopedStorageKey(expectedOwnerUserId),
        JSON.stringify(next),
      );
      assertCurrent();
      settingsRef.current = next;
      applyToGlobals(next);
      setSettings(next);
    });
    writeTail.current = run.catch(() => {});
    return run;
  }, [ownerUserId, ownerVersion]);

  const setSetting = useCallback(
    <K extends keyof GlucoseSettings>(key: K, value: GlucoseSettings[K]) => {
      updateSettings(prev => sanitize({...prev, [key]: value})).catch(() => {});
    },
    [updateSettings],
  );

  const resetToDefaults = useCallback(() => {
    updateSettings(() => DEFAULT_SETTINGS).catch(() => {});
  }, [updateSettings]);

  const saveRanges = useCallback(async (thresholds: TrendsRangeThresholds) => {
    if (!isValidGlucoseRangeThresholds(thresholds)) {
      throw new Error('Glucose ranges must contain four increasing whole numbers.');
    }
    await updateSettings(current => ({
      ...current,
      severeHypo: thresholds.veryLowMaxMgDl,
      hypo: thresholds.targetMinMgDl,
      hyper: thresholds.targetMaxMgDl,
      severeHyper: thresholds.highMaxMgDl,
    }));
  }, [updateSettings]);

  useEffect(() => {
    setAndroidWidgetThresholds(settings.hypo, settings.hyper);
  }, [settings.hypo, settings.hyper]);

  const value = useMemo<GlucoseSettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setSetting,
      saveRanges,
      resetToDefaults,
    }),
    [settings, isLoaded, setSetting, saveRanges, resetToDefaults],
  );

  return (
    <GlucoseSettingsContext.Provider value={value}>
      {children}
    </GlucoseSettingsContext.Provider>
  );
};

export default GlucoseSettingsContext;
