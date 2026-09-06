import {buildDayGraph} from '../src/modules/dayGraph';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_START_MS = new Date(2026, 8, 3).getTime();
const DAY_END_MS = DAY_START_MS + 24 * HOUR_MS;

const directionForDelta = (delta: number): string => {
  if (delta > 4) {
    return 'SingleUp';
  }
  if (delta > 1) {
    return 'FortyFiveUp';
  }
  if (delta < -4) {
    return 'SingleDown';
  }
  if (delta < -1) {
    return 'FortyFiveDown';
  }
  return 'Flat';
};

const glucoseAt = (hour: number): number => {
  const circadian = Math.sin((hour / 24) * Math.PI * 2) * 12;
  const breakfast = Math.max(0, 65 - Math.abs(hour - 8.5) * 38);
  const lunch = Math.max(0, 48 - Math.abs(hour - 13.5) * 30);
  const dinner = Math.max(0, 72 - Math.abs(hour - 19.5) * 34);
  return Math.round(105 + circadian + breakfast + lunch + dinner);
};

const activeAmount = (
  hour: number,
  eventHour: number,
  amount: number,
  durationHours: number,
): number => {
  const elapsed = hour - eventHour;
  return elapsed >= 0 && elapsed <= durationHours
    ? amount * (1 - elapsed / durationHours)
    : 0;
};

const previewModel = buildDayGraph({
  period: {dayStartMs: DAY_START_MS, dayEndMs: DAY_END_MS},
  expectedSampleIntervalMs: 5 * MINUTE_MS,
  glucoseSamples: Array.from({length: 288}, (_, index) => {
    const timestampMs = DAY_START_MS + index * 5 * MINUTE_MS;
    const hour = index / 12;
    const valueMgDl = glucoseAt(hour);
    const previousValue = glucoseAt(Math.max(0, hour - 5 / 60));
    return {
      identity: {sourceId: 'preview', recordId: `glucose-${index}`},
      timestampMs,
      valueMgDl,
      direction: directionForDelta(valueMgDl - previousValue),
      device: 'Development fixture',
    };
  }),
  activeLoadSamples: Array.from({length: 288}, (_, index) => {
    const timestampMs = DAY_START_MS + index * 5 * MINUTE_MS;
    const hour = index / 12;
    const bolusIobUnits =
      activeAmount(hour, 8, 4.2, 4) +
      activeAmount(hour, 13, 3.1, 4) +
      activeAmount(hour, 19, 5.3, 4);
    const basalIobUnits = 0.35 + Math.sin((hour / 24) * Math.PI * 4) * 0.2;
    const cobGrams =
      activeAmount(hour, 8.25, 42, 3) +
      activeAmount(hour, 13.25, 58, 3.5) +
      activeAmount(hour, 19.25, 68, 4);
    return {
      timestampMs,
      iobUnits: bolusIobUnits + basalIobUnits,
      bolusIobUnits,
      basalIobUnits,
      cobGrams,
    };
  }),
  timelineItems: [
    {hour: 8.25, grams: 42, name: 'Breakfast'},
    {hour: 13.25, grams: 58, name: 'Lunch'},
    {hour: 19.25, grams: 68, name: 'Dinner'},
  ].map((meal, index) => ({
    kind: 'journal-meal' as const,
    identity: {sourceId: 'preview', recordId: `meal-${index}`},
    sourceLabel: 'Journal',
    timestampMs: DAY_START_MS + meal.hour * HOUR_MS,
    title: meal.name,
    detail: `${meal.grams} g`,
    carbohydratesGrams: meal.grams,
  })),
  insulinEvents: [
    {kind: 'bolus', timestampMs: DAY_START_MS + 8 * HOUR_MS, units: 4.2},
    {kind: 'bolus', timestampMs: DAY_START_MS + 13 * HOUR_MS, units: 3.1},
    {kind: 'bolus', timestampMs: DAY_START_MS + 19 * HOUR_MS, units: 5.3},
    {
      kind: 'temp-basal',
      startMs: DAY_START_MS + 15 * HOUR_MS,
      endMs: DAY_START_MS + 16.5 * HOUR_MS,
      rateUnitsPerHour: 0.35,
    },
  ],
  basalSchedule: [
    {secondsFromMidnight: 0, rateUnitsPerHour: 0.72},
    {secondsFromMidnight: 6 * 3600, rateUnitsPerHour: 0.9},
    {secondsFromMidnight: 12 * 3600, rateUnitsPerHour: 0.78},
    {secondsFromMidnight: 18 * 3600, rateUnitsPerHour: 0.84},
  ],
});


export {MINUTE_MS, HOUR_MS, DAY_START_MS, DAY_END_MS, previewModel};
