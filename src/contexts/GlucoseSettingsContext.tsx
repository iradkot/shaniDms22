import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW} from 'app/constants/GLUCOSE_WINDOWS';

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
};

type GlucoseSettingsContextValue = {
  settings: GlucoseSettings;
  isLoaded: boolean;
  setSetting: <K extends keyof GlucoseSettings>(key: K, value: GlucoseSettings[K]) => void;
  resetToDefaults: () => void;
};

const STORAGE_KEY = 'glucose.settings.v1';

const DEFAULT_SETTINGS: GlucoseSettings = {
  severeHypo: cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number,
  hypo: cgmRange.TARGET.min,
  hyper: cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number,
  severeHyper: cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] as number,

  nightStartHour: DEFAULT_NIGHT_WINDOW.startHour,
  nightEndHour: DEFAULT_NIGHT_WINDOW.endHour,
};

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== 'number') return null;
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

  // Basic ordering check; if invalid, fall back to defaults.
  const isOrdered = severeHypo < hypo && hypo < hyper && hyper < severeHyper;
  if (!isOrdered) {
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

export const GlucoseSettingsProvider = ({children}: {children: React.ReactNode}) => {
  const [settings, setSettings] = useState<GlucoseSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isMounted) return;

        if (!stored) {
          applyToGlobals(DEFAULT_SETTINGS);
          return;
        }

        const parsed = JSON.parse(stored) as Partial<GlucoseSettings>;
        const next = sanitize(parsed);
        setSettings(next);
        applyToGlobals(next);
      } catch (e) {
        // Best-effort: keep defaults.
        applyToGlobals(DEFAULT_SETTINGS);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: GlucoseSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // Best-effort persistence.
    }
  }, []);

  const setSetting = useCallback(
    <K extends keyof GlucoseSettings>(key: K, value: GlucoseSettings[K]) => {
      setSettings(prev => {
        const candidate = {
          ...prev,
          [key]: value,
        } as GlucoseSettings;
        const next = sanitize(candidate);
        applyToGlobals(next);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    applyToGlobals(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

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
