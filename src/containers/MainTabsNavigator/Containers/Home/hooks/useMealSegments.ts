/**
 * Detects meal segments from carb/bolus treatment events and enriches each
 * segment with BG context (before → peak → after) from CGM data.
 *
 * A "meal" is defined as a cluster of carb and/or bolus events that occur
 * within a configurable time window (default: 15 minutes).
 */
import {useMemo} from 'react';
import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {FoodItemDTO} from 'app/types/food.types';
import {computeAbsorption} from 'app/utils/mealAbsorption.utils';

// ── Public types ────────────────────────────────────────────────────────

export interface MealSegment {
  /** Unique key for React lists */
  id: string;
  /** Timestamp (ms) of the first event in the segment */
  startMs: number;
  /** Timestamp (ms) of the last event in the segment */
  endMs: number;
  /** Human-readable label like "Breakfast", "Lunch", etc. */
  label: string;
  /** Total carbs across all events in this segment */
  totalCarbs: number;
  /** Total bolus insulin across all events in this segment */
  totalBolus: number;
  /** Number of bolus entries in the segment */
  bolusCount: number;
  /** BG at or just before the meal start */
  bgBefore: number | null;
  /** Peak BG in the 2h window after the meal */
  bgPeak: number | null;
  /** BG at the end of the 2h post-meal window (or latest available) */
  bgAfter: number | null;
  /** Minutes from meal start to peak BG */
  timeToPeakMin: number | null;
  /** Time in range percent in the post-meal 2h window */
  postMealTirPct: number | null;
  /** % below range in post-meal 2h window */
  postMealLowPct: number | null;
  /** % above range in post-meal 2h window */
  postMealHighPct: number | null;
  /** Food item names (if any) */
  foodNames: string[];
  /** Grams of carbs absorbed (carbsEntered − COB at T+3h) */
  absorbed: number | null;
  /** Absorption percentage (0–100) */
  absorptionPct: number | null;
  /** COB remaining at T+3h */
  cobRemaining: number | null;
  /** Treatment/event IDs that belong to this meal (for tag lookup). */
  mealIds: string[];
  /** User-applied tags (e.g. ["pizza", "family dinner"]). */
  tags: string[];
}

// ── Constants ───────────────────────────────────────────────────────────

const CLUSTER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const POST_MEAL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const LOOKBACK_MS = 10 * 60 * 1000; // 10 min before meal for "BG before"

// ── Internal helpers ────────────────────────────────────────────────────

interface MealEvent {
  timestampMs: number;
  carbs: number;
  bolus: number;
  foodName: string | null;
  /** Source treatment/food-item ID (for tag lookup). */
  sourceId: string | null;
}

function parseTimestampMs(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function buildEventsFromTreatments(
  insulinData: InsulinDataEntry[],
  carbTreatments: FoodItemDTO[],
  foodItems: FoodItemDTO[],
): MealEvent[] {
  const events: MealEvent[] = [];

  // Bolus events
  for (const entry of insulinData) {
    if (entry.type !== 'bolus' || !entry.amount) continue;
    const ms = parseTimestampMs(entry.timestamp);
    if (!ms) continue;
    events.push({timestampMs: ms, carbs: 0, bolus: entry.amount, foodName: null, sourceId: null});
  }

  // Carb treatments (from Nightscout)
  for (const ct of carbTreatments) {
    if (!ct.carbs || ct.carbs <= 0) continue;
    events.push({
      timestampMs: ct.timestamp,
      carbs: ct.carbs,
      bolus: 0,
      foodName: ct.name || null,
      sourceId: ct.id || null,
    });
  }

  // User-logged food items (from Firebase)
  for (const fi of foodItems) {
    if (!fi.carbs || fi.carbs <= 0) continue;
    // Avoid duplication: skip if a carb treatment already exists within 2 min
    const isDuplicate = events.some(
      e => e.carbs > 0 && Math.abs(e.timestampMs - fi.timestamp) < 2 * 60 * 1000,
    );
    if (isDuplicate) continue;
    events.push({
      timestampMs: fi.timestamp,
      carbs: fi.carbs,
      bolus: 0,
      foodName: fi.name || null,
      sourceId: fi.id || null,
    });
  }

  // Sort chronologically
  events.sort((a, b) => a.timestampMs - b.timestampMs);
  return events;
}

function clusterEvents(events: MealEvent[]): MealEvent[][] {
  if (!events.length) return [];

  const clusters: MealEvent[][] = [[events[0]]];

  for (let i = 1; i < events.length; i++) {
    const current = events[i];
    const lastCluster = clusters[clusters.length - 1];
    const lastEvent = lastCluster[lastCluster.length - 1];

    if (current.timestampMs - lastEvent.timestampMs <= CLUSTER_WINDOW_MS) {
      lastCluster.push(current);
    } else {
      clusters.push([current]);
    }
  }

  return clusters;
}

function labelForTime(hourOfDay: number): string {
  if (hourOfDay < 6) return 'Early Snack';
  if (hourOfDay < 10) return 'Breakfast';
  if (hourOfDay < 12) return 'Mid-morning Snack';
  if (hourOfDay < 14) return 'Lunch';
  if (hourOfDay < 17) return 'Afternoon Snack';
  if (hourOfDay < 21) return 'Dinner';
  return 'Evening Snack';
}

function findClosestBg(bgData: BgSample[], targetMs: number, windowMs: number): BgSample | null {
  let best: BgSample | null = null;
  let bestDist = Infinity;

  for (const s of bgData) {
    const dist = Math.abs(s.date - targetMs);
    if (dist <= windowMs && dist < bestDist) {
      best = s;
      bestDist = dist;
    }
  }
  return best;
}

function findPeakBg(bgData: BgSample[], startMs: number, endMs: number): BgSample | null {
  let peak: BgSample | null = null;
  for (const s of bgData) {
    if (s.date >= startMs && s.date <= endMs) {
      if (!peak || s.sgv > peak.sgv) {
        peak = s;
      }
    }
  }
  return peak;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useMealSegments(params: {
  bgData: BgSample[];
  insulinData: InsulinDataEntry[];
  carbTreatments: FoodItemDTO[];
  foodItems: FoodItemDTO[];
}): MealSegment[] {
  const {bgData, insulinData, carbTreatments, foodItems} = params;

  return useMemo(() => {
    const events = buildEventsFromTreatments(insulinData, carbTreatments, foodItems);
    if (!events.length) return [];

    const clusters = clusterEvents(events);

    // Track labels to differentiate duplicate time blocks (e.g., two lunches)
    const labelCounts: Record<string, number> = {};

    return clusters.map((cluster): MealSegment => {
      const startMs = cluster[0].timestampMs;
      const endMs = cluster[cluster.length - 1].timestampMs;
      const startDate = new Date(startMs);
      const hour = startDate.getHours();

      let label = labelForTime(hour);
      labelCounts[label] = (labelCounts[label] || 0) + 1;
      if (labelCounts[label] > 1) {
        label = `${label} #${labelCounts[label]}`;
      }

      const totalCarbs = cluster.reduce((sum, e) => sum + e.carbs, 0);
      const totalBolus = cluster.reduce((sum, e) => sum + e.bolus, 0);
      const bolusCount = cluster.filter(e => e.bolus > 0).length;
      const foodNames = cluster
        .map(e => e.foodName)
        .filter((n): n is string => !!n);
      const mealIds = cluster
        .map(e => e.sourceId)
        .filter((id): id is string => !!id);

      // BG context
      const bgBeforeSample = findClosestBg(bgData, startMs, LOOKBACK_MS);
      const postMealEndMs = startMs + POST_MEAL_WINDOW_MS;
      const peakSample = findPeakBg(bgData, startMs, postMealEndMs);
      const bgAfterSample = findClosestBg(bgData, postMealEndMs, LOOKBACK_MS);
      const postMealSamples = bgData.filter(s => s.date >= startMs && s.date <= postMealEndMs);
      const postMealTirPct = postMealSamples.length
        ? Math.round(
            (postMealSamples.filter(s => s.sgv >= 70 && s.sgv <= 180).length / postMealSamples.length) *
              100,
          )
        : null;
      const postMealLowPct = postMealSamples.length
        ? Math.round((postMealSamples.filter(s => s.sgv < 70).length / postMealSamples.length) * 100)
        : null;
      const postMealHighPct = postMealSamples.length
        ? Math.round((postMealSamples.filter(s => s.sgv > 180).length / postMealSamples.length) * 100)
        : null;

      // Carb absorption (uses enriched BG samples with COB from device status)
      const absorption = totalCarbs > 0
        ? computeAbsorption(totalCarbs, bgData, startMs)
        : {absorbed: null, absorptionPct: null, cobRemaining: null};

      return {
        id: `meal-${startMs}`,
        startMs,
        endMs,
        label,
        totalCarbs,
        totalBolus,
        bolusCount,
        bgBefore: bgBeforeSample?.sgv ?? null,
        bgPeak: peakSample?.sgv ?? null,
        bgAfter: bgAfterSample?.sgv ?? null,
        timeToPeakMin: peakSample && bgBeforeSample
          ? Math.round((peakSample.date - startMs) / 60_000)
          : null,
        postMealTirPct,
        postMealLowPct,
        postMealHighPct,
        foodNames,
        absorbed: absorption.absorbed,
        absorptionPct: absorption.absorptionPct,
        cobRemaining: absorption.cobRemaining,
        mealIds,
        tags: [], // Tags are loaded asynchronously via useMealTags hook
      };
    });
  }, [bgData, insulinData, carbTreatments, foodItems]);
}
