import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO} from 'app/types/food.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {TimeInRangePercentages} from 'app/utils/glucose/timeInRange';

/** A single meal row enriched with loop context. */
export interface MealEntry {
  /** Unique identifier (treatment id or generated). */
  id: string;
  /** Carbs entered into the loop (grams). */
  carbsEntered: number;
  /** Meal timestamp in ms. */
  timestamp: number;
  /**
   * Post-meal TIR score (0-100) — percentage of BG readings in-range
   * during the 3 hours following the meal.
   * null when insufficient BG data is available.
   */
  score: number | null;
  /**
   * Full 5-bucket TIR breakdown for the 3-hour post-meal window.
   * Shown when the row is expanded.
   */
  postMealTir: TimeInRangePercentages | null;
  /** Remaining COB at end of 3-hr post-meal window (grams). */
  cobRemaining: number | null;
  /** Estimated carbs absorbed within 3-hr post-meal window (grams). */
  absorbed: number | null;
  /** Absorption percentage (0-100): absorbed / carbsEntered × 100. */
  absorptionPct: number | null;
  /** Total bolus insulin (U) delivered within ±15 min of the meal. */
  bolusInsulinU: number | null;
  /** Time-of-day label derived from timestamp. */
  mealSlot: MealSlot;
}

/** Chart-ready data scoped to a 5-hour window around a meal. */
export interface MealChartData {
  bgSamples: BgSample[];
  insulinData: InsulinDataEntry[];
  foodItems: FoodItemDTO[];
  basalProfileData: BasalProfile;
  xDomain: [Date, Date];
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type CarbRangeFilter = 'all' | 'low' | 'medium' | 'high';

export type SortField =
  | 'timestamp'
  | 'carbsEntered'
  | 'absorptionPct'
  | 'score';

export type SortDirection = 'asc' | 'desc';
