import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, I18nManager, Pressable, ScrollView, Text, View} from 'react-native';
import {format, subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';

import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {getLatestDailyBrief, regenerateDailyBrief} from 'app/services/proactiveCare/dailyBrief';
import {computeRank} from 'app/services/proactiveCare/streakRank';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {RANKS_INFO_SCREEN} from 'app/constants/SCREEN_NAMES';
import {t as tr} from 'app/i18n/translations';
import TimeInRangeRow from './components/TimeInRangeRow';
import {buildFullScreenStackedChartsParams, fetchStackedChartsDataForRange} from 'app/utils/stackedChartsData.utils';
import {pushFullScreenStackedCharts} from 'app/utils/fullscreenNavigation.utils';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';

type Row = {sgv: number; dateString?: string};

function averageBg(rows: Row[]) {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
}

function tierVisual(tier: string) {
  switch (tier) {
    case 'Diamond': return {emoji: '💎', color: '#4fc3f7'};
    case 'Platinum': return {emoji: '🛡️', color: '#81d4fa'};
    case 'Gold': return {emoji: '🏆', color: '#fbc02d'};
    case 'Silver': return {emoji: '🥈', color: '#b0bec5'};
    default: return {emoji: '🥉', color: '#b87333'};
  }
}

type MealBucket = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type MealBucketScore = {
  bucket: MealBucket;
  score: number;
  count: number;
  avgRise: number;
  avgTirPct: number;
  representativeTs: number | null;
};

type MealEpisode = {
  bucket: MealBucket;
  ts: number;
  carbs: number;
  hour: number;
  preBg: number | null;
  rise: number | null;
  preBolusMin: number | null;
  unitsPer10g: number | null;
  score: number | null;
};

type MealInvestigation = {
  bucket: MealBucket;
  confidence: 'low' | 'medium' | 'high';
  evidenceCount: number;
  textHe: string;
  textEn: string;
};

function classifyMealBucket(ts: number): MealBucket {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 22) return 'dinner';
  return 'snack';
}

function nearestBgBefore(rows: Row[], ts: number, windowMin = 45): number | null {
  const from = ts - windowMin * 60 * 1000;
  const candidates = rows
    .filter(r => {
      const t = r?.dateString ? Date.parse(r.dateString) : NaN;
      return Number.isFinite(t) && t >= from && t <= ts;
    })
    .sort((a, b) => Date.parse(b.dateString || '') - Date.parse(a.dateString || ''));
  return candidates.length ? candidates[0].sgv : null;
}

function bgWindow(rows: Row[], fromTs: number, toTs: number): number[] {
  return rows
    .filter(r => {
      const t = r?.dateString ? Date.parse(r.dateString) : NaN;
      return Number.isFinite(t) && t >= fromTs && t <= toTs;
    })
    .map(r => r.sgv);
}

function computeMealBucketScores(params: {
  bgRows: Row[];
  carbEvents: Array<{timestamp: number; carbs: number}>;
  hypo: number;
  hyper: number;
}): MealBucketScore[] {
  const {bgRows, carbEvents, hypo, hyper} = params;
  const base: Record<MealBucket, {scores: number[]; rises: number[]; tirs: number[]; times: number[]}> = {
    breakfast: {scores: [], rises: [], tirs: [], times: []},
    lunch: {scores: [], rises: [], tirs: [], times: []},
    dinner: {scores: [], rises: [], tirs: [], times: []},
    snack: {scores: [], rises: [], tirs: [], times: []},
  };

  for (const meal of carbEvents) {
    const pre = nearestBgBefore(bgRows, meal.timestamp, 45);
    const vals = bgWindow(bgRows, meal.timestamp, meal.timestamp + 4 * 60 * 60 * 1000);
    if (!vals.length || pre == null) continue;

    const peak = Math.max(...vals);
    const rise = Math.max(0, peak - pre);
    const inRange = vals.filter(v => v >= hypo && v <= hyper).length;
    const tir = inRange / Math.max(1, vals.length);

    const score = Math.round(Math.max(0, Math.min(100, 100 - rise * 0.45 + tir * 35)));
    const bucket = classifyMealBucket(meal.timestamp);
    base[bucket].scores.push(score);
    base[bucket].rises.push(Math.round(rise));
    base[bucket].tirs.push(Math.round(tir * 100));
    base[bucket].times.push(meal.timestamp);
  }

  const out = (Object.keys(base) as MealBucket[]).map(bucket => {
    const scores = base[bucket].scores;
    const rises = base[bucket].rises;
    const tirs = base[bucket].tirs;
    const times = base[bucket].times;
    return {
      bucket,
      score: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0,
      count: scores.length,
      avgRise: rises.length ? Math.round(rises.reduce((s, n) => s + n, 0) / rises.length) : 0,
      avgTirPct: tirs.length ? Math.round(tirs.reduce((s, n) => s + n, 0) / tirs.length) : 0,
      representativeTs: times.length ? Math.round(times.reduce((s, n) => s + n, 0) / times.length) : null,
    };
  });

  return out.filter(x => x.count > 0);
}

function buildMealEpisodes(params: {
  bgRows: Row[];
  treatments: any[];
  hypo: number;
  hyper: number;
}): MealEpisode[] {
  const {bgRows, treatments, hypo, hyper} = params;
  const meals = mapNightscoutTreatmentsToCarbFoodItems(treatments ?? []).map(m => ({
    ts: Number(m.timestamp),
    carbs: Number(m.carbs ?? 0),
  }));

  const boluses = (treatments ?? [])
    .filter(t => t?.insulin && ['Bolus', 'Meal Bolus', 'Correction Bolus', 'Combo Bolus'].includes(t?.eventType))
    .map(t => ({ts: Date.parse(t.created_at), insulin: Number(t.insulin || t.amount || 0)}))
    .filter(x => Number.isFinite(x.ts) && Number.isFinite(x.insulin) && x.insulin > 0);

  return meals
    .map(meal => {
      const preBg = nearestBgBefore(bgRows, meal.ts, 45);
      const vals = bgWindow(bgRows, meal.ts, meal.ts + 4 * 60 * 60 * 1000);
      const peak = vals.length ? Math.max(...vals) : null;
      const rise = preBg != null && peak != null ? Math.max(0, Math.round(peak - preBg)) : null;
      const inRange = vals.filter(v => v >= hypo && v <= hyper).length;
      const tir = vals.length ? inRange / vals.length : null;
      const score = rise != null && tir != null ? Math.round(Math.max(0, Math.min(100, 100 - rise * 0.45 + tir * 35))) : null;

      const nearbyBoluses = boluses.filter(b => b.ts >= meal.ts - 45 * 60 * 1000 && b.ts <= meal.ts + 30 * 60 * 1000);
      const before = nearbyBoluses.filter(b => b.ts <= meal.ts).sort((a, b) => b.ts - a.ts)[0];
      const units = nearbyBoluses.reduce((s, b) => s + b.insulin, 0);

      return {
        bucket: classifyMealBucket(meal.ts),
        ts: meal.ts,
        carbs: meal.carbs,
        hour: new Date(meal.ts).getHours(),
        preBg,
        rise,
        preBolusMin: before ? Math.round((meal.ts - before.ts) / 60000) : null,
        unitsPer10g: meal.carbs > 0 && units > 0 ? Number(((units / meal.carbs) * 10).toFixed(2)) : null,
        score,
      } as MealEpisode;
    })
    .filter(e => Number.isFinite(e.ts));
}

function avgNullable(list: Array<number | null>) {
  const vals = list.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

function buildMealInvestigations(params: {
  todayEpisodes: MealEpisode[];
  baselineEpisodes: MealEpisode[];
  targetMid: number;
}): MealInvestigation[] {
  const {todayEpisodes, baselineEpisodes, targetMid} = params;
  const buckets: MealBucket[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  return buckets
    .map(bucket => {
      const today = todayEpisodes.filter(e => e.bucket === bucket);
      if (!today.length) return null;

      const matchedBaseline = baselineEpisodes.filter(b =>
        b.bucket === bucket &&
        today.some(t => {
          const carbRatio = t.carbs > 0 && b.carbs > 0 ? Math.min(t.carbs, b.carbs) / Math.max(t.carbs, b.carbs) : 0;
          const hourDelta = Math.abs(t.hour - b.hour);
          return carbRatio >= 0.7 && hourDelta <= 2;
        }),
      );

      const baseSet = matchedBaseline.length ? matchedBaseline : baselineEpisodes.filter(e => e.bucket === bucket);
      if (!baseSet.length) {
        return {
          bucket,
          confidence: 'low',
          evidenceCount: 0,
          textHe: 'לא נמצאו מספיק ארוחות דומות להשוואה אמינה.',
          textEn: 'Not enough similar meals for a reliable comparison yet.',
        } satisfies MealInvestigation;
      }

      const tRise = avgNullable(today.map(e => e.rise));
      const bRise = avgNullable(baseSet.map(e => e.rise));
      const tPreBolus = avgNullable(today.map(e => e.preBolusMin));
      const bPreBolus = avgNullable(baseSet.map(e => e.preBolusMin));
      const tRatio = avgNullable(today.map(e => e.unitsPer10g));
      const bRatio = avgNullable(baseSet.map(e => e.unitsPer10g));
      const tPreBg = avgNullable(today.map(e => e.preBg));
      const bPreBg = avgNullable(baseSet.map(e => e.preBg));

      const riseDelta = (tRise ?? 0) - (bRise ?? 0);
      const preBolusDelta = (tPreBolus ?? 0) - (bPreBolus ?? 0);
      const ratioDelta = (tRatio ?? 0) - (bRatio ?? 0);
      const targetDistDelta = Math.abs((tPreBg ?? targetMid) - targetMid) - Math.abs((bPreBg ?? targetMid) - targetMid);

      const signals: Array<{score: number; he: string; en: string}> = [];

      if (tPreBolus != null && bPreBolus != null && Math.abs(preBolusDelta) >= 7) {
        const good = preBolusDelta > 0 && riseDelta <= -8;
        const bad = preBolusDelta < 0 && riseDelta >= 8;
        if (good || bad) {
          signals.push({
            score: 0.34,
            he: good
              ? `בארוחות דומות פרה-בולוס היה ארוך יותר בכ-${Math.round(preBolusDelta)} דק׳, ונרשמה ירידת פיק של ${Math.round(Math.abs(riseDelta))} mg/dL.`
              : `בארוחות דומות פרה-בולוס התקצר בכ-${Math.round(Math.abs(preBolusDelta))} דק׳, ובמקביל הפיק עלה בכ-${Math.round(Math.abs(riseDelta))} mg/dL.`,
            en: good
              ? `Across similar meals, pre-bolus was longer by ~${Math.round(preBolusDelta)} min and peak fell by ${Math.round(Math.abs(riseDelta))} mg/dL.`
              : `Across similar meals, pre-bolus was shorter by ~${Math.round(Math.abs(preBolusDelta))} min and peak rose by ${Math.round(Math.abs(riseDelta))} mg/dL.`,
          });
        }
      }

      if (tRatio != null && bRatio != null && Math.abs(ratioDelta) >= 0.18) {
        const good = ratioDelta > 0 && riseDelta <= -8;
        const bad = ratioDelta < 0 && riseDelta >= 8;
        if (good || bad) {
          signals.push({
            score: 0.33,
            he: good
              ? `יחס אינסולין/פחמימה היה גבוה יותר בכ-${ratioDelta.toFixed(1)} יח׳ ל-10 גר׳, והתגובה אחרי הארוחה השתפרה.`
              : `יחס אינסולין/פחמימה היה נמוך יותר בכ-${Math.abs(ratioDelta).toFixed(1)} יח׳ ל-10 גר׳, ונראה שזה החליש את הכיסוי.` ,
            en: good
              ? `Insulin/carb ratio was higher by ${ratioDelta.toFixed(1)} U per 10g, with better post-meal control.`
              : `Insulin/carb ratio was lower by ${Math.abs(ratioDelta).toFixed(1)} U per 10g, likely weakening meal coverage.`,
          });
        }
      }

      if (tPreBg != null && bPreBg != null && Math.abs(targetDistDelta) >= 8) {
        const good = targetDistDelta < 0 && riseDelta <= -4;
        const bad = targetDistDelta > 0 && riseDelta >= 4;
        if (good || bad) {
          signals.push({
            score: 0.25,
            he: good
              ? `לפני הארוחה היית קרוב יותר ליעד האישי האמצעי (${targetMid} mg/dL), עם פתיחה סביב ${Math.round(tPreBg)} mg/dL — וזה תרם ליציבות טובה יותר.`
              : `לפני הארוחה היית רחוק יותר מהיעד האישי האמצעי (${targetMid} mg/dL), עם פתיחה סביב ${Math.round(tPreBg)} mg/dL — וזה כנראה הקשה על היציבות.`,
            en: good
              ? `Pre-meal glucose was closer to your personal midpoint target (${targetMid} mg/dL), around ${Math.round(tPreBg)} mg/dL, contributing to better stability.`
              : `Pre-meal glucose was farther from your personal midpoint target (${targetMid} mg/dL), around ${Math.round(tPreBg)} mg/dL, likely hurting stability.`,
          });
        }
      }

      const evidenceCount = Math.min(today.length, baseSet.length);
      const score = Math.min(0.95, signals.reduce((s, x) => s + x.score, 0) + Math.min(0.25, evidenceCount * 0.03));
      const confidence: MealInvestigation['confidence'] = score >= 0.7 ? 'high' : score >= 0.45 ? 'medium' : 'low';
      const top = signals.sort((a, b) => b.score - a.score)[0];

      return {
        bucket,
        confidence,
        evidenceCount,
        textHe: top?.he ?? 'נמצאה מגמה בארוחות דומות, אבל כרגע אין גורם יחיד מובהק עם ביטחון גבוה.',
        textEn: top?.en ?? 'A trend exists across similar meals, but no single dominant cause has high confidence yet.',
      } satisfies MealInvestigation;
    })
    .filter(Boolean) as MealInvestigation[];
}

function mealBucketLabel(language: string, bucket: MealBucket): string {
  if (language === 'he') {
    if (bucket === 'breakfast') return 'בוקר';
    if (bucket === 'lunch') return 'צהריים';
    if (bucket === 'dinner') return 'ערב';
    return 'נשנוש';
  }
  if (bucket === 'breakfast') return 'Breakfast';
  if (bucket === 'lunch') return 'Lunch';
  if (bucket === 'dinner') return 'Dinner';
  return 'Snack';
}

const DailyReviewScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation<any>();
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();
  const {language} = useAppLanguage();

  const [loading, setLoading] = useState(true);
  const [refreshingAction, setRefreshingAction] = useState(false);
  const [yRows, setYRows] = useState<Row[]>([]);
  const [wRows, setWRows] = useState<Row[]>([]);
  const [mealScoresY, setMealScoresY] = useState<MealBucketScore[]>([]);
  const [mealScoresPrev, setMealScoresPrev] = useState<MealBucketScore[]>([]);
  const [mealInvestigations, setMealInvestigations] = useState<MealInvestigation[]>([]);
  const [expandedMealWhy, setExpandedMealWhy] = useState<MealBucket | null>(null);
  const [llmSummaryLine, setLlmSummaryLine] = useState<string | null>(null);
  const [llmKeyLine, setLlmKeyLine] = useState<string | null>(null);
  const [llmActionLine, setLlmActionLine] = useState<string | null>(null);
  const [whyLine, setWhyLine] = useState<string | null>(null);
  const [actionSource, setActionSource] = useState<'ai' | 'fallback'>('fallback');
  const [openingMealBucket, setOpeningMealBucket] = useState<MealBucket | null>(null);

  const textAlign: 'left' | 'right' = I18nManager.isRTL ? 'right' : 'left';

  const todayStart = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  }, []);
  const yStart = useMemo(() => subDays(todayStart, 1), [todayStart]);
  const prevDayStart = useMemo(() => subDays(yStart, 1), [yStart]);
  const wStart = useMemo(() => subDays(todayStart, 8), [todayStart]);

  const getDayInsulinTotal = async (dayStart: Date): Promise<number> => {
    const s = new Date(dayStart); s.setHours(0, 0, 0, 0);
    const e = new Date(dayStart); e.setHours(23, 59, 59, 999);
    const [treatments, profileData] = await Promise.all([
      fetchTreatmentsForDateRangeUncached(s, e),
      getUserProfileFromNightscout(s.toISOString()),
    ]);
    const entries = mapNightscoutTreatmentsToInsulinDataEntries(treatments ?? []);
    const basal = extractBasalProfileFromNightscoutProfileData(profileData);
    const totals = calculateTotalInsulin(entries, basal, s, e);
    return (totals.totalBasal || 0) + (totals.totalBolus || 0);
  };

  const loadData = useCallback(async () => {
    const [y, w, yTreatments, wTreatments] = await Promise.all([
      fetchBgDataForDateRangeUncached(yStart, todayStart, {throwOnError: false}),
      fetchBgDataForDateRangeUncached(wStart, yStart, {throwOnError: false}),
      fetchTreatmentsForDateRangeUncached(yStart, todayStart),
      fetchTreatmentsForDateRangeUncached(wStart, yStart),
    ]);
    const yList = ((y as any) ?? []) as Row[];
    setYRows(yList);
    setWRows((w as any) ?? []);

    const yMeals = mapNightscoutTreatmentsToCarbFoodItems(yTreatments ?? []).map(m => ({
      timestamp: Number(m.timestamp),
      carbs: Number(m.carbs ?? 0),
    }));
    const wMeals = mapNightscoutTreatmentsToCarbFoodItems(wTreatments ?? []).map(m => ({
      timestamp: Number(m.timestamp),
      carbs: Number(m.carbs ?? 0),
    }));

    setMealScoresY(
      computeMealBucketScores({
        bgRows: yList,
        carbEvents: yMeals,
        hypo: glucoseSettings.hypo ?? 70,
        hyper: glucoseSettings.hyper ?? 180,
      }),
    );
    setMealScoresPrev(
      computeMealBucketScores({
        bgRows: ((w as any) ?? []) as Row[],
        carbEvents: wMeals,
        hypo: glucoseSettings.hypo ?? 70,
        hyper: glucoseSettings.hyper ?? 180,
      }),
    );

    const todayEpisodes = buildMealEpisodes({
      bgRows: yList,
      treatments: (yTreatments as any[]) ?? [],
      hypo: glucoseSettings.hypo ?? 70,
      hyper: glucoseSettings.hyper ?? 180,
    });
    const baselineEpisodes = buildMealEpisodes({
      bgRows: ((w as any) ?? []) as Row[],
      treatments: (wTreatments as any[]) ?? [],
      hypo: glucoseSettings.hypo ?? 70,
      hyper: glucoseSettings.hyper ?? 180,
    });

    setMealInvestigations(
      buildMealInvestigations({
        todayEpisodes,
        baselineEpisodes,
        targetMid: Math.round(((glucoseSettings.hypo ?? 70) + (glucoseSettings.hyper ?? 180)) / 2),
      }),
    );

    // keep insulin calculation for parity with existing data flow
    try {
      await getDayInsulinTotal(yStart);
      await getDayInsulinTotal(prevDayStart);
    } catch {
      // ignore
    }

    let latestBrief = await getLatestDailyBrief();
    const expectedDate = format(yStart, 'yyyy-MM-dd');
    const briefDate = latestBrief?.createdAt ? format(new Date(latestBrief.createdAt), 'yyyy-MM-dd') : null;

    if (!latestBrief?.body || briefDate !== expectedDate) {
      try {
        await regenerateDailyBrief({
          glucose: glucoseSettings,
          ai: {enabled: aiSettings.enabled, apiKey: aiSettings.apiKey, model: aiSettings.openAiModel},
          notify: false,
        });
        latestBrief = await getLatestDailyBrief();
      } catch {
        // Keep local computed fallback UI if generation fails.
      }
    }

    if (latestBrief?.body) {
      const lines = latestBrief.body.split('\n').map((s: string) => s.trim()).filter(Boolean);
      setLlmSummaryLine(lines.find((l: string) => l.startsWith('📊')) || null);
      setLlmKeyLine(lines.find((l: string) => l.startsWith('🔎')) || null);
      setLlmActionLine(lines.find((l: string) => l.startsWith('🎯')) || lines[2] || null);
      setWhyLine(lines.find((l: string) => l.startsWith('🧠')) || null);
      setActionSource(latestBrief.source === 'ai' ? 'ai' : 'fallback');
    } else {
      setLlmSummaryLine(null);
      setLlmKeyLine(null);
      setLlmActionLine(null);
      setWhyLine(null);
      setActionSource('fallback');
    }
  }, [aiSettings.apiKey, aiSettings.enabled, aiSettings.openAiModel, glucoseSettings, prevDayStart, todayStart, wStart, yStart]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadData().finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [loadData]);

  const handleRegenerate = async () => {
    try {
      setRefreshingAction(true);
      await regenerateDailyBrief({
        glucose: glucoseSettings,
        ai: {enabled: aiSettings.enabled, apiKey: aiSettings.apiKey, model: aiSettings.openAiModel},
        notify: false,
      });
      await loadData();
    } finally {
      setRefreshingAction(false);
    }
  };

  const openMealBucketChart = async (bucket: MealBucket, ts: number | null) => {
    if (!ts) return;
    try {
      setOpeningMealBucket(bucket);
      const xDomainMs = {
        // Focused meal window: cleaner fullscreen view.
        startMs: ts - 45 * 60 * 1000,
        endMs: ts + 3 * 60 * 60 * 1000,
      };

      const data = await fetchStackedChartsDataForRange({
        startMs: xDomainMs.startMs,
        endMs: xDomainMs.endMs,
      });

      const payload = buildFullScreenStackedChartsParams({
        title:
          language === 'he'
            ? `ארוחת ${mealBucketLabel(language, bucket)} • ${format(new Date(ts), 'HH:mm')}`
            : `${mealBucketLabel(language, bucket)} meal • ${format(new Date(ts), 'HH:mm')}`,
        bgSamples: data.bgSamples,
        foodItems: data.foodItems,
        insulinData: data.insulinData,
        basalProfileData: data.basalProfileData,
        xDomainMs,
        fallbackAnchorTimeMs: ts,
      });

      pushFullScreenStackedCharts({navigation, payload});
    } finally {
      setOpeningMealBucket(null);
    }
  };

  const yAvg = useMemo(() => averageBg(yRows), [yRows]);
  const yTirPct = useMemo(() => {
    if (!yRows.length) return 0;
    const inRange = yRows.filter(r => r.sgv >= (glucoseSettings.hypo ?? 70) && r.sgv <= (glucoseSettings.hyper ?? 180)).length;
    return Math.round((inRange / yRows.length) * 100);
  }, [yRows, glucoseSettings.hypo, glucoseSettings.hyper]);

  const yLows = useMemo(() => yRows.filter(r => r.sgv < (glucoseSettings.hypo ?? 70)).length, [yRows, glucoseSettings.hypo]);
  const yHighs = useMemo(() => yRows.filter(r => r.sgv > (glucoseSettings.hyper ?? 180)).length, [yRows, glucoseSettings.hyper]);
  const wAvg = useMemo(() => averageBg(wRows), [wRows]);
  const wTirPct = useMemo(() => {
    if (!wRows.length) return 0;
    const inRange = wRows.filter(r => r.sgv >= (glucoseSettings.hypo ?? 70) && r.sgv <= (glucoseSettings.hyper ?? 180)).length;
    return Math.round((inRange / wRows.length) * 100);
  }, [wRows, glucoseSettings.hypo, glucoseSettings.hyper]);
  const wLows = useMemo(() => wRows.filter(r => r.sgv < (glucoseSettings.hypo ?? 70)).length, [wRows, glucoseSettings.hypo]);
  const wHighs = useMemo(() => wRows.filter(r => r.sgv > (glucoseSettings.hyper ?? 180)).length, [wRows, glucoseSettings.hyper]);

  const yLowPct = useMemo(() => (yRows.length ? Math.round((yLows / yRows.length) * 100) : 0), [yRows.length, yLows]);
  const yHighPct = useMemo(() => (yRows.length ? Math.round((yHighs / yRows.length) * 100) : 0), [yRows.length, yHighs]);
  const wLowPct = useMemo(() => (wRows.length ? Math.round((wLows / wRows.length) * 100) : 0), [wRows.length, wLows]);
  const wHighPct = useMemo(() => (wRows.length ? Math.round((wHighs / wRows.length) * 100) : 0), [wRows.length, wHighs]);

  const avgDelta = yAvg - wAvg;
  const tirDelta = yTirPct - wTirPct;
  const lowDelta = yLowPct - wLowPct;
  const highDelta = yHighPct - wHighPct;

  const rank = useMemo(() => computeRank({tir: wTirPct || yTirPct, lows: wLows, highs: wHighs}), [wTirPct, yTirPct, wLows, wHighs]);
  const rv = tierVisual(rank.tier);

  const mealComparisons = useMemo(() => {
    const prevMap = new Map(mealScoresPrev.map(m => [m.bucket, m]));
    return mealScoresY
      .map(m => {
        const prev = prevMap.get(m.bucket);
        return {
          ...m,
          prevScore: prev?.score ?? null,
          delta: prev ? m.score - prev.score : null,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [mealScoresPrev, mealScoresY]);

  const topImprovedMeal = useMemo(() => {
    const improvedOnly = mealComparisons.filter(m => typeof m.delta === 'number' && (m.delta as number) > 0);
    if (!improvedOnly.length) return null;
    return [...improvedOnly].sort((a, b) => (b.delta as number) - (a.delta as number))[0];
  }, [mealComparisons]);

  const needsAttentionMeal = useMemo(() => {
    if (!mealComparisons.length) return null;
    return [...mealComparisons].sort((a, b) => a.score - b.score)[0];
  }, [mealComparisons]);

  const topDeclinedMeal = useMemo(() => {
    const declinedOnly = mealComparisons.filter(m => typeof m.delta === 'number' && (m.delta as number) < 0);
    if (!declinedOnly.length) return null;
    return [...declinedOnly].sort((a, b) => (a.delta as number) - (b.delta as number))[0];
  }, [mealComparisons]);

  const mealInvestigationMap = useMemo(() => new Map(mealInvestigations.map(m => [m.bucket, m])), [mealInvestigations]);

  const explainMealDelta = (bucket: MealBucket, delta: number | null) => {
    const inv = mealInvestigationMap.get(bucket);
    if (inv) {
      return language === 'he' ? inv.textHe : inv.textEn;
    }

    if (delta == null) {
      return language === 'he'
        ? 'אין מספיק נתונים לחקירה אמינה של השינוי בארוחה הזו.'
        : 'Not enough data to run a reliable investigation for this meal yet.';
    }

    return language === 'he'
      ? delta > 0
        ? 'יש שיפור בתוצאה, אבל החקירה לא מצאה גורם יחיד עם ביטחון גבוה.'
        : 'יש ירידה בתוצאה, אבל החקירה לא מצאה גורם יחיד עם ביטחון גבוה.'
      : delta > 0
      ? 'Meal improved, but investigation did not find one dominant high-confidence cause.'
      : 'Meal declined, but investigation did not find one dominant high-confidence cause.';
  };

  if (loading) {
    return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><ActivityIndicator /></View>;
  }

  const card = {backgroundColor: theme.white, borderRadius: 14, padding: 12};
  const targetMid = Math.round(((glucoseSettings.hypo ?? 70) + (glucoseSettings.hyper ?? 180)) / 2);
  const avgDistance = Math.abs(yAvg - targetMid);
  const avgScore = Math.max(0, Math.min(100, 100 - Math.round(avgDistance * 0.9)));

  const metricChip = (label: string, delta: number, betterWhen: 'higher' | 'lower') => {
    const improved = betterWhen === 'higher' ? delta > 0 : delta < 0;
    const worse = betterWhen === 'higher' ? delta < 0 : delta > 0;
    const color = improved ? '#2e7d32' : worse ? '#c62828' : '#757575';
    const sign = delta > 0 ? '+' : '';
    return (
      <View key={label} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(color, 0.35), backgroundColor: addOpacity(color, 0.08)}}>
        <Text style={{fontSize: 12, color, fontWeight: '700'}}>{label} {sign}{delta}{label.includes('%') ? '%' : ''}</Text>
      </View>
    );
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 10}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <Pressable onPress={() => navigation.goBack()} style={{padding: 4}}><MaterialIcons name="arrow-back" size={24} color={theme.textColor} /></Pressable>
        <View>
          <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor, textAlign}}>{tr(language, 'dailyReview.title')}</Text>
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65), textAlign}}>{tr(language, 'common.date')}: {format(yStart, 'd/M')}</Text>
        </View>
        <View style={{width: 24}} />
      </View>

      <Pressable onPress={() => navigation.navigate(RANKS_INFO_SCREEN, {tier: rank.tier, score: rank.score, nextTier: rank.nextTier, progressToNextPct: rank.progressToNextPct, breakdown: rank.breakdown, weeklyMetrics: {tir: wTirPct, lows: wLows, highs: wHighs}})} style={{...card, backgroundColor: addOpacity(rv.color, 0.14), borderWidth: 1, borderColor: addOpacity(rv.color, 0.6)}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rv.emoji} {rank.tier}</Text>
          <Text style={{fontWeight: '700', color: addOpacity(theme.textColor, 0.7)}}>{tr(language, 'dailyReview.score')} {rank.score}</Text>
        </View>
      </Pressable>

      <View style={{...card, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.3), backgroundColor: addOpacity(theme.accentColor, 0.06)}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>{language === 'he' ? 'מדד היום' : 'Today score'}</Text>
          <Text style={{fontWeight: '800', color: theme.accentColor}}>{avgScore}/100</Text>
        </View>

        <View style={{marginTop: 10, flexDirection: 'row', alignItems: 'baseline'}}>
          <Text style={{fontSize: 30, fontWeight: '900', color: theme.textColor}}>{yAvg}</Text>
          <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.65)}}>mg/dL</Text>
        </View>
        <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.72), textAlign}}>
          {language === 'he'
            ? `ממוצע שבועי: ${wAvg} | יעד יומי: ${targetMid}`
            : `Weekly avg: ${wAvg} | daily target: ${targetMid}`}
        </Text>

        <View style={{marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {metricChip(language === 'he' ? 'Δממוצע' : 'ΔAvg', avgDelta, 'lower')}
          {metricChip(language === 'he' ? 'ΔTIR%' : 'ΔTIR%', tirDelta, 'higher')}
          {metricChip(language === 'he' ? 'Δנמוכים%' : 'ΔLows%', lowDelta, 'lower')}
          {metricChip(language === 'he' ? 'Δגבוהים%' : 'ΔHighs%', highDelta, 'lower')}
        </View>

        {llmSummaryLine ? (
          <Text style={{marginTop: 10, color: theme.textColor, textAlign}}>{llmSummaryLine}</Text>
        ) : null}
      </View>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>{tr(language, 'dailyReview.key')}</Text>
        <Text style={{marginTop: 6, color: theme.textColor, textAlign}}>
          {llmKeyLine || (yLows > yHighs
            ? tr(language, 'dailyReview.lowsVsHighs', {lows: yLows, highs: yHighs})
            : tr(language, 'dailyReview.highsVsLows', {lows: yLows, highs: yHighs}))}
        </Text>
      </View>

      <View style={card}>
        <Text style={{fontWeight: '700', color: theme.textColor, textAlign}}>{tr(language, 'dailyReview.range')}</Text>
        <View style={{marginTop: 6}}>{yRows.length ? <TimeInRangeRow bgData={yRows as any} /> : <Text style={{color: addOpacity(theme.textColor, 0.75), textAlign}}>{tr(language, 'dailyReview.noData')}</Text>}</View>
      </View>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>
          {language === 'he' ? 'ציוני ארוחות יומיים' : 'Daily meal scores'}
        </Text>

        {(topImprovedMeal || needsAttentionMeal) ? (
          <View style={{marginTop: 8, gap: 8}}>
            {topImprovedMeal ? (
              <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity('#2e7d32', 0.35), backgroundColor: addOpacity('#2e7d32', 0.08)}}>
                <Text style={{fontWeight: '800', color: '#2e7d32'}}>
                  {language === 'he' ? '🚀 הארוחה שהכי השתפרה' : '🚀 Top improved meal'}
                </Text>
                <Text style={{marginTop: 4, color: theme.textColor}}>
                  {mealBucketLabel(language, topImprovedMeal.bucket)}
                  <Text style={{writingDirection: 'ltr'}}> • {topImprovedMeal.prevScore ?? '—'} → {topImprovedMeal.score}</Text>
                  {language === 'he' ? ' (מול ממוצע שבועי)' : ' (vs weekly baseline)'}
                  {typeof topImprovedMeal.delta === 'number' ? <Text style={{writingDirection: 'ltr'}}>{` (${topImprovedMeal.delta > 0 ? '+' : ''}${topImprovedMeal.delta})`}</Text> : ''}
                </Text>
                <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.78)}}>
                  {explainMealDelta(topImprovedMeal.bucket, topImprovedMeal.delta)}
                </Text>
              </View>
            ) : topDeclinedMeal ? (
              <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity('#c62828', 0.35), backgroundColor: addOpacity('#c62828', 0.08)}}>
                <Text style={{fontWeight: '800', color: '#c62828'}}>
                  {language === 'he' ? '📉 לא הייתה ארוחה שהשתפרה אתמול' : '📉 No meal improved yesterday'}
                </Text>
                <Text style={{marginTop: 4, color: theme.textColor}}>
                  {language === 'he' ? 'הירידה הבולטת מול שבוע אחרון:' : 'Largest drop vs recent week:'} {mealBucketLabel(language, topDeclinedMeal.bucket)}
                  <Text style={{writingDirection: 'ltr'}}> • {topDeclinedMeal.prevScore ?? '—'} → {topDeclinedMeal.score}</Text>
                  {typeof topDeclinedMeal.delta === 'number' ? <Text style={{writingDirection: 'ltr'}}>{` (${topDeclinedMeal.delta})`}</Text> : ''}
                </Text>
                <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.78)}}>
                  {explainMealDelta(topDeclinedMeal.bucket, topDeclinedMeal.delta)}
                </Text>
              </View>
            ) : null}

            {needsAttentionMeal ? (
              <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity('#c62828', 0.35), backgroundColor: addOpacity('#c62828', 0.08)}}>
                <Text style={{fontWeight: '800', color: '#c62828'}}>
                  {language === 'he' ? '🎯 דורש פוקוס מחר' : '🎯 Needs attention next'}
                </Text>
                <Text style={{marginTop: 4, color: theme.textColor}}>
                  {mealBucketLabel(language, needsAttentionMeal.bucket)} • {needsAttentionMeal.score}/100 • {language === 'he' ? `עלייה ממוצעת ${needsAttentionMeal.avgRise}` : `avg rise ${needsAttentionMeal.avgRise}`} mg/dL
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {mealComparisons.length ? (
          <View style={{marginTop: 8, gap: 8}}>
            {mealComparisons.map(item => {
              const delta = item.delta ?? 0;
              const improved = (item.delta ?? 0) > 0;
              const same = item.delta == null || item.delta === 0;
              const deltaColor = same ? addOpacity(theme.textColor, 0.6) : improved ? '#2e7d32' : '#c62828';
              return (
                <View
                  key={item.bucket}
                  style={{borderWidth: 1, borderColor: addOpacity(theme.borderColor || '#999', 0.5), borderRadius: 12, padding: 10}}
                >
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={{fontWeight: '700', color: theme.textColor}}>{mealBucketLabel(language, item.bucket)}</Text>
                    <Text style={{fontWeight: '900', color: theme.accentColor}}>{item.score}/100</Text>
                  </View>

                  <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.68), fontSize: 12}}>
                    {language === 'he'
                      ? `שעת ארוחה משוערת: ${item.representativeTs ? format(new Date(item.representativeTs), 'HH:mm') : '—'}`
                      : `Estimated meal time: ${item.representativeTs ? format(new Date(item.representativeTs), 'HH:mm') : '—'}`}
                    {openingMealBucket === item.bucket ? ` • ${language === 'he' ? 'פותח גרף…' : 'Opening chart…'}` : ''}
                  </Text>

                  <View style={{marginTop: 7, height: 8, borderRadius: 99, backgroundColor: addOpacity(theme.textColor, 0.12)}}>
                    <View style={{width: `${Math.max(0, Math.min(100, item.score))}%`, height: 8, borderRadius: 99, backgroundColor: item.score >= 75 ? '#2e7d32' : item.score >= 55 ? '#f9a825' : '#c62828'}} />
                  </View>

                  <View style={{marginTop: 8, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.12), borderRadius: 10, padding: 8, gap: 4}}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.8)}}>
                        {language === 'he' ? '📈 פיק אחרי ארוחה' : '📈 Post-meal peak'}
                      </Text>
                      <Text style={{fontSize: 12, fontWeight: '700', color: theme.textColor, writingDirection: 'ltr'}}>
                        {item.avgRise} mg/dL | {Math.max(0, Math.min(100, Math.round(100 - item.avgRise * 0.45)))}/100
                      </Text>
                    </View>

                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.8)}}>
                        {language === 'he' ? '🟢 TIR (4ש׳ אחרי ארוחה)' : '🟢 TIR (4h post meal)'}
                      </Text>
                      <Text style={{fontSize: 12, fontWeight: '700', color: theme.textColor, writingDirection: 'ltr'}}>
                        {item.avgTirPct}% | +{Math.round((item.avgTirPct / 100) * 35)}
                      </Text>
                    </View>

                    <View style={{height: 1, backgroundColor: addOpacity(theme.textColor, 0.12), marginVertical: 2}} />

                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.8)}}>
                        {language === 'he' ? '🏁 ציון מסכם' : '🏁 Final score'}
                      </Text>
                      <Text style={{fontSize: 12, fontWeight: '900', color: theme.accentColor, writingDirection: 'ltr'}}>{item.score}/100</Text>
                    </View>
                  </View>

                  <Text style={{marginTop: 4, color: deltaColor, fontSize: 12, fontWeight: '700'}}>
                    {item.prevScore == null
                      ? language === 'he'
                        ? 'אין מספיק ארוחות דומות בשבוע האחרון להשוואה'
                        : 'Not enough similar meals in the recent week for comparison'
                      : language === 'he'
                      ? 'מול ממוצע שבועי: '
                      : 'Vs weekly baseline: '}
                    {item.prevScore != null ? (
                      <Text style={{writingDirection: 'ltr'}}>
                        {`${delta > 0 ? '+' : ''}${delta} ${language === 'he' ? 'נק׳' : 'pts'} (${item.prevScore} → ${item.score})`}
                      </Text>
                    ) : null}
                  </Text>

                  <View style={{marginTop: 8, flexDirection: 'row', gap: 8}}>
                    <Pressable
                      onPress={() => openMealBucketChart(item.bucket, item.representativeTs)}
                      style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.5)}}
                    >
                      <Text style={{color: theme.accentColor, fontWeight: '700', fontSize: 12}}>
                        {language === 'he' ? 'פתח גרף' : 'Open chart'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setExpandedMealWhy(prev => (prev === item.bucket ? null : item.bucket))}
                      style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.35)}}
                    >
                      <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>
                        {language === 'he' ? 'למה זה השתנה?' : 'Why did this change?'}
                      </Text>
                    </Pressable>
                  </View>

                  {expandedMealWhy === item.bucket ? (
                    <View style={{marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: addOpacity(theme.accentColor, 0.08), borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.2)}}>
                      <Text style={{color: theme.textColor}}>{explainMealDelta(item.bucket, item.delta)}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.75), textAlign}}>{tr(language, 'dailyReview.noData')}</Text>
        )}
      </View>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>{tr(language, 'dailyReview.rec')}</Text>
        <Text style={{marginTop: 6, color: theme.textColor, textAlign}}>{llmActionLine || tr(language, 'dailyReview.fallbackAction')}</Text>
        {whyLine ? <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.75), textAlign}}>{whyLine}</Text> : null}
        <Text style={{marginTop: 4, fontSize: 12, color: addOpacity(theme.textColor, 0.6), textAlign}}>{actionSource === 'ai' ? tr(language, 'dailyReview.sourceAi') : tr(language, 'dailyReview.sourceAuto')}</Text>
      </View>

      {!!(aiSettings.enabled && (aiSettings.apiKey || '').trim()) && (
        <Pressable onPress={handleRegenerate} disabled={refreshingAction} style={{...card, alignItems: 'center'}}>
          <Text style={{fontWeight: '700', color: theme.textColor}}>{refreshingAction ? tr(language, 'dailyReview.refreshing') : tr(language, 'dailyReview.refresh')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

export default DailyReviewScreen;
