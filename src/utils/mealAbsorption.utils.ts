/**
 * Shared meal absorption utilities.
 *
 * Extracted from FoodTracker's useMealTreatments so the Home screen
 * and FoodTracker tab use the same logic for COB lookup and absorption
 * calculations.
 */
import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';

/** Post-meal absorption window: 3 hours. */
export const ABSORPTION_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Tolerance for associating a bolus with a meal. */
export const BOLUS_WINDOW_MS = 15 * 60 * 1000;

/**
 * Find the COB value from the BG sample closest to `targetTs` (within tolerance).
 * BG samples must be enriched with `.cob` from device-status
 * (via `mergeDeviceStatusIntoBgSamples`).
 */
export function findCobAtTime(
  bgSamples: BgSample[],
  targetTs: number,
  toleranceMs: number = 30 * 60 * 1000,
): number | null {
  let best: BgSample | null = null;
  let bestDist = Infinity;

  for (const s of bgSamples) {
    if (s.cob == null) continue;
    const dist = Math.abs(s.date - targetTs);
    if (dist < bestDist && dist <= toleranceMs) {
      best = s;
      bestDist = dist;
    }
  }

  return best?.cob ?? null;
}

/**
 * Sum all bolus insulin entries within ±BOLUS_WINDOW_MS of the meal timestamp.
 * Returns null if no boluses found.
 */
export function sumBolusNearMeal(
  insulinEntries: InsulinDataEntry[],
  mealTs: number,
): number | null {
  let total = 0;
  let found = false;

  for (const entry of insulinEntries) {
    if (entry.type !== 'bolus' || !entry.amount) continue;
    const ts = entry.timestamp ? Date.parse(entry.timestamp) : 0;
    if (Math.abs(ts - mealTs) <= BOLUS_WINDOW_MS) {
      total += entry.amount;
      found = true;
    }
  }

  return found ? Math.round(total * 100) / 100 : null;
}

/**
 * Compute carb absorption for a meal using the COB delta approach.
 *
 * Instead of simply using `carbsEntered - COB_at_T+3h` (which is wrong when
 * multiple meals overlap), we compare the COB *before* the meal with COB at
 * T+3h and attribute the difference to this meal:
 *
 *   expectedCobAfterMeal = cobBefore + carbsEntered
 *   totalDecayInWindow   = expectedCobAfterMeal - cobAtEnd
 *   absorbed             = clamp(totalDecayInWindow, 0, carbsEntered)
 *
 * When `cobBefore` is unavailable (no device-status sample near the meal),
 * we fall back to the simpler formula.
 *
 * @param carbsEntered  Carbs logged by the user (g)
 * @param bgSamples     Enriched BG samples for the day (must have .cob)
 * @param mealTs        Meal timestamp (ms)
 * @returns             { absorbed, absorptionPct, cobRemaining } or nulls
 */
export function computeAbsorption(
  carbsEntered: number,
  bgSamples: BgSample[],
  mealTs: number,
): {absorbed: number | null; absorptionPct: number | null; cobRemaining: number | null} {
  if (carbsEntered <= 0) {
    return {absorbed: null, absorptionPct: null, cobRemaining: null};
  }

  const cobAtEnd = findCobAtTime(bgSamples, mealTs + ABSORPTION_WINDOW_MS);
  if (cobAtEnd == null) {
    return {absorbed: null, absorptionPct: null, cobRemaining: null};
  }

  // Try to find COB just before the meal (within 10 min before mealTs)
  const cobBefore = findCobAtTime(bgSamples, mealTs - 5 * 60 * 1000, 10 * 60 * 1000);

  let absorbed: number;
  if (cobBefore != null) {
    // Delta approach: how much of (cobBefore + carbsEntered) has decayed?
    const expectedCob = cobBefore + carbsEntered;
    const totalDecay = expectedCob - cobAtEnd;
    // Cap at carbsEntered — we can't attribute more absorption than this meal's carbs
    absorbed = Math.max(0, Math.min(totalDecay, carbsEntered));
  } else {
    // Fallback: simple formula (less accurate with overlapping meals)
    absorbed = Math.max(0, carbsEntered - Math.min(cobAtEnd, carbsEntered));
  }

  const absorptionPct = Math.round((absorbed / carbsEntered) * 100);
  const cobRemaining = Math.round(Math.max(0, carbsEntered - absorbed));

  return {
    absorbed: Math.round(absorbed),
    absorptionPct,
    cobRemaining,
  };
}
