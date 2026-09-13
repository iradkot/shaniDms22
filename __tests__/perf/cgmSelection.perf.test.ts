import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {FoodItemDTO} from 'app/types/food.types';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {
  createBolusTooltipIndex,
  createCarbTooltipIndex,
} from 'app/components/charts/CgmGraph/utils/tooltipEventIndex';
import {
  BOLUS_HOVER_CONFIG,
  BOLUS_MAX_FOCUS_PROXIMITY_MS,
  BOLUS_TOOLTIP_WINDOW_MS,
} from 'app/components/charts/CgmGraph/constants/bolusHoverConfig';

function makeBgSamples(params: {
  startTimeMs: number;
  minutesBetweenSamples: number;
  count: number;
}): BgSample[] {
  const {startTimeMs, minutesBetweenSamples, count} = params;
  const samples: BgSample[] = [];

  for (let i = 0; i < count; i++) {
    const date = startTimeMs + i * minutesBetweenSamples * 60_000;
    const sgv = 80 + ((i * 7) % 120);
    samples.push({
      sgv,
      date,
      dateString: new Date(date).toISOString(),
      trend: 0,
      direction: 'Flat',
      device: 'sim',
      type: 'sgv',
    });
  }

  return samples;
}

function makeBoluses(params: {
  startTimeMs: number;
  endTimeMs: number;
  count: number;
}): InsulinDataEntry[] {
  const {startTimeMs, endTimeMs, count} = params;
  const span = Math.max(1, endTimeMs - startTimeMs);

  const boluses: InsulinDataEntry[] = [];
  for (let i = 0; i < count; i++) {
    const t = startTimeMs + Math.floor((span * i) / count);
    boluses.push({
      type: 'bolus',
      timestamp: new Date(t).toISOString(),
      amount: 0.5 + (i % 20) * 0.1,
    });
  }

  return boluses;
}

function makeCarbs(params: {
  startTimeMs: number;
  endTimeMs: number;
  count: number;
}): FoodItemDTO[] {
  const {startTimeMs, endTimeMs, count} = params;
  const span = Math.max(1, endTimeMs - startTimeMs);

  const items: FoodItemDTO[] = [];
  for (let i = 0; i < count; i++) {
    const t = startTimeMs + Math.floor((span * i) / count);
    items.push({
      id: `carb-${i}`,
      name: 'sim',
      carbs: 10 + (i % 50),
      timestamp: t,
      image: '',
      notes: '',
      score: 0,
    });
  }

  return items;
}

function bench<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  console.log(`${label}: ${(t1 - t0).toFixed(2)}ms`);
  return result;
}

/**
 * This is an observational micro-benchmark (not a strict perf gate).
 * Run with: `yarn perf:cgm-selection`
 */
describe('perf: CGM selection + tooltip windowing', () => {
  it('benchmarks selection helpers on realistic-ish inputs', () => {
    const now = Date.parse('2026-09-13T00:00:00Z');
    const startTimeMs = now - 24 * 60 * 60_000;

    const bgSamples = makeBgSamples({
      startTimeMs,
      minutesBetweenSamples: 5,
      count: 288,
    });

    const endTimeMs = bgSamples[bgSamples.length - 1]!.date;

    const insulinData = makeBoluses({
      startTimeMs,
      endTimeMs,
      count: 250,
    });

    const foodItems = makeCarbs({
      startTimeMs,
      endTimeMs,
      count: 120,
    });

    // Match production: prepare immutable sources once, query them on moves.
    // Timings for preparation stay separate from the touch-sweep measurements.
    const bolusIndex = bench('prepare bolus tooltip index', () =>
      createBolusTooltipIndex(insulinData),
    );
    const carbIndex = bench('prepare carb tooltip index', () =>
      createCarbTooltipIndex(foodItems),
    );

    // Sweep touch across the domain.
    const touches = 750;
    const touchTimes = Array.from(
      {length: touches},
      (_, i) =>
        startTimeMs + Math.floor(((endTimeMs - startTimeMs) * i) / touches),
    );

    let bgHits = 0;
    bench('findClosestBgSample (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = findClosestBgSample(t, bgSamples);
        if (found) {
          bgHits++;
        }
      }
    });
    expect(bgHits).toBe(touches);

    let bolusHits = 0;
    bench('bolus index closestTime (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = bolusIndex.closestTime(t, BOLUS_MAX_FOCUS_PROXIMITY_MS);
        if (found != null) {
          bolusHits++;
        }
      }
    });
    expect(bolusHits).toBeGreaterThan(0);

    let carbHits = 0;
    bench('carb index closestTime (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = carbIndex.closestTime(t, BOLUS_MAX_FOCUS_PROXIMITY_MS);
        if (found != null) {
          carbHits++;
        }
      }
    });
    expect(carbHits).toBeGreaterThan(0);

    let bolusMatches = 0;
    bench('bolus index within (anchored)', () => {
      for (const t of touchTimes) {
        bolusMatches += bolusIndex.within(
          t,
          BOLUS_TOOLTIP_WINDOW_MS,
          BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
        ).length;
      }
    });
    expect(bolusMatches).toBeGreaterThan(0);
    expect(bolusMatches).toBeLessThanOrEqual(
      touchTimes.length * BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
    );

    let carbMatches = 0;
    bench('carb index within (anchored)', () => {
      for (const t of touchTimes) {
        carbMatches += carbIndex.within(
          t,
          BOLUS_TOOLTIP_WINDOW_MS,
          BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
        ).length;
      }
    });
    expect(carbMatches).toBeGreaterThan(0);
    expect(carbMatches).toBeLessThanOrEqual(
      touchTimes.length * BOLUS_HOVER_CONFIG.maxBolusEventsInTooltip,
    );
  });
});
