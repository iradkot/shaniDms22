// /Trends/utils/trendsCalculations.ts

import { BgSample } from 'app/types/day_bgs.types';
import { format } from 'date-fns';
import { cgmRange, CGM_STATUS_CODES } from 'app/constants/PLAN_CONFIG';
import {calculateTimeInRangePercentages} from 'app/utils/glucose/timeInRange';

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
  timeInRange: number;
  timeBelowRange: number;
  timeAboveRange: number;
  samples: BgSample[];
}

export function calculateTrendsMetrics(bgData: BgSample[]) {
  if (bgData.length === 0) {
    return { ...emptyMetrics(), dailyDetails: [] };
  }

  // Read thresholds dynamically (they can be user-configured in Settings).
  const LOW_THRESHOLD = cgmRange.TARGET.min;
  const HIGH_THRESHOLD = cgmRange.TARGET.max;
  const VERY_LOW_THRESHOLD = cgmRange[CGM_STATUS_CODES.VERY_LOW] as number;
  const VERY_HIGH_THRESHOLD = cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number;
  const SERIOUS_HYPO_THRESHOLD = cgmRange[CGM_STATUS_CODES.SERIOUS_LOW] as number;
  const SERIOUS_HYPER_THRESHOLD =
    cgmRange[CGM_STATUS_CODES.SERIOUS_HIGH] as number;

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

  const { seriousHypoEvents, seriousHyperEvents } = countSeriousEvents(
    chronData,
    SERIOUS_HYPO_THRESHOLD,
    SERIOUS_HYPER_THRESHOLD,
  );

  const {percentages: overallTirPct, validCount: overallValidCount} =
    calculateTimeInRangePercentages(chronData, {
      veryLowMax: VERY_LOW_THRESHOLD,
      targetMin: LOW_THRESHOLD,
      targetMax: HIGH_THRESHOLD,
      highMax: VERY_HIGH_THRESHOLD,
    });

  const tir = overallValidCount > 0 ? overallTirPct.target / 100 : 0;

  const dailyMap: Record<string, BgSample[]> = {};
  chronData.forEach(s => {
    const dayStr = format(new Date(s.date), 'yyyy-MM-dd');
    if (!dailyMap[dayStr]) dailyMap[dayStr] = [];
    dailyMap[dayStr].push(s);
  });

  const dailyDetails = Object.entries(dailyMap).map(([day, samples]) => {
    const vals = samples.map(s => s.sgv);
    const dMean = avg(vals);

    const {percentages: dayTirPct, validCount: dayValidCount} =
      calculateTimeInRangePercentages(samples, {
        veryLowMax: VERY_LOW_THRESHOLD,
        targetMin: LOW_THRESHOLD,
        targetMax: HIGH_THRESHOLD,
        highMax: VERY_HIGH_THRESHOLD,
      });

    const dInRange = dayValidCount > 0 ? dayTirPct.target / 100 : 0;

    const { seriousHypoEvents: dayHypoEvents, seriousHyperEvents: dayHyperEvents } =
      countSeriousEvents(samples, SERIOUS_HYPO_THRESHOLD, SERIOUS_HYPER_THRESHOLD);

    const dMorning = filterValuesByTime(samples, 0, 6);
    const dMidday = filterValuesByTime(samples, 6, 12);
    const dAfternoon = filterValuesByTime(samples, 12, 18);
    const dEvening = filterValuesByTime(samples, 18, 24);

    const minBg = vals.length > 0 ? Math.min(...vals) : 0;
    const maxBg = vals.length > 0 ? Math.max(...vals) : 0;
    const timeInRange = dayTirPct.target;
    const timeBelowRange = dayTirPct.veryLow + dayTirPct.low;
    const timeAboveRange = dayTirPct.high + dayTirPct.veryHigh;

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

function countSeriousEvents(
  samples: BgSample[],
  seriousHypoThreshold: number,
  seriousHyperThreshold: number,
) {
  let inHypo = false;
  let inHyper = false;
  let hypoEvents = 0;
  let hyperEvents = 0;

  for (let i = 0; i < samples.length; i++) {
    const sgv = samples[i].sgv;
    // Check for serious hypo
    if (sgv < seriousHypoThreshold && !inHypo) {
      inHypo = true;
    } else if (sgv >= seriousHypoThreshold && inHypo) {
      hypoEvents++;
      inHypo = false;
    }

    // Check for serious hyper
    if (sgv > seriousHyperThreshold && !inHyper) {
      inHyper = true;
    } else if (sgv <= seriousHyperThreshold && inHyper) {
      hyperEvents++;
      inHyper = false;
    }
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
  return bgData
    .filter(d => {
      const h = new Date(d.date).getHours();
      return h >= startH && h < endH;
    })
    .map(d => d.sgv);
}

function filterValuesByTime(samples: BgSample[], startH: number, endH: number): number[] {
  return samples
    .filter(d => {
      const h = new Date(d.date).getHours();
      return h >= startH && h < endH;
    })
    .map(d => d.sgv);
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
