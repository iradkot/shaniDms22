import {useCallback, useEffect, useMemo, useState} from 'react';
import {startOfDay, endOfDay} from 'date-fns';

import {
  fetchTreatmentsForDateRangeUncached,
  fetchBgDataForDateRangeUncached,
  fetchDeviceStatusForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
  extractBasalProfileFromNightscoutProfileData,
} from 'app/utils/nightscoutTreatments.utils';
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
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
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
  if (windowSamples.length < MIN_BG_READINGS) return null;

  const {percentages, validCount} = calculateTimeInRangePercentages(
    windowSamples,
    DEFAULT_THRESHOLDS,
  );
  if (!validCount) return null;

  return {
    score: Math.round(percentages.target),
    breakdown: percentages,
  };
}

// ── hook ─────────────────────────────────────────────────

export interface UseMealTreatmentsResult {
  meals: MealEntry[];
  isLoading: boolean;
  /** Build chart data for a specific meal (filtered window). */
  getChartDataForMeal: (meal: MealEntry) => MealChartData;
  refresh: () => void;
}

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
  const [isLoading, setIsLoading] = useState(true);

  const start = useMemo(() => startOfDay(rangeStart), [rangeStart]);
  const end = useMemo(() => endOfDay(rangeEnd), [rangeEnd]);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [treatments, bgData, deviceStatus, profileData] =
        await Promise.all([
          fetchTreatmentsForDateRangeUncached(start, end),
          fetchBgDataForDateRangeUncached(start, end),
          fetchDeviceStatusForDateRangeUncached(start, end),
          getUserProfileFromNightscout(new Date().toISOString()),
        ]);

      const enrichedBg = mergeDeviceStatusIntoBgSamples({
        bgSamples: bgData,
        deviceStatus,
      });

      setCarbTreatments(mapNightscoutTreatmentsToCarbFoodItems(treatments));
      setInsulinData(mapNightscoutTreatmentsToInsulinDataEntries(treatments));
      setBgSamples(enrichedBg);
      setBasalProfile(
        extractBasalProfileFromNightscoutProfileData(profileData),
      );
    } catch (err) {
      console.error('useMealTreatments: fetch failed', err);
    } finally {
      setIsLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    fetchData();
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
        const absorption = computeAbsorption(ct.carbs, bgSamples, ct.timestamp);

        // Bolus insulin near this meal
        const bolusInsulinU = sumBolusNearMeal(insulinData, ct.timestamp);

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
  }, [carbTreatments, bgSamples, insulinData]);

  // ── per-meal chart data builder ──
  const getChartDataForMeal = useCallback(
    (meal: MealEntry): MealChartData => {
      const windowStart = meal.timestamp - CHART_PRE_MS;
      const windowEnd = meal.timestamp + CHART_POST_MS;

      const filteredBg = bgSamples.filter(
        s => s.date >= windowStart && s.date <= windowEnd,
      );
      const filteredInsulin = insulinData.filter(i => {
        const ts =
          i.timestamp != null
            ? typeof i.timestamp === 'string'
              ? Date.parse(i.timestamp)
              : i.timestamp
            : 0;
        return ts >= windowStart && ts <= windowEnd;
      });

      // Food items in the window (the meal itself + any nearby)
      const filteredFood = carbTreatments.filter(
        f => f.timestamp >= windowStart && f.timestamp <= windowEnd,
      );

      return {
        bgSamples: filteredBg,
        insulinData: filteredInsulin,
        foodItems: filteredFood,
        basalProfileData: basalProfile,
        xDomain: [new Date(windowStart), new Date(windowEnd)],
      };
    },
    [bgSamples, insulinData, carbTreatments, basalProfile],
  );

  return {meals, isLoading, getChartDataForMeal, refresh: fetchData};
}
