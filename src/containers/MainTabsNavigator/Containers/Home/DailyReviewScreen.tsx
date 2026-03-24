import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Animated, I18nManager, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, UIManager, View} from 'react-native';
import {addDays, format, subDays} from 'date-fns';
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
import {
  getLatestDailyBrief,
  regenerateDailyBrief,
  buildDailyBriefSystemInstruction,
  getDailyBriefLanguageGuardrails,
} from 'app/services/proactiveCare/dailyBrief';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
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
import {addMemoryEntry} from 'app/services/aiMemory/aiMemoryStore';
import notifee, {TriggerType} from '@notifee/react-native';
import ScoreBadge from 'app/components/common-ui/ScoreBadge/ScoreBadge';

type Row = {sgv: number; dateString?: string};

function averageBg(rows: Row[]) {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
}

type MealBucket = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type MealBucketScore = {
  bucket: MealBucket;
  score: number;
  count: number;
  avgRise: number;
  avgTirPct: number;
  avgLowPct: number;
  avgHighPct: number;
  representativeTs: number | null;
};

type MealEpisode = {
  bucket: MealBucket;
  ts: number;
  carbs: number;
  hour: number;
  preBg: number | null;
  peakBg: number | null;
  lowBg: number | null;
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
  const base: Record<MealBucket, {scores: number[]; rises: number[]; tirs: number[]; lows: number[]; highs: number[]; times: number[]}> = {
    breakfast: {scores: [], rises: [], tirs: [], lows: [], highs: [], times: []},
    lunch: {scores: [], rises: [], tirs: [], lows: [], highs: [], times: []},
    dinner: {scores: [], rises: [], tirs: [], lows: [], highs: [], times: []},
    snack: {scores: [], rises: [], tirs: [], lows: [], highs: [], times: []},
  };

  for (const meal of carbEvents) {
    const pre = nearestBgBefore(bgRows, meal.timestamp, 45);
    const vals = bgWindow(bgRows, meal.timestamp, meal.timestamp + 4 * 60 * 60 * 1000);
    if (!vals.length || pre == null) continue;

    const peak = Math.max(...vals);
    const rise = Math.max(0, peak - pre);
    const inRange = vals.filter(v => v >= hypo && v <= hyper).length;
    const lowCount = vals.filter(v => v < hypo).length;
    const highCount = vals.filter(v => v > hyper).length;
    const tir = inRange / Math.max(1, vals.length);

    const score = Math.round(Math.max(0, Math.min(100, 100 - rise * 0.45 + tir * 35)));
    const bucket = classifyMealBucket(meal.timestamp);
    base[bucket].scores.push(score);
    base[bucket].rises.push(Math.round(rise));
    base[bucket].tirs.push(Math.round(tir * 100));
    base[bucket].lows.push(Math.round((lowCount / Math.max(1, vals.length)) * 100));
    base[bucket].highs.push(Math.round((highCount / Math.max(1, vals.length)) * 100));
    base[bucket].times.push(meal.timestamp);
  }

  const out = (Object.keys(base) as MealBucket[]).map(bucket => {
    const scores = base[bucket].scores;
    const rises = base[bucket].rises;
    const tirs = base[bucket].tirs;
    const lows = base[bucket].lows;
    const highs = base[bucket].highs;
    const times = base[bucket].times;
    return {
      bucket,
      score: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0,
      count: scores.length,
      avgRise: rises.length ? Math.round(rises.reduce((s, n) => s + n, 0) / rises.length) : 0,
      avgTirPct: tirs.length ? Math.round(tirs.reduce((s, n) => s + n, 0) / tirs.length) : 0,
      avgLowPct: lows.length ? Math.round(lows.reduce((s, n) => s + n, 0) / lows.length) : 0,
      avgHighPct: highs.length ? Math.round(highs.reduce((s, n) => s + n, 0) / highs.length) : 0,
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
      const low = vals.length ? Math.min(...vals) : null;
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
        peakBg: peak != null ? Math.round(peak) : null,
        lowBg: low != null ? Math.round(low) : null,
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
  const [todayEpisodes, setTodayEpisodes] = useState<MealEpisode[]>([]);
  const [expandedMealWhy, setExpandedMealWhy] = useState<MealBucket | null>(null);
  const [expandedMealCard, setExpandedMealCard] = useState<MealBucket | null>(null);
  const [showImprovementPoints, setShowImprovementPoints] = useState(false);
  const [focusModalBucket, setFocusModalBucket] = useState<MealBucket | null>(null);
  const [focusReminderTime, setFocusReminderTime] = useState('21:00');
  const [focusNote, setFocusNote] = useState('');
  const [llmSummaryLine, setLlmSummaryLine] = useState<string | null>(null);
  const [llmKeyLine, setLlmKeyLine] = useState<string | null>(null);
  const [llmActionLine, setLlmActionLine] = useState<string | null>(null);
  const [whyLine, setWhyLine] = useState<string | null>(null);
  const [actionSource, setActionSource] = useState<'ai' | 'fallback'>('fallback');
  const successChipAnim = React.useRef(new Animated.Value(0)).current;
  const [_openingMealBucket, setOpeningMealBucket] = useState<MealBucket | null>(null);

  const textAlign: 'left' | 'right' = I18nManager.isRTL ? 'right' : 'left';

  const todayStart = useMemo(() => {
    const n = new Date();
    const end = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 6, 0, 0, 0);
    if (n.getTime() < end.getTime()) end.setDate(end.getDate() - 1);
    return end;
  }, []);
  const yStart = useMemo(() => subDays(todayStart, 1), [todayStart]);
  const prevDayStart = useMemo(() => subDays(yStart, 1), [yStart]);
  const wStart = useMemo(() => subDays(yStart, 7), [yStart]);

  const getDayInsulinTotal = async (dayStart: Date): Promise<number> => {
    const s = new Date(dayStart);
    const e = addDays(new Date(dayStart), 1);
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

    const todayEpisodesList = buildMealEpisodes({
      bgRows: yList,
      treatments: (yTreatments as any[]) ?? [],
      hypo: glucoseSettings.hypo ?? 70,
      hyper: glucoseSettings.hyper ?? 180,
    });
    setTodayEpisodes(todayEpisodesList);
    const baselineEpisodes = buildMealEpisodes({
      bgRows: ((w as any) ?? []) as Row[],
      treatments: (wTreatments as any[]) ?? [],
      hypo: glucoseSettings.hypo ?? 70,
      hyper: glucoseSettings.hyper ?? 180,
    });

    setMealInvestigations(
      buildMealInvestigations({
        todayEpisodes: todayEpisodesList,
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

  const keyHighlightLine = useMemo(() => {
    // Positive-first framing: prioritize wins before any challenge signals.
    if (yTirPct >= 75) {
      return language === 'he'
        ? `נקודת האור: ${yTirPct}% זמן בטווח היעד אתמול.`
        : `Highlight: ${yTirPct}% time in target range yesterday.`;
    }

    if (tirDelta > 0) {
      return language === 'he'
        ? `נרשם שיפור של ${tirDelta}% ב-TIR לעומת השבוע האחרון.`
        : `You improved TIR by ${tirDelta}% vs the recent week.`;
    }

    if (lowDelta < 0) {
      return language === 'he'
        ? `הצלחת להפחית אירועי נמוך ב-${Math.abs(lowDelta)}% לעומת השבוע האחרון.`
        : `You reduced low events by ${Math.abs(lowDelta)}% vs the recent week.`;
    }

    if (highDelta < 0) {
      return language === 'he'
        ? `הצלחת להפחית ערכים גבוהים ב-${Math.abs(highDelta)}% לעומת השבוע האחרון.`
        : `You reduced high readings by ${Math.abs(highDelta)}% vs the recent week.`;
    }

    return language === 'he'
      ? `נקודת ייחוס חיובית: ${yTirPct}% מהזמן נשארת בטווח היעד.`
      : `Positive anchor: you stayed in target range ${yTirPct}% of the time.`;
  }, [highDelta, language, lowDelta, tirDelta, yTirPct]);
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

  const perfectMealPraise =
    language === 'he'
      ? 'מדהים! 100/100 — ניהול מצוין. מגיע לך להרגיש סיפוק וגאווה 👏'
      : 'Amazing! 100/100 — excellent management. You should feel proud 👏';

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const toggleMealCard = (bucket: MealBucket) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMealCard(prev => (prev === bucket ? null : bucket));
  };

  const parseReminderToTs = (hhmm: string) => {
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, min, 0, 0);
    return d.getTime();
  };

  const saveFocusPlan = async () => {
    if (!focusModalBucket) return;
    const item = mealComparisons.find(m => m.bucket === focusModalBucket);
    const reminderTs = parseReminderToTs(focusReminderTime);

    const memo = `ביום ${format(yStart, 'yyyy-MM-dd')}, ארוחת ${mealBucketLabel('he', focusModalBucket)} גרמה ל-Peak High של ${item?.avgRise ?? '-'} mg/dL. המשתמש הסיק: ${focusNote || 'ללא הערה'}. להשתמש בתובנה זו עבור ארוחות דומות.`;

    await addMemoryEntry({
      type: 'episode',
      tags: ['daily_review', 'plan_tomorrow', String(focusModalBucket)],
      textSummary: memo,
      facts: {
        bucket: focusModalBucket,
        score: item?.score ?? null,
        avgRise: item?.avgRise ?? null,
        note: focusNote,
        reminderTime: focusReminderTime,
      },
      source: 'user',
      confidence: 0.9,
      expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    });

    if (reminderTs) {
      await notifee.createTriggerNotification(
        {
          title: language === 'he' ? 'תזכורת: תכנון ארוחה' : 'Meal plan reminder',
          body: focusNote || (language === 'he' ? 'בדוק את תובנת האתמול לפני הארוחה.' : 'Review yesterday insight before meal.'),
          android: {channelId: 'hypo-alerts', smallIcon: 'ic_launcher'},
        },
        {type: TriggerType.TIMESTAMP, timestamp: reminderTs, alarmManager: false},
      );
    }

    setFocusModalBucket(null);
    setFocusNote('');
  };

  const exportDailyReviewDebugPackage = async () => {
    try {
      const ts = new Date().toISOString();
      const llmRequestContext = {
        yesterday: {
          tir: yTirPct,
          avg: yAvg,
          lows: yLows,
          highs: yHighs,
        },
        week: {
          tir: wTirPct,
          avg: wAvg,
          lows: wLows,
          highs: wHighs,
        },
        deltas: {
          tirDeltaVsWeek: yTirPct - wTirPct,
          avgDeltaVsWeek: yAvg - wAvg,
        },
        nightLows,
        fallback: {
          summaryLine: llmSummaryLine,
          keyLine: llmKeyLine,
          actionLine: llmActionLine,
          whyLine,
        },
        userProfile: null,
        language,
      };

      const bundle = {
        package: 'daily-review-debug',
        createdAt: ts,
        day: format(yStart, 'yyyy-MM-dd'),
        folders: {
          '00-manifest': {
            'manifest.json': {
              appScreen: 'DailyReviewScreen',
              actionSource,
              aiEnabled: aiSettings.enabled,
              model: aiSettings.openAiModel,
              language,
            },
          },
          '01-agent-instructions': {
            'system-instruction.txt': buildDailyBriefSystemInstruction(language as 'he' | 'en'),
            'language-guardrails.json': getDailyBriefLanguageGuardrails(),
            'llm-request-context.json': llmRequestContext,
            'llm-message-contract.json': {
              messages: [
                {role: 'system', source: 'dailyBrief.ts::buildDailyBriefSystemInstruction(lang)'},
                {role: 'user', source: 'dailyBrief.ts::Context payload', payload: llmRequestContext},
              ],
              expectedResponseKeys: [
                'empathic_opening',
                'clinical_validation',
                'tiny_habit_recommendation',
                'encouraging_closing',
              ],
              fallbackResponseKeys: ['summaryLine', 'keyLine', 'actionLine', 'whyLine'],
            },
          },
          '02-input-data': {
            'glucose-metrics.json': {
              yAvg,
              yTirPct,
              yLows,
              yHighs,
              week: {wAvg, wTirPct, wLows, wHighs},
            },
            'meal-comparisons.json': mealComparisons,
            'today-episodes.json': todayEpisodes,
          },
          '03-ai-output': {
            'daily-brief-lines.json': {
              summary: llmSummaryLine,
              key: llmKeyLine,
              action: llmActionLine,
              why: whyLine,
              source: actionSource,
            },
          },
          '04-rendered-state': {
            'ui-state.json': {
              topImprovedMeal,
              topDeclinedMeal,
              needsAttentionMeal,
              expandedMealCard,
              expandedMealWhy,
            },
          },
        },
      };

      const fullMessage = JSON.stringify(bundle, null, 2);
      const safeMessage =
        fullMessage.length > 180_000
          ? JSON.stringify(
              {
                ...bundle,
                truncated: true,
                note:
                  language === 'he'
                    ? 'החבילה קוצרה כי קובץ השיתוף היה גדול מדי.'
                    : 'Package was truncated because share payload was too large.',
                folders: {
                  ...bundle.folders,
                  '02-input-data': {
                    ...bundle.folders['02-input-data'],
                    'today-episodes.json': {
                      total: Array.isArray(todayEpisodes) ? todayEpisodes.length : 0,
                      sample: Array.isArray(todayEpisodes) ? todayEpisodes.slice(0, 25) : [],
                    },
                    'meal-comparisons.json': {
                      total: Array.isArray(mealComparisons) ? mealComparisons.length : 0,
                      sample: Array.isArray(mealComparisons) ? mealComparisons.slice(0, 25) : [],
                    },
                  },
                },
              },
              null,
              2,
            )
          : fullMessage;

      try {
        await Share.share({
          title: language === 'he' ? 'ייצוא דיבאג סיכום יומי' : 'Export daily review debug',
          message: safeMessage,
        });
        return;
      } catch (shareErr) {
        const minimal = JSON.stringify(
          {
            package: 'daily-review-debug-minimal',
            createdAt: ts,
            day: format(yStart, 'yyyy-MM-dd'),
            manifest: {
              appScreen: 'DailyReviewScreen',
              model: aiSettings.openAiModel,
              language,
            },
            instruction: buildDailyBriefSystemInstruction(language as 'he' | 'en'),
            guardrails: getDailyBriefLanguageGuardrails(),
            output: {
              summary: llmSummaryLine,
              key: llmKeyLine,
              action: llmActionLine,
              why: whyLine,
              source: actionSource,
            },
          },
          null,
          2,
        );

        await Share.share({
          title: language === 'he' ? 'ייצוא דיבאג (גרסה מינימלית)' : 'Debug export (minimal)',
          message: minimal,
        });

        Alert.alert(
          language === 'he' ? 'שים לב' : 'Notice',
          language === 'he'
            ? 'הייצוא המלא נכשל, נשלחה גרסה מינימלית לדיבאג.'
            : 'Full export failed, shared minimal debug package instead.',
        );
        return;
      }
    } catch (e: any) {
      Alert.alert(
        language === 'he' ? 'שגיאה' : 'Error',
        language === 'he'
          ? `ייצוא הדיבאג נכשל: ${String(e?.message ?? e)}`
          : `Debug export failed: ${String(e?.message ?? e)}`,
      );
    }
  };

  if (loading) {
    return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><ActivityIndicator /></View>;
  }

  const card = {backgroundColor: theme.white, borderRadius: 14, padding: 12};
  const targetMid = Math.round(((glucoseSettings.hypo ?? 70) + (glucoseSettings.hyper ?? 180)) / 2);
  const avgDistance = Math.abs(yAvg - targetMid);
  const avgScore = Math.max(0, Math.min(100, 100 - Math.round(avgDistance * 0.9)));
  const isHighDailyScore = avgScore >= 95;

  useEffect(() => {
    if (!isHighDailyScore) {
      successChipAnim.setValue(0);
      return;
    }

    successChipAnim.setValue(0);
    Animated.sequence([
      Animated.timing(successChipAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(successChipAnim, {
        toValue: 0.82,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(successChipAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isHighDailyScore, successChipAnim]);

  const nightLows = yRows.filter(r => {
    const ts = r?.dateString ? Date.parse(r.dateString) : NaN;
    if (!Number.isFinite(ts)) return false;
    const h = new Date(ts).getHours();
    const start = glucoseSettings.nightStartHour;
    const end = glucoseSettings.nightEndHour;
    const inNight = start <= end ? h >= start && h < end : h >= start || h < end;
    return inNight && (r.sgv ?? 0) < (glucoseSettings.hypo ?? 70);
  }).length;

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
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65), textAlign}}>
            {tr(language, 'common.date')}: {format(yStart, 'd/M HH:mm')} → {format(todayStart, 'd/M HH:mm')}
          </Text>
        </View>
        <View style={{width: 24}} />
      </View>

      <View style={{...card, backgroundColor: addOpacity(theme.accentColor, 0.08), borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.28)}}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>{language === 'he' ? 'בוקר טוב 🌤️' : 'Good morning 🌤️'}</Text>
        <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.78), textAlign}}>
          {language === 'he' ? 'הגוף שלך עבד קשה אתמול. הנה סיכום ברור ועדין כדי לעזור ליום רגוע יותר.' : 'Your body worked hard yesterday. Here is a calm, clear summary to support today.'}
        </Text>
      </View>

      <View style={{...card, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.3), backgroundColor: addOpacity(theme.accentColor, 0.06)}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>{language === 'he' ? 'מדד היום' : 'Today score'}</Text>
          <Text style={{fontWeight: '800', color: theme.accentColor}}>{avgScore}/100</Text>
        </View>

        {isHighDailyScore ? (
          <Animated.View
            style={{
              marginTop: 8,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: addOpacity(theme.inRangeColor, 0.35),
              backgroundColor: addOpacity(theme.inRangeColor, 0.12),
              opacity: successChipAnim.interpolate({inputRange: [0, 1], outputRange: [0.75, 1]}),
              transform: [
                {
                  scale: successChipAnim.interpolate({inputRange: [0, 1], outputRange: [0.985, 1]}),
                },
              ],
            }}
          >
            <MaterialIcons name="check-circle" size={18} color={theme.inRangeColor} />
            <Text style={{fontWeight: '800', color: theme.inRangeColor}}>
              {language === 'he' ? 'מעולה! עבודה עקבית שממש משתלמת 👏' : 'Excellent! Your consistency is paying off 👏'}
            </Text>
          </Animated.View>
        ) : null}

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
          {llmKeyLine || keyHighlightLine}
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

        <View style={{marginTop: 8, gap: 8}}>
          {topImprovedMeal ? (
            <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.35), backgroundColor: addOpacity(theme.accentColor, 0.08)}}>
              <Text style={{fontWeight: '800', color: theme.accentColor}}>
                {language === 'he' ? '✅ מה עבד טוב אתמול' : '✅ What worked well yesterday'}
              </Text>
              <View style={{marginTop: 4, flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
                <Text style={{color: theme.textColor}}>{mealBucketLabel(language, topImprovedMeal.bucket)}</Text>
                <Text style={{color: theme.textColor, writingDirection: 'ltr'}}>{topImprovedMeal.score}/100</Text>
                <Text style={{color: addOpacity(theme.textColor, 0.75)}}>{language === 'he' ? 'מול ממוצע שבועי' : 'vs weekly baseline'}</Text>
              </View>
              <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.78)}}>
                {topImprovedMeal.score >= 100
                  ? perfectMealPraise
                  : explainMealDelta(topImprovedMeal.bucket, topImprovedMeal.delta)}
              </Text>
            </View>
          ) : (
            <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.2), backgroundColor: addOpacity(theme.accentColor, 0.06)}}>
              <Text style={{fontWeight: '700', color: theme.textColor}}>
                {language === 'he'
                  ? 'שמנו דגש על מה שכן עבד. נקודות לשיפור זמינות למטה כשמתאים לך.'
                  : 'We focused on what worked. Improvement points are available below when you choose.'}
              </Text>
            </View>
          )}

          {(needsAttentionMeal || topDeclinedMeal) ? (
            <View>
              <Pressable
                onPress={() => setShowImprovementPoints(prev => !prev)}
                style={{paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.25), alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6}}
              >
                <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>
                  {language === 'he' ? 'נקודות לשיפור (כשמתאים לך)' : 'Improvement points (when you feel ready)'}
                </Text>
                <MaterialIcons name={showImprovementPoints ? 'expand-less' : 'expand-more'} size={16} color={addOpacity(theme.textColor, 0.8)} />
              </Pressable>

              {!showImprovementPoints ? null : (
                <View style={{marginTop: 8, gap: 8}}>
                  {needsAttentionMeal ? (
                    <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.borderColor || '#999', 0.45), backgroundColor: addOpacity(theme.white, 0.92)}}>
                      <Text style={{fontWeight: '800', color: theme.textColor}}>
                        {language === 'he' ? '🎯 כיוון עדין לשיפור בפעם הבאה' : '🎯 Gentle direction for next time'}
                      </Text>
                      <Text style={{marginTop: 4, color: theme.textColor}}>
                        {mealBucketLabel(language, needsAttentionMeal.bucket)} • {needsAttentionMeal.score}/100
                      </Text>
                      <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.74)}}>
                        {language === 'he'
                          ? `כשתרצה, אפשר לבדוק לעומק גם נתונים מדויקים יותר (כולל עלייה ממוצעת של ${needsAttentionMeal.avgRise} mg/dL).`
                          : `When you choose, you can review more detailed metrics too (including avg rise of ${needsAttentionMeal.avgRise} mg/dL).`}
                      </Text>
                    </View>
                  ) : null}

                  {topDeclinedMeal ? (
                    <View style={{padding: 10, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.borderColor || '#999', 0.45), backgroundColor: addOpacity(theme.white, 0.92)}}>
                      <Text style={{fontWeight: '800', color: theme.textColor}}>
                        {language === 'he' ? '🧩 נקודה ששווה לדייק' : '🧩 A point worth refining'}
                      </Text>
                      <View style={{marginTop: 4, flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
                        <Text style={{color: theme.textColor}}>{mealBucketLabel(language, topDeclinedMeal.bucket)}</Text>
                        <Text style={{color: addOpacity(theme.textColor, 0.8), writingDirection: 'ltr'}}>{`${topDeclinedMeal.score}/100`}</Text>
                      </View>
                      <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.78)}}>
                        {explainMealDelta(topDeclinedMeal.bucket, topDeclinedMeal.delta)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}
        </View>

        {mealComparisons.length ? (
          <View style={{marginTop: 8, gap: 8}}>
            {mealComparisons.map(item => {
              const delta = item.delta ?? 0;
              const improved = (item.delta ?? 0) > 0;
              const same = item.delta == null || item.delta === 0;
              const deltaColor = same ? addOpacity(theme.textColor, 0.6) : improved ? '#2e7d32' : '#c62828';
              const isExpanded = expandedMealCard === item.bucket;
              const isPerfectScore = item.score >= 100;
              const bucketEpisodes = todayEpisodes.filter(e => e.bucket === item.bucket);
              const peakHigh = bucketEpisodes.length
                ? Math.round(bucketEpisodes.reduce((s, e) => s + (e.peakBg ?? 0), 0) / bucketEpisodes.length)
                : null;
              const peakLow = bucketEpisodes.length
                ? Math.round(bucketEpisodes.reduce((s, e) => s + (e.lowBg ?? 0), 0) / bucketEpisodes.length)
                : null;
              const absorptionLabel = item.avgRise >= 90
                ? (language === 'he' ? 'עלייה מהירה אחרי ארוחה ⚡' : 'Fast post-meal rise ⚡')
                : item.avgRise <= 45
                ? (language === 'he' ? 'תגובה רגועה יותר ✅' : 'Steadier response ✅')
                : (language === 'he' ? 'תגובה בינונית 📊' : 'Moderate response 📊');
              return (
                <Pressable
                  key={item.bucket}
                  onPress={() => toggleMealCard(item.bucket)}
                  style={{borderWidth: 1, borderColor: addOpacity(theme.borderColor || '#999', 0.45), borderRadius: 14, padding: 11, backgroundColor: addOpacity(theme.white, 0.92)}}
                >
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={{fontWeight: '700', color: theme.textColor}}>
                      {mealBucketLabel(language, item.bucket)} - {item.representativeTs ? format(new Date(item.representativeTs), 'HH:mm') : '—'}
                    </Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                      <ScoreBadge score={item.score} />
                      <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={20} color={addOpacity(theme.textColor, 0.7)} />
                    </View>
                  </View>

                  {!isExpanded ? null : (
                    <View style={{marginTop: 10, gap: 8}}>
                      <View style={{height: 10, borderRadius: 99, backgroundColor: addOpacity(theme.textColor, 0.08), overflow: 'hidden', flexDirection: 'row'}}>
                        <View style={{width: `${Math.max(0, Math.min(100, item.avgLowPct))}%`, height: 10, backgroundColor: theme.belowRangeColor}} />
                        <View style={{width: `${Math.max(0, Math.min(100, item.avgTirPct))}%`, height: 10, backgroundColor: theme.inRangeColor, alignItems: 'center', justifyContent: 'center'}}>
                          {item.avgTirPct > 15 ? <Text style={{fontSize: 10, fontWeight: '800', color: '#fff'}}>{item.avgTirPct}%</Text> : null}
                        </View>
                        <View style={{width: `${Math.max(0, Math.min(100, item.avgHighPct))}%`, height: 10, backgroundColor: theme.aboveRangeColor}} />
                      </View>

                      <Text style={{fontSize: 11, color: addOpacity(theme.textColor, 0.62), writingDirection: 'ltr'}}>{`${item.avgLowPct}% • ${item.avgTirPct}% • ${item.avgHighPct}%`}</Text>
                      <View style={{padding: 8, borderRadius: 10, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.12)}}>
                        <Text style={{color: theme.textColor, fontWeight: '700'}}>{language === 'he' ? 'שיאי סוכר' : 'Glucose peaks'}</Text>
                        <Text style={{marginTop: 4, color: '#c62828', writingDirection: 'ltr'}}>{language === 'he' ? 'שיא גבוה (3ש): ' : 'Peak High (3h): '}{peakHigh ?? '—'} mg/dL</Text>
                        <Text style={{marginTop: 2, color: '#1565c0', writingDirection: 'ltr'}}>{language === 'he' ? 'שיא נמוך (4ש): ' : 'Peak Low (4h): '}{peakLow ?? '—'} mg/dL</Text>
                      </View>

                      <View style={{padding: 8, borderRadius: 10, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.12)}}>
                        <Text style={{color: theme.textColor, fontWeight: '700'}}>{language === 'he' ? 'איך הגוף הגיב לארוחה' : 'How your body responded'}</Text>
                        <Text style={{marginTop: 4, color: theme.textColor}}>{absorptionLabel}</Text>
                      </View>

                      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <Text style={{color: deltaColor, fontSize: 12, fontWeight: '700'}}>
                          <Text style={{writingDirection: 'ltr'}}>
                            {isPerfectScore
                              ? `${item.score}/100 👏`
                              : `${item.score} (${Math.abs(delta)}${delta >= 0 ? '+' : '-'} ${delta >= 0 ? '📈' : '📉'})`}
                          </Text>
                        </Text>
                        {item.score <= 55 ? (
                          <Pressable
                            onPress={() => {
                              setFocusModalBucket(item.bucket);
                              setFocusNote('');
                            }}
                            style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: addOpacity('#c62828', 0.12)}}
                          >
                            <Text style={{color: '#c62828', fontWeight: '800', fontSize: 12}}>{language === 'he' ? 'תכנן מחדש למחר' : 'Plan for tomorrow'}</Text>
                          </Pressable>
                        ) : <View />}
                      </View>

                      <View style={{flexDirection: 'row', gap: 8}}>
                        <Pressable
                          onPress={() => openMealBucketChart(item.bucket, item.representativeTs)}
                          style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.5)}}
                        >
                          <Text style={{color: theme.accentColor, fontWeight: '700', fontSize: 12}}>
                            {language === 'he' ? 'פתח גרף' : 'Open chart'}
                          </Text>
                        </Pressable>

                        {!isPerfectScore ? (
                          <Pressable
                            onPress={() => setExpandedMealWhy(prev => (prev === item.bucket ? null : item.bucket))}
                            style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.35)}}
                          >
                            <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>
                              {language === 'he' ? 'למה זה השתנה?' : 'Why did this change?'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {isPerfectScore ? (
                        <View style={{marginTop: 4, padding: 10, borderRadius: 10, backgroundColor: addOpacity(theme.accentColor, 0.08), borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.2)}}>
                          <Text style={{color: theme.textColor}}>{perfectMealPraise}</Text>
                        </View>
                      ) : expandedMealWhy === item.bucket ? (
                        <View style={{marginTop: 4, padding: 10, borderRadius: 10, backgroundColor: addOpacity(theme.accentColor, 0.08), borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.2)}}>
                          <Text style={{color: theme.textColor}}>{explainMealDelta(item.bucket, item.delta)}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </Pressable>
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

      <Pressable onPress={exportDailyReviewDebugPackage} style={{...card, alignItems: 'center', borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.35)}}>
        <Text style={{fontWeight: '700', color: theme.accentColor}}>{language === 'he' ? 'הורד לוגי דיבאג של ניתוח יומי' : 'Download daily analysis debug logs'}</Text>
        <Text style={{marginTop: 4, fontSize: 12, color: addOpacity(theme.textColor, 0.65), textAlign: 'center'}}>
          {language === 'he' ? 'כולל קלט, פלט AI, חישובים ומצב UI בקובץ JSON מסודר בתיקיות לוגיות.' : 'Includes input, AI output, scoring and UI state in a structured JSON package.'}
        </Text>
      </Pressable>

      {!!(aiSettings.enabled && (aiSettings.apiKey || '').trim()) && (
        <Pressable onPress={handleRegenerate} disabled={refreshingAction} style={{...card, alignItems: 'center'}}>
          <Text style={{fontWeight: '700', color: theme.textColor}}>{refreshingAction ? tr(language, 'dailyReview.refreshing') : tr(language, 'dailyReview.refresh')}</Text>
        </Pressable>
      )}

      <Modal visible={!!focusModalBucket} transparent animationType="fade" onRequestClose={() => setFocusModalBucket(null)}>
        <View style={{flex: 1, backgroundColor: addOpacity('#000', 0.35), justifyContent: 'center', padding: 18}}>
          <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 14}}>
            <Text style={{fontWeight: '900', color: theme.textColor}}>{language === 'he' ? 'תכנן מחדש למחר' : 'Plan for tomorrow'}</Text>
            <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.72)}}>{language === 'he' ? 'שעת תזכורת (HH:MM)' : 'Reminder time (HH:MM)'}</Text>
            <TextInput value={focusReminderTime} onChangeText={setFocusReminderTime} style={{marginTop: 6, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.2), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: theme.textColor}} />
            <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.72)}}>{language === 'he' ? 'תובנה אישית' : 'Personal note'}</Text>
            <TextInput value={focusNote} onChangeText={setFocusNote} multiline style={{marginTop: 6, minHeight: 72, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.2), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: theme.textColor, textAlignVertical: 'top'}} />
            <View style={{marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8}}>
              <Pressable onPress={() => setFocusModalBucket(null)} style={{paddingVertical: 8, paddingHorizontal: 10}}>
                <Text style={{color: addOpacity(theme.textColor, 0.75)}}>{language === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={saveFocusPlan} style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: addOpacity(theme.accentColor, 0.18)}}>
                <Text style={{color: theme.accentColor, fontWeight: '800'}}>{language === 'he' ? 'שמור' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default DailyReviewScreen;

