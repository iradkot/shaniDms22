import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {BgSample} from 'app/types/day_bgs.types';
import {ProfileDataType, TimeValueEntry} from 'app/types/insulin.types';
import {
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

import {
  AgpComparisonEvidence,
  AgpComparisonPeriodKey,
  AgpCorrectionComparison,
  AgpMealComparison,
  AgpMealEvent,
  AgpPeriodEvidence,
  AgpSegmentComparison,
  AgpSegmentStats,
  AgpSettingsValueDiff,
  AgpTimeWindow,
} from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPECTED_READINGS_PER_DAY = 288;
const MIN_SEGMENT_SAMPLES = 6;
const LOW_THRESHOLD = cgmRange.TARGET.min;
const HIGH_THRESHOLD = cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number;
const SEVERE_HIGH_THRESHOLD = cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] as number;

export const AGP_COMPARISON_WINDOWS: AgpTimeWindow[] = [
  {
    key: 'overnight',
    labelHe: 'לילה',
    labelEn: 'Overnight',
    startMinute: 0,
    endMinute: 360,
  },
  {
    key: 'morning',
    labelHe: 'בוקר מוקדם',
    labelEn: 'Early morning',
    startMinute: 360,
    endMinute: 600,
  },
  {
    key: 'breakfast',
    labelHe: 'אחרי ארוחת בוקר',
    labelEn: 'After breakfast',
    startMinute: 600,
    endMinute: 720,
  },
  {
    key: 'midday',
    labelHe: 'צהריים',
    labelEn: 'Midday',
    startMinute: 720,
    endMinute: 960,
  },
  {
    key: 'afternoon',
    labelHe: 'אחר הצהריים',
    labelEn: 'Afternoon',
    startMinute: 960,
    endMinute: 1080,
  },
  {
    key: 'evening',
    labelHe: 'ערב',
    labelEn: 'Evening',
    startMinute: 1080,
    endMinute: 1320,
  },
  {
    key: 'bedtime',
    labelHe: 'לפני שינה',
    labelEn: 'Bedtime',
    startMinute: 1320,
    endMinute: 1440,
  },
];

export type BuildComparisonEvidenceParams = {
  currentRange: {start: Date; end: Date};
  previousRange: {start: Date; end: Date};
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentTreatments?: unknown[];
  previousTreatments?: unknown[];
  currentProfile?: ProfileDataType | null;
  previousProfile?: ProfileDataType | null;
};

export function buildAgpComparisonEvidence(
  params: BuildComparisonEvidenceParams,
): AgpComparisonEvidence {
  const current = buildPeriodEvidence(
    'current',
    params.currentRange,
    params.currentBgData,
  );
  const previous = buildPeriodEvidence(
    'previous',
    params.previousRange,
    params.previousBgData,
  );

  const segments = AGP_COMPARISON_WINDOWS.map(window =>
    compareSegment(window, current.bgSamples, previous.bgSamples),
  ).sort((a, b) => b.significanceScore - a.significanceScore);

  const meals = buildMealComparisons({
    currentBgData: current.bgSamples,
    previousBgData: previous.bgSamples,
    currentTreatments: params.currentTreatments ?? [],
    previousTreatments: params.previousTreatments ?? [],
  });

  const corrections = buildCorrectionComparison({
    currentBgData: current.bgSamples,
    previousBgData: previous.bgSamples,
    currentTreatments: params.currentTreatments ?? [],
    previousTreatments: params.previousTreatments ?? [],
  });

  return {
    current,
    previous,
    segments,
    meals,
    corrections,
    settingsDiffs: buildSettingsDiffs({
      currentProfile: params.currentProfile ?? null,
      previousProfile: params.previousProfile ?? null,
    }),
    dataQuality: buildDataQuality(current, previous),
  };
}

function buildPeriodEvidence(
  key: AgpComparisonPeriodKey,
  range: {start: Date; end: Date},
  samples: BgSample[],
): AgpPeriodEvidence {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const bgSamples = validSamples(samples).filter(
    s => s.date >= startMs && s.date <= endMs,
  );

  return {
    key,
    range: {startMs, endMs},
    bgSamples,
    sampleCount: bgSamples.length,
    daysWithData: countDaysWithData(bgSamples),
  };
}

function compareSegment(
  window: AgpTimeWindow,
  currentSamples: BgSample[],
  previousSamples: BgSample[],
): AgpSegmentComparison {
  const current = buildSegmentStats(window, currentSamples);
  const previous = buildSegmentStats(window, previousSamples);
  const deltas = {
    tirPct: diffNullable(current.tirPct, previous.tirPct),
    averageBg: diffNullable(current.averageBg, previous.averageBg),
    medianBg: diffNullable(current.medianBg, previous.medianBg),
    lowPct: diffNullable(current.lowPct, previous.lowPct),
    highPct: diffNullable(current.highPct, previous.highPct),
    variabilityBand: diffNullable(
      current.variabilityBand,
      previous.variabilityBand,
    ),
  };

  return {
    key: window.key,
    labelHe: window.labelHe,
    labelEn: window.labelEn,
    current,
    previous,
    deltas,
    significanceScore: scoreSegmentChange(deltas),
  };
}

function buildSegmentStats(
  window: AgpTimeWindow,
  samples: BgSample[],
): AgpSegmentStats {
  const segmentSamples = samplesForWindow(
    samples,
    window.startMinute,
    window.endMinute,
  );
  const values = segmentSamples.map(s => s.sgv).sort((a, b) => a - b);

  if (values.length < MIN_SEGMENT_SAMPLES) {
    return {
      ...window,
      sampleCount: values.length,
      tirPct: null,
      lowPct: null,
      highPct: null,
      averageBg: null,
      medianBg: null,
      p10: null,
      p25: null,
      p75: null,
      p90: null,
      variabilityBand: null,
    };
  }

  const p10 = percentile(values, 10) ?? 0;
  const p25 = percentile(values, 25) ?? 0;
  const p75 = percentile(values, 75) ?? 0;
  const p90 = percentile(values, 90) ?? 0;

  return {
    ...window,
    sampleCount: values.length,
    tirPct: pct(
      values.filter(v => v >= LOW_THRESHOLD && v <= HIGH_THRESHOLD).length,
      values.length,
    ),
    lowPct: pct(values.filter(v => v < LOW_THRESHOLD).length, values.length),
    highPct: pct(values.filter(v => v > HIGH_THRESHOLD).length, values.length),
    averageBg: avg(values),
    medianBg: percentile(values, 50),
    p10,
    p25,
    p75,
    p90,
    variabilityBand: p90 - p10,
  };
}

function buildMealComparisons(params: {
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentTreatments: unknown[];
  previousTreatments: unknown[];
}): AgpMealComparison[] {
  const currentMeals = buildMealEvents(
    params.currentBgData,
    params.currentTreatments,
  );
  const previousMeals = buildMealEvents(
    params.previousBgData,
    params.previousTreatments,
  );

  return (['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mealType => {
    const current = currentMeals.filter(m => m.mealType === mealType);
    const previous = previousMeals.filter(m => m.mealType === mealType);
    return {
      mealType,
      currentCount: current.length,
      previousCount: previous.length,
      currentAvgRise: avgNullable(current.map(m => m.riseMgdl)),
      previousAvgRise: avgNullable(previous.map(m => m.riseMgdl)),
      currentAvgPeak: avgNullable(current.map(m => m.peakBg)),
      previousAvgPeak: avgNullable(previous.map(m => m.peakBg)),
      currentAvgCarbs: avgNullable(current.map(m => m.carbsG)),
      previousAvgCarbs: avgNullable(previous.map(m => m.carbsG)),
      currentAvgBolusMinutesBefore: avgNullable(
        current.map(m =>
          m.minutesFromBolusToCarbs == null ? null : -m.minutesFromBolusToCarbs,
        ),
      ),
      previousAvgBolusMinutesBefore: avgNullable(
        previous.map(m =>
          m.minutesFromBolusToCarbs == null ? null : -m.minutesFromBolusToCarbs,
        ),
      ),
      examples: current.slice(0, 3),
    };
  });
}

function buildMealEvents(
  bgSamples: BgSample[],
  treatments: unknown[],
): AgpMealEvent[] {
  const carbItems = mapNightscoutTreatmentsToCarbFoodItems(treatments as any[]);
  const insulinEntries = mapNightscoutTreatmentsToInsulinDataEntries(
    treatments as any[],
  );
  const boluses = insulinEntries
    .filter(entry => entry.type === 'bolus' && typeof entry.amount === 'number')
    .map(entry => ({
      ts: entry.timestamp ? Date.parse(entry.timestamp) : NaN,
      amount: entry.amount ?? 0,
    }))
    .filter(b => Number.isFinite(b.ts) && b.amount > 0);

  return carbItems
    .map(item => {
      const mealTime = item.timestamp;
      const relatedBoluses = boluses.filter(
        b => b.ts >= mealTime - 90 * 60_000 && b.ts <= mealTime + 30 * 60_000,
      );
      const nearestBolus = relatedBoluses.sort(
        (a, b) => Math.abs(a.ts - mealTime) - Math.abs(b.ts - mealTime),
      )[0];
      const bgAtMeal = nearestBg(bgSamples, mealTime);
      const postMeal = bgSamples.filter(
        s => s.date >= mealTime && s.date <= mealTime + 3 * 60 * 60_000,
      );
      const peakBg = postMeal.length
        ? Math.max(...postMeal.map(s => s.sgv))
        : null;
      const twoHourBg = nearestBg(bgSamples, mealTime + 2 * 60 * 60_000, 25);
      const threeHourBg = nearestBg(bgSamples, mealTime + 3 * 60 * 60_000, 25);

      return {
        timestamp: mealTime,
        mealType: classifyMeal(mealTime),
        carbsG: item.carbs,
        bolusU: nearestBolus?.amount ?? null,
        minutesFromBolusToCarbs: nearestBolus
          ? Math.round((nearestBolus.ts - mealTime) / 60_000)
          : null,
        bgAtMeal,
        peakBg,
        riseMgdl: bgAtMeal != null && peakBg != null ? peakBg - bgAtMeal : null,
        twoHourBg,
        returnedToTargetBy3h:
          threeHourBg == null ? null : threeHourBg <= HIGH_THRESHOLD,
      };
    })
    .filter(event => event.bgAtMeal != null || event.peakBg != null);
}

function buildCorrectionComparison(params: {
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentTreatments: unknown[];
  previousTreatments: unknown[];
}): AgpCorrectionComparison {
  const current = buildCorrectionEvents(
    params.currentBgData,
    params.currentTreatments,
  );
  const previous = buildCorrectionEvents(
    params.previousBgData,
    params.previousTreatments,
  );

  return {
    currentCount: current.length,
    previousCount: previous.length,
    currentAvgDrop3h: avgNullable(current.map(c => c.drop3h)),
    previousAvgDrop3h: avgNullable(previous.map(c => c.drop3h)),
    currentLowAfterCorrectionPct: eventPct(current, c => c.lowAfter),
    previousLowAfterCorrectionPct: eventPct(previous, c => c.lowAfter),
  };
}

function buildCorrectionEvents(bgSamples: BgSample[], treatments: unknown[]) {
  const carbItems = mapNightscoutTreatmentsToCarbFoodItems(treatments as any[]);
  const insulinEntries = mapNightscoutTreatmentsToInsulinDataEntries(
    treatments as any[],
  );
  return insulinEntries
    .filter(entry => entry.type === 'bolus' && typeof entry.amount === 'number')
    .map(entry => {
      const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
      return {ts, amount: entry.amount ?? 0};
    })
    .filter(b => Number.isFinite(b.ts) && b.amount > 0)
    .filter(b => {
      const nearbyCarbs = carbItems.some(
        c => Math.abs(c.timestamp - b.ts) <= 45 * 60_000,
      );
      return !nearbyCarbs;
    })
    .map(b => {
      const startBg = nearestBg(bgSamples, b.ts, 20);
      const endBg = nearestBg(bgSamples, b.ts + 3 * 60 * 60_000, 30);
      const post = bgSamples.filter(
        s => s.date >= b.ts && s.date <= b.ts + 3 * 60 * 60_000,
      );
      return {
        ts: b.ts,
        amount: b.amount,
        drop3h: startBg != null && endBg != null ? startBg - endBg : null,
        lowAfter: post.some(s => s.sgv < LOW_THRESHOLD),
      };
    });
}

function buildSettingsDiffs(params: {
  currentProfile: ProfileDataType | null;
  previousProfile: ProfileDataType | null;
}): AgpSettingsValueDiff[] {
  const current = extractDefaultProfile(params.currentProfile);
  const previous = extractDefaultProfile(params.previousProfile);
  if (!current || !previous) {
    return [];
  }

  const diffs: AgpSettingsValueDiff[] = [];
  const schedulePairs = [
    {
      setting: 'carbRatio' as const,
      field: 'carbratio',
      labelHe: 'יחס פחמימות',
      labelEn: 'Carb ratio',
    },
    {
      setting: 'isf' as const,
      field: 'sens',
      labelHe: 'רגישות לאינסולין',
      labelEn: 'Insulin sensitivity',
    },
    {
      setting: 'basal' as const,
      field: 'basal',
      labelHe: 'בזאל מתוכנן',
      labelEn: 'Scheduled basal',
    },
    {
      setting: 'targetLow' as const,
      field: 'target_low',
      labelHe: 'יעד תחתון',
      labelEn: 'Target low',
    },
    {
      setting: 'targetHigh' as const,
      field: 'target_high',
      labelHe: 'יעד עליון',
      labelEn: 'Target high',
    },
  ];

  for (const window of AGP_COMPARISON_WINDOWS) {
    const middle = midpointMinute(window);
    for (const pair of schedulePairs) {
      const currentValue = valueAtMinute(current[pair.field], middle);
      const previousValue = valueAtMinute(previous[pair.field], middle);
      const delta = diffNullable(currentValue, previousValue);
      if (delta == null || Math.abs(delta) < 0.01) {
        continue;
      }
      diffs.push({
        setting: pair.setting,
        windowKey: window.key,
        labelHe: `${pair.labelHe} - ${window.labelHe}`,
        labelEn: `${pair.labelEn} - ${window.labelEn}`,
        previous: previousValue,
        current: currentValue,
        delta,
      });
    }
  }

  const currentDia = finiteNumber(current.dia);
  const previousDia = finiteNumber(previous.dia);
  const diaDelta = diffNullable(currentDia, previousDia);
  if (diaDelta != null && Math.abs(diaDelta) >= 0.05) {
    diffs.push({
      setting: 'dia',
      labelHe: 'משך פעילות אינסולין',
      labelEn: 'Duration of insulin action',
      previous: previousDia,
      current: currentDia,
      delta: diaDelta,
    });
  }

  return diffs;
}

function extractDefaultProfile(
  profileData: ProfileDataType | null,
): any | null {
  const first = profileData?.[0] as any;
  const key = first?.defaultProfile;
  return key && first?.store?.[key] ? first.store[key] : null;
}

function valueAtMinute(schedule: unknown, minutes: number): number | null {
  const entries = Array.isArray(schedule) ? (schedule as TimeValueEntry[]) : [];
  const parsed = entries
    .map(entry => ({
      minute: parseScheduleMinute(entry.time),
      value: finiteNumber(entry.value),
    }))
    .filter(
      (entry): entry is {minute: number; value: number} =>
        entry.minute != null && entry.value != null,
    )
    .sort((a, b) => a.minute - b.minute);

  if (!parsed.length) {
    return null;
  }
  let active = parsed[parsed.length - 1];
  for (const entry of parsed) {
    if (entry.minute <= minutes) {
      active = entry;
    } else {
      break;
    }
  }
  return active.value;
}

function parseScheduleMinute(raw: unknown): number | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const timeOnly = raw.includes('T')
    ? raw.split('T')[1]?.slice(0, 5)
    : raw.slice(0, 5);
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOnly ?? '');
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : null;
}

function buildDataQuality(
  current: AgpPeriodEvidence,
  previous: AgpPeriodEvidence,
) {
  const currentDays = Math.max(
    1,
    (current.range.endMs - current.range.startMs) / MS_PER_DAY,
  );
  const previousDays = Math.max(
    1,
    (previous.range.endMs - previous.range.startMs) / MS_PER_DAY,
  );
  const currentCoveragePct = Math.min(
    100,
    (current.sampleCount / (currentDays * EXPECTED_READINGS_PER_DAY)) * 100,
  );
  const previousCoveragePct = Math.min(
    100,
    (previous.sampleCount / (previousDays * EXPECTED_READINGS_PER_DAY)) * 100,
  );
  const warnings: string[] = [];
  if (currentCoveragePct < 70) {
    warnings.push('Current period has limited CGM coverage.');
  }
  if (previousCoveragePct < 70) {
    warnings.push('Previous period has limited CGM coverage.');
  }
  return {currentCoveragePct, previousCoveragePct, warnings};
}

function validSamples(samples: BgSample[]) {
  return (samples ?? []).filter(
    s =>
      typeof s?.date === 'number' &&
      typeof s?.sgv === 'number' &&
      Number.isFinite(s.date) &&
      Number.isFinite(s.sgv) &&
      s.sgv > 20 &&
      s.sgv < 600,
  );
}

function samplesForWindow(
  samples: BgSample[],
  startMinute: number,
  endMinute: number,
) {
  return samples.filter(sample => {
    const minutes = minuteOfDay(sample.date);
    return minutes >= startMinute && minutes < endMinute;
  });
}

function minuteOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

function classifyMeal(timestamp: number): AgpMealEvent['mealType'] {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 10) {
    return 'breakfast';
  }
  if (hour >= 10 && hour < 15) {
    return 'lunch';
  }
  if (hour >= 17 && hour < 21) {
    return 'dinner';
  }
  return 'snack';
}

function nearestBg(samples: BgSample[], targetMs: number, windowMinutes = 15) {
  const windowMs = windowMinutes * 60_000;
  const nearest = samples
    .filter(s => Math.abs(s.date - targetMs) <= windowMs)
    .sort(
      (a, b) => Math.abs(a.date - targetMs) - Math.abs(b.date - targetMs),
    )[0];
  return nearest?.sgv ?? null;
}

function countDaysWithData(samples: BgSample[]) {
  return new Set(
    samples.map(sample => {
      const date = new Date(sample.date);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }),
  ).size;
}

function percentile(sortedValues: number[], p: number) {
  if (!sortedValues.length) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function avg(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function avgNullable(values: Array<number | null>) {
  return avg(values.filter((value): value is number => value != null));
}

function pct(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : null;
}

function eventPct<T>(events: T[], predicate: (event: T) => boolean) {
  return events.length
    ? pct(events.filter(predicate).length, events.length)
    : null;
}

function diffNullable(current: number | null, previous: number | null) {
  return current == null || previous == null ? null : current - previous;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function midpointMinute(window: AgpTimeWindow) {
  return Math.floor((window.startMinute + window.endMinute) / 2);
}

function scoreSegmentChange(deltas: AgpSegmentComparison['deltas']): number {
  return (
    Math.abs(deltas.tirPct ?? 0) * 1.6 +
    Math.abs(deltas.averageBg ?? 0) * 0.9 +
    Math.abs(deltas.lowPct ?? 0) * 2 +
    Math.abs(deltas.highPct ?? 0) * 1.3 +
    Math.abs(deltas.variabilityBand ?? 0) * 0.45
  );
}

export function hasMeaningfulCorrectionSignal(
  corrections: AgpCorrectionComparison,
) {
  return (
    corrections.currentCount >= 2 &&
    corrections.previousCount >= 2 &&
    (Math.abs(
      (corrections.currentAvgDrop3h ?? 0) -
        (corrections.previousAvgDrop3h ?? 0),
    ) >= 20 ||
      Math.abs(
        (corrections.currentLowAfterCorrectionPct ?? 0) -
          (corrections.previousLowAfterCorrectionPct ?? 0),
      ) >= 15)
  );
}

export {SEVERE_HIGH_THRESHOLD};
