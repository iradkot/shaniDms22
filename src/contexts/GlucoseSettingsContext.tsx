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

export type GlucoseSettings = {
  /** mg/dL; values <= this are considered severe low. */
  severeHypo: number;
  /** mg/dL; values below this are considered low. */
  hypo: number;
  /** mg/dL; values above this are considered high. */
  hyper: number;
  /** mg/dL; values >= this are considered severe high. */
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
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'glucose.settings.v1';

const scopedStorageKey = (userId: string | null): string =>
  `${STORAGE_KEY}:${encodeURIComponent(userId?.trim() || 'signed-out')}`;

const DEFAULT_SETTINGS: GlucoseSettings = {
  severeHypo: cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number,
  hypo: cgmRange.TARGET.min,
  hyper: cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number,
  severeHyper: cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] as number,

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

  // Basic ordering check; if invalid, fall back to defaults.
  const isOrdered = severeHypo < hypo && hypo < hyper && hyper < severeHyper;
  const areMealHoursOrdered = breakfastStartHour < lunchStartHour && lunchStartHour < dinnerStartHour;
  if (!isOrdered || !areMealHoursOrdered) {
    return {
      ...DEFAULT_SETTINGS,
      nightStartHour,
      nightEndHour,
    };
  }

  return {
    severeHypo,
    hypo,
    hyper,
    severeHyper,
    nightStartHour,
    nightEndHour,
    breakfastStartHour,
    lunchStartHour,
    dinnerStartHour,
  };
}

function applyToGlobals(s: GlucoseSettings) {
  // Mutate exported config objects so existing imports see the latest values.
  cgmRange[CGM_STATUS_CODES.EXTREME_LOW] = s.severeHypo;
  cgmRange.TARGET.min = s.hypo;
  cgmRange[CGM_STATUS_CODES.VERY_HIGH] = s.hyper;
  cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] = s.severeHyper;

  DEFAULT_NIGHT_WINDOW.startHour = s.nightStartHour;
  DEFAULT_NIGHT_WINDOW.endHour = s.nightEndHour;
}

const GlucoseSettingsContext = createContext<GlucoseSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSetting: () => {},
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

  useEffect(
    () =>
      authSession.subscribe(userId => {
        const nextOwner = userId?.trim() || null;
        if (nextOwner === ownerUserIdRef.current) {
          return;
        }
        ownerUserIdRef.current = nextOwner;
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
        if (!isMounted || ownerUserIdRef.current !== ownerUserId) {
          return;
        }

        if (!stored) {
          applyToGlobals(DEFAULT_SETTINGS);
          return;
        }

        const parsed = JSON.parse(stored) as Partial<GlucoseSettings>;
        const next = sanitize(parsed);
        setSettings(next);
        applyToGlobals(next);
      } catch {
        // Best-effort: keep defaults.
        if (isMounted && ownerUserIdRef.current === ownerUserId) {
          applyToGlobals(DEFAULT_SETTINGS);
        }
      } finally {
        if (isMounted && ownerUserIdRef.current === ownerUserId) {
          setIsLoaded(true);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [ownerUserId]);

  const persist = useCallback(async (
    next: GlucoseSettings,
    expectedOwnerUserId: string | null,
  ) => {
    try {
      await AsyncStorage.setItem(
        scopedStorageKey(expectedOwnerUserId),
        JSON.stringify(next),
      );
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof GlucoseSettings>(key: K, value: GlucoseSettings[K]) => {
      const mutationOwner = ownerUserId;
      if (ownerUserIdRef.current !== mutationOwner) {
        return;
      }
      setSettings(prev => {
        const candidate = {
          ...prev,
          [key]: value,
        } as GlucoseSettings;
        const next = sanitize(candidate);
        applyToGlobals(next);
        persist(next, mutationOwner);
        return next;
      });
    },
    [ownerUserId, persist],
  );

  const resetToDefaults = useCallback(() => {
    const mutationOwner = ownerUserId;
    if (ownerUserIdRef.current !== mutationOwner) {
      return;
    }
    setSettings(DEFAULT_SETTINGS);
    applyToGlobals(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS, mutationOwner);
  }, [ownerUserId, persist]);

  useEffect(() => {
    setAndroidWidgetThresholds(settings.hypo, settings.hyper);
  }, [settings.hypo, settings.hyper]);

  const value = useMemo<GlucoseSettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setSetting,
      resetToDefaults,
    }),
    [settings, isLoaded, setSetting, resetToDefaults],
  );

  return (
    <GlucoseSettingsContext.Provider value={value}>
      {children}
    </GlucoseSettingsContext.Provider>
  );
};

export default GlucoseSettingsContext;
