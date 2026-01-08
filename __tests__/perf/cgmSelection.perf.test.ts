import {performance} from 'perf_hooks';

import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {FoodItemDTO} from 'app/types/food.types';

import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {findBolusEventsInTooltipWindow, findClosestBolus} from 'app/components/charts/CgmGraph/utils/bolusUtils';
import {findCarbEventsInTooltipWindow, findClosestCarbEvent} from 'app/components/charts/CgmGraph/utils/carbsUtils';

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
      direction: 'Flat' as any,
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
      type: 'bolus' as any,
      timestamp: new Date(t).toISOString(),
      amount: 0.5 + ((i % 20) * 0.1),
    } as any);
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
    } as any);
  }

  return items;
}

function bench(label: string, fn: () => void) {
  const t0 = performance.now();
  fn();
  const t1 = performance.now();
  // eslint-disable-next-line no-console
  console.log(`${label}: ${(t1 - t0).toFixed(2)}ms`);
}

/**
 * This is an observational micro-benchmark (not a strict perf gate).
 * Run with: `yarn perf:cgm-selection`
 */
describe('perf: CGM selection + tooltip windowing', () => {
  it('benchmarks selection helpers on realistic-ish inputs', () => {
    const now = Date.now();
    const startTimeMs = now - 24 * 60 * 60_000;

    const bgSamples = makeBgSamples({
      startTimeMs,
      minutesBetweenSamples: 5,
      count: 288,
    });

    const endTimeMs = bgSamples[bgSamples.length - 1].date;

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

    // Sweep touch across the domain.
    const touches = 750;
    const touchTimes = Array.from({length: touches}, (_, i) =>
      startTimeMs + Math.floor(((endTimeMs - startTimeMs) * i) / touches),
    );

    let bgHits = 0;
    bench('findClosestBgSample (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = findClosestBgSample(t, bgSamples);
        if (found) bgHits++;
      }
    });
    expect(bgHits).toBe(touches);

    let bolusHits = 0;
    bench('findClosestBolus (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = findClosestBolus(t, insulinData);
        if (found) bolusHits++;
      }
    });
    expect(bolusHits).toBeGreaterThan(0);

    let carbHits = 0;
    bench('findClosestCarbEvent (touch sweep)', () => {
      for (const t of touchTimes) {
        const found = findClosestCarbEvent(t, foodItems);
        if (found) carbHits++;
      }
    });
    expect(carbHits).toBeGreaterThan(0);

    bench('findBolusEventsInTooltipWindow (anchored)', () => {
      for (const t of touchTimes) {
        findBolusEventsInTooltipWindow({anchorTimeMs: t, insulinData});
      }
    });

    bench('findCarbEventsInTooltipWindow (anchored)', () => {
      for (const t of touchTimes) {
        findCarbEventsInTooltipWindow({anchorTimeMs: t, foodItems});
      }
    });
  });
});
