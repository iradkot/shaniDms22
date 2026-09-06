import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {filterInsulinDataToRange} from 'app/utils/nightscoutTreatments.utils';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';
import {
  getNightscoutConfigurationRevision,
  subscribeNightscoutConfiguration,
} from 'app/api/shaniNightscoutInstances';
import {mergeDeviceStatusIntoBgSamples} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';
import {
  calculateTimeInRangePercentages,
  TimeInRangeThresholds,
  TimeInRangePercentages,
} from 'app/utils/glucose/timeInRange';
import {
  sumBolusNearMeal,
  computeAbsorption,
  ABSORPTION_WINDOW_MS,
} from 'app/utils/mealAbsorption.utils';

import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO} from 'app/types/food.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {
  MealEntry,
  MealChartData,
  MealSlot,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';

// ── constants ────────────────────────────────────────────

/** Post-meal TIR scoring window: 0 → 3 hours after meal. */
const TIR_WINDOW_MS = ABSORPTION_WINDOW_MS;

/** Minimum BG readings needed in the window to compute a meaningful score. */
const MIN_BG_READINGS = 6; // ~30 min of 5-min CGM

/** Default TIR thresholds (ADA/AACE consensus). */
const DEFAULT_THRESHOLDS: TimeInRangeThresholds = {
  veryLowMax: 54,
  targetMin: 70,
  targetMax: 180,
  highMax: 250,
};

/** Window half-widths for the per-meal chart view. */
const CHART_PRE_MS = 30 * 60 * 1000; // 30 min before
const CHART_POST_MS = 4 * 60 * 60 * 1000; // 4 hrs after

// ── helpers ──────────────────────────────────────────────

/** Classify hour → meal slot. */
function classifyMealSlot(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) {
    return 'breakfast';
  }
  if (hour >= 11 && hour < 15) {
    return 'lunch';
  }
  if (hour >= 15 && hour < 21) {
    return 'dinner';
  }
  return 'snack';
}

/**
 * Compute the post-meal TIR breakdown for the window [mealTs, mealTs + windowMs].
 * Returns `null` when there are fewer than `MIN_BG_READINGS` in the window.
 */
function computePostMealTir(
  bgSamples: BgSample[],
  mealTs: number,
): {score: number; breakdown: TimeInRangePercentages} | null {
  const windowEnd = mealTs + TIR_WINDOW_MS;
  const windowSamples = bgSamples.filter(
    s => s.date >= mealTs && s.date <= windowEnd,
  );
  if (windowSamples.length < MIN_BG_READINGS) {
    return null;
  }

  const {percentages, validCount} = calculateTimeInRangePercentages(
    windowSamples,
    DEFAULT_THRESHOLDS,
  );
  if (!validCount) {
    return null;
  }

  return {
    score: Math.round(percentages.target),
    breakdown: percentages,
  };
}

// ── hook ─────────────────────────────────────────────────

export interface UseMealTreatmentsResult {
  meals: MealEntry[];
  isLoading: boolean;
  error: string | null;
  dataAvailability: InsulinContext['availability'];
  /** Build chart data for a specific meal (filtered window). */
  getChartDataForMeal: (meal: MealEntry) => MealChartData;
  refresh: () => Promise<void>;
}

const UNAVAILABLE: InsulinContext['availability'] = {
  treatments: 'unavailable',
  deviceStatus: 'unavailable',
  profile: 'unavailable',
};

/**
 * Fetches Nightscout treatments + BG + device-status for the given date range
 * and produces an enriched `MealEntry[]` with per-meal TIR score.
 */
export function useMealTreatments(
  /** Inclusive start (defaults to 7 days ago). */
  rangeStart: Date,
  /** Inclusive end (defaults to now). */
  rangeEnd: Date,
): UseMealTreatmentsResult {
  const [carbTreatments, setCarbTreatments] = useState<FoodItemDTO[]>([]);
  const [insulinData, setInsulinData] = useState<InsulinDataEntry[]>([]);
  const [bgSamples, setBgSamples] = useState<BgSample[]>([]);
  const [basalProfile, setBasalProfile] = useState<BasalProfile>([]);
  const [loadSamples, setLoadSamples] = useState<InsulinContext['loadSamples']>(
    [],
  );
  const [dataAvailability, setDataAvailability] = useState(UNAVAILABLE);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const revision = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutConfigurationRevision,
    getNightscoutConfigurationRevision,
  );
  const rangeStartMs = +rangeStart;
  const rangeEndMs = +rangeEnd;
  const period = useMemo(() => {
    const start = new Date(rangeStartMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEndMs);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    return {startMs: +start, endMs: +end};
  }, [rangeStartMs, rangeEndMs]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const scopeKey = `${revision}:${period.startMs}:${period.endMs}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  useLayoutEffect(() => {
    mounted.current = true;
    generation.current += 1;
    setCarbTreatments([]);
    setInsulinData([]);
    setBgSamples([]);
    setBasalProfile([]);
    setLoadSamples([]);
    setDataAvailability(UNAVAILABLE);
    setError(null);
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [scopeKey]);

  const fetchData = useCallback(
    async (forceRefresh: boolean) => {
      if (
        !mounted.current ||
        activeScope.current !== scopeKey ||
        revision !== getNightscoutConfigurationRevision()
      ) {
        return;
      }
      const request = ++generation.current;
      const isCurrent = () =>
        mounted.current &&
        request === generation.current &&
        activeScope.current === scopeKey &&
        revision === getNightscoutConfigurationRevision();
      try {
        setIsLoading(true);
        setError(null);
        const [bgData, context] = await Promise.all([
          fetchBgDataForDateRangeUncached(
            new Date(period.startMs),
            new Date(period.endMs - 1),
          ),
          loadInsulinContext({...period, forceRefresh}),
        ]);
        if (!isCurrent()) {
          return;
        }
        const enrichedBg = mergeDeviceStatusIntoBgSamples({
          bgSamples: bgData,
          deviceStatus: [...context.deviceStatus],
        });
        setCarbTreatments(context.carbTreatments);
        setInsulinData(context.insulinData);
        setBgSamples(enrichedBg);
        setBasalProfile(context.basalProfileData);
        setLoadSamples(context.loadSamples);
        setDataAvailability(context.availability);
      } catch {
        if (isCurrent()) {
          setError('Meal data could not be loaded.');
          setDataAvailability(previous => ({
            treatments:
              previous.treatments === 'available'
                ? 'stale'
                : previous.treatments,
            deviceStatus:
              previous.deviceStatus === 'available'
                ? 'stale'
                : previous.deviceStatus,
            profile:
              previous.profile === 'available' ? 'stale' : previous.profile,
          }));
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    },
    [period, revision, scopeKey],
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // ── enrich each carb treatment into a MealEntry ──
  const meals: MealEntry[] = useMemo(() => {
    return carbTreatments
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp) // newest first
      .map(ct => {
        const tir = computePostMealTir(bgSamples, ct.timestamp);
        const hour = new Date(ct.timestamp).getHours();

        // Absorption: uses shared utility (carbsEntered − COB at T+3h)
        const absorption = computeAbsorption(
          ct.carbs,
          dataAvailability.deviceStatus === 'available' ? bgSamples : [],
          ct.timestamp,
        );

        // Bolus insulin near this meal
        const bolusInsulinU =
          dataAvailability.treatments === 'available'
            ? sumBolusNearMeal(insulinData, ct.timestamp)
            : null;

        return {
          id: ct.id,
          carbsEntered: ct.carbs,
          timestamp: ct.timestamp,
          score: tir?.score ?? null,
          postMealTir: tir?.breakdown ?? null,
          cobRemaining: absorption.cobRemaining,
          absorbed: absorption.absorbed,
          absorptionPct: absorption.absorptionPct,
          bolusInsulinU,
          mealSlot: classifyMealSlot(hour),
          tags: ct.tags ?? [],
        } satisfies MealEntry;
      });
  }, [carbTreatments, bgSamples, insulinData, dataAvailability]);

  // ── per-meal chart data builder ──
  const getChartDataForMeal = useCallback(
    (meal: MealEntry): MealChartData => {
      const windowStart = meal.timestamp - CHART_PRE_MS;
      const windowEnd = meal.timestamp + CHART_POST_MS;

      const filteredBg = bgSamples.filter(
        s => s.date >= windowStart && s.date <= windowEnd,
      );
      const filteredInsulin = filterInsulinDataToRange(
        insulinData,
        windowStart,
        windowEnd,
      );

      // Food items in the window (the meal itself + any nearby)
      const filteredFood = carbTreatments.filter(
        f => f.timestamp >= windowStart && f.timestamp <= windowEnd,
      );

      return {
        bgSamples: filteredBg,
        loadSamples: loadSamples.filter(
          sample =>
            sample.timestampMs >= windowStart &&
            sample.timestampMs <= windowEnd,
        ),
        dataAvailability,
        insulinData: filteredInsulin,
        foodItems: filteredFood,
        basalProfileData: basalProfile,
        xDomain: [new Date(windowStart), new Date(windowEnd)],
      };
    },
    [
      bgSamples,
      insulinData,
      carbTreatments,
      basalProfile,
      loadSamples,
      dataAvailability,
    ],
  );
  const refresh = useCallback(() => fetchData(true), [fetchData]);
  return {
    meals,
    isLoading,
    error,
    dataAvailability,
    getChartDataForMeal,
    refresh,
  };
}
