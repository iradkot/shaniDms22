// /Users/iradkotton/projects/shaniDms22/src/containers/MainTabsNavigator/Containers/Trends/trendsCalculations.ts

import { BgSample } from 'app/types/day_bgs.types';
import { format } from 'date-fns';

const SERIOUS_HYPO_THRESHOLD = 56;
const SERIOUS_HYPER_THRESHOLD = 220;
const LOW_THRESHOLD = 70;
const HIGH_THRESHOLD = 180;

export interface DayDetail {
  dateString: string;
  avg: number;
  tir: number;
  seriousHypos: number;
  seriousHypers: number;
  morningAvg: number;
  middayAvg: number;
  afternoonAvg: number;
  eveningAvg: number;
  minBg: number;
  maxBg: number;
  timeInRange: number;      // Percentage of time in range (70-180 mg/dL)
  timeBelowRange: number;   // Percentage of time below 70 mg/dL
  timeAboveRange: number;   // Percentage of time above 180 mg/dL
  samples: BgSample[];
}

export function calculateTrendsMetrics(bgData: BgSample[]) {
  if (bgData.length === 0) {
    return { ...emptyMetrics(), dailyDetails: [] };
  }

  const chronData = [...bgData].sort((a, b) => a.date - b.date);

  const allValues = chronData.map(d => d.sgv).sort((a, b) => a - b);
  const mean = avg(allValues);
  const stdDev = calcStdDev(allValues, mean);

  const morningValues = filterByHour(chronData, 0, 6);
  const middayValues = filterByHour(chronData, 6, 12);
  const afternoonValues = filterByHour(chronData, 12, 18);
  const eveningValues = filterByHour(chronData, 18, 24);

  const morningAvg = morningValues.length > 0 ? avg(morningValues) : mean;
  const middayAvg = middayValues.length > 0 ? avg(middayValues) : mean;
  const afternoonAvg = afternoonValues.length > 0 ? avg(afternoonValues) : mean;
  const eveningAvg = eveningValues.length > 0 ? avg(eveningValues) : mean;

  const { seriousHypoEvents, seriousHyperEvents } = countSeriousEvents(chronData);

  const totalCount = allValues.length;
  const inRangeCount = allValues.filter(v => v >= LOW_THRESHOLD && v <= HIGH_THRESHOLD).length;
  const tir = totalCount > 0 ? inRangeCount / totalCount : 0;

  const dailyMap: Record<string, BgSample[]> = {};
  chronData.forEach(s => {
    const dayStr = format(new Date(s.date), 'yyyy-MM-dd');
    if (!dailyMap[dayStr]) dailyMap[dayStr] = [];
    dailyMap[dayStr].push(s);
  });

  const dailyDetails = Object.entries(dailyMap).map(([day, samples]) => {
    const vals = samples.map(s => s.sgv);
    const dMean = avg(vals);
    const inRange = vals.filter(v => v >= LOW_THRESHOLD && v <= HIGH_THRESHOLD).length;
    const dInRange = vals.length > 0 ? inRange / vals.length : 0;
    const { seriousHypoEvents: dayHypoEvents, seriousHyperEvents: dayHyperEvents } = countSeriousEvents(samples);

    const dMorning = filterValuesByTime(samples, 0, 6);
    const dMidday = filterValuesByTime(samples, 6, 12);
    const dAfternoon = filterValuesByTime(samples, 12, 18);
    const dEvening = filterValuesByTime(samples, 18, 24);

    // Calculate additional stats with safeguards
    const minBg = vals.length > 0 ? Math.min(...vals) : 0;
    const maxBg = vals.length > 0 ? Math.max(...vals) : 0;
    const timeInRange = vals.length > 0 ? (inRange / vals.length) * 100 : 0;
    const timeBelowRange = vals.length > 0 ? (vals.filter(v => v < LOW_THRESHOLD).length / vals.length) * 100 : 0;
    const timeAboveRange = vals.length > 0 ? (vals.filter(v => v > HIGH_THRESHOLD).length / vals.length) * 100 : 0;

    return {
      dateString: day,
      avg: dMean,
      tir: dInRange,
      seriousHypos: dayHypoEvents,
      seriousHypers: dayHyperEvents,
      morningAvg: dMorning.length > 0 ? avg(dMorning) : dMean,
      middayAvg: dMidday.length > 0 ? avg(dMidday) : dMean,
      afternoonAvg: dAfternoon.length > 0 ? avg(dAfternoon) : dMean,
      eveningAvg: dEvening.length > 0 ? avg(dEvening) : dMean,
      minBg,
      maxBg,
      timeInRange,
      timeBelowRange,
      timeAboveRange,
      samples,
    };
  });

  return {
    averageBg: mean,
    stdDev,
    morningAvg,
    middayAvg,
    afternoonAvg,
    eveningAvg,
    seriousHyposCount: seriousHypoEvents,
    seriousHypersCount: seriousHyperEvents,
    tir,
    dailyDetails
  };
}

function countSeriousEvents(samples: BgSample[]) {
  let inHypo = false;
  let inHyper = false;
  let hypoEvents = 0;
  let hyperEvents = 0;

  for (let i = 0; i < samples.length; i++) {
    const sgv = samples[i].sgv;
    if (sgv < SERIOUS_HYPO_THRESHOLD && !inHypo) inHypo = true;
    else if (sgv >= SERIOUS_HYPO_THRESHOLD && inHypo) { hypoEvents++; inHypo = false; }

    if (sgv > SERIOUS_HYPER_THRESHOLD && !inHyper) inHyper = true;
    else if (sgv <= SERIOUS_HYPER_THRESHOLD && inHyper) { hyperEvents++; inHyper = false; }
  }

  return { seriousHypoEvents: hypoEvents, seriousHyperEvents: hyperEvents };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcStdDev(arr: number[], mean: number): number {
  if (arr.length <= 1) return 0;
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function filterByHour(bgData: BgSample[], startH: number, endH: number): number[] {
  return bgData.filter(d => {
    const h = new Date(d.date).getHours();
    return h >= startH && h < endH;
  }).map(d => d.sgv);
}

function filterValuesByTime(samples: BgSample[], startH: number, endH: number): number[] {
  return samples.filter(d => {
    const h = new Date(d.date).getHours();
    return h >= startH && h < endH;
  }).map(d => d.sgv);
}

function emptyMetrics() {
  return {
    averageBg: 0,
    stdDev: 0,
    morningAvg: 0,
    middayAvg: 0,
    afternoonAvg: 0,
    eveningAvg: 0,
    seriousHyposCount: 0,
    seriousHypersCount: 0,
    tir: 0,
    dailyDetails: [] as DayDetail[],
  };
}
