import AsyncStorage from '@react-native-async-storage/async-storage';
import {subDays} from 'date-fns';

import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';

export type LoopTrendType = 'morning_high' | 'overnight_low' | 'post_lunch_spike';

export type LoopTrendSignal = {
  detected: boolean;
  confidence: number; // 0..1
  windowDays: number;
  trendType: LoopTrendType | null;
  summaryHe: string;
  summaryEn: string;
  evidence: {
    tirPct: number;
    morningHighPct: number;
    overnightLowCount: number;
    postLunchRiseAvg: number;
    correctionBolusCount: number;
  };
  createdAt: string;
};

const STORAGE_KEY = 'loopAssist:trendSignal:v1';
const FRESH_MS = 6 * 60 * 60 * 1000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hourOf(tsLike: any): number | null {
  const ts = typeof tsLike === 'number' ? tsLike : Date.parse(String(tsLike ?? ''));
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).getHours();
}

function toTs(value: any): number | null {
  const ts = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(ts) ? ts : null;
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export async function detectLoopAdjustmentTrend(params?: {
  daysWindow?: number; // 3..7
  force?: boolean;
}): Promise<LoopTrendSignal> {
  const daysWindow = Math.max(3, Math.min(7, Math.round(params?.daysWindow ?? 5)));

  if (!params?.force) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LoopTrendSignal;
        const ageMs = Date.now() - Date.parse(parsed.createdAt);
        if (ageMs >= 0 && ageMs < FRESH_MS) return parsed;
      }
    } catch {
      // ignore cache parse failures
    }
  }

  const end = new Date();
  const start = subDays(end, daysWindow);

  const [bgRows, treatments] = await Promise.all([
    fetchBgDataForDateRangeUncached(start, end, {throwOnError: false}),
    fetchTreatmentsForDateRangeUncached(start, end),
  ]);

  const rows = ((bgRows as any[]) ?? [])
    .map(r => ({sgv: Number(r?.sgv ?? NaN), ts: toTs(r?.date ?? r?.dateString)}))
    .filter(r => Number.isFinite(r.sgv) && Number.isFinite(r.ts)) as Array<{sgv: number; ts: number}>;

  const tirInRange = rows.filter(r => r.sgv >= 70 && r.sgv <= 180).length;
  const tirPct = rows.length ? Math.round((tirInRange / rows.length) * 100) : 0;

  const morningRows = rows.filter(r => {
    const h = hourOf(r.ts);
    return h != null && h >= 5 && h < 11;
  });
  const morningHighPct = morningRows.length
    ? Math.round((morningRows.filter(r => r.sgv > 180).length / morningRows.length) * 100)
    : 0;

  const overnightLowCount = rows.filter(r => {
    const h = hourOf(r.ts);
    return h != null && (h >= 23 || h < 6) && r.sgv < 70;
  }).length;

  const mealTs = ((treatments as any[]) ?? [])
    .filter(t => Number(t?.carbs ?? 0) > 0)
    .map(t => toTs(t?.created_at))
    .filter((n): n is number => Number.isFinite(n));

  const correctionBolusCount = ((treatments as any[]) ?? []).filter(t => {
    const et = String(t?.eventType ?? '').toLowerCase();
    return et.includes('correction') && Number(t?.insulin ?? 0) > 0;
  }).length;

  const lunchMealTs = mealTs.filter(ts => {
    const h = hourOf(ts);
    return h != null && h >= 11 && h < 16;
  });

  const postLunchRiseVals: number[] = [];
  for (const mealTsItem of lunchMealTs) {
    const pre = rows.filter(r => r.ts <= mealTsItem && r.ts >= mealTsItem - 45 * 60 * 1000);
    const post = rows.filter(r => r.ts >= mealTsItem && r.ts <= mealTsItem + 3 * 60 * 60 * 1000);
    if (!pre.length || !post.length) continue;
    const preBg = pre[pre.length - 1].sgv;
    const peak = Math.max(...post.map(r => r.sgv));
    postLunchRiseVals.push(Math.max(0, Math.round(peak - preBg)));
  }
  const postLunchRiseAvg = Math.round(average(postLunchRiseVals));

  const morningHighScore = morningHighPct >= 45 ? 0.78 : morningHighPct >= 35 ? 0.62 : 0;
  const overnightLowScore = overnightLowCount >= 6 ? 0.74 : overnightLowCount >= 3 ? 0.58 : 0;
  const lunchSpikeScore = postLunchRiseAvg >= 70 && lunchMealTs.length >= 2 ? 0.68 : postLunchRiseAvg >= 55 && lunchMealTs.length >= 2 ? 0.56 : 0;

  const candidate = [
    {type: 'morning_high' as const, score: morningHighScore},
    {type: 'overnight_low' as const, score: overnightLowScore},
    {type: 'post_lunch_spike' as const, score: lunchSpikeScore},
  ].sort((a, b) => b.score - a.score)[0];

  const detected = candidate.score >= 0.6;
  const confidence = clamp01(candidate.score + (tirPct < 65 ? 0.08 : 0));

  const summaryHe = !detected
    ? 'כרגע לא זוהתה מגמה יציבה מספיק לשינוי הגדרות.'
    : candidate.type === 'morning_high'
    ? 'נראה דפוס עקבי של ערכים גבוהים בבוקר לאורך כמה ימים.'
    : candidate.type === 'overnight_low'
    ? 'נראה דפוס חוזר של ירידות בלילה לאורך כמה ימים.'
    : 'נראה דפוס עקבי של קפיצה אחרי ארוחת צהריים לאורך כמה ימים.';

  const summaryEn = !detected
    ? 'No stable trend detected yet for a settings change.'
    : candidate.type === 'morning_high'
    ? 'A consistent morning-high pattern was detected across several days.'
    : candidate.type === 'overnight_low'
    ? 'A recurring overnight-low pattern was detected across several days.'
    : 'A consistent post-lunch spike pattern was detected across several days.';

  const signal: LoopTrendSignal = {
    detected,
    confidence,
    windowDays: daysWindow,
    trendType: detected ? candidate.type : null,
    summaryHe,
    summaryEn,
    evidence: {
      tirPct,
      morningHighPct,
      overnightLowCount,
      postLunchRiseAvg,
      correctionBolusCount,
    },
    createdAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(signal));
  } catch {
    // ignore cache writes
  }

  return signal;
}
