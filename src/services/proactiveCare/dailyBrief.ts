import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, RepeatFrequency, TriggerType} from '@notifee/react-native';

import {fetchBgDataForDateRangeUncached, fetchTreatmentsForDateRangeUncached} from 'app/api/apiRequests';
import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {getStoredAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr, Lang} from 'app/i18n/translations';
import {OpenAIProvider} from 'app/services/llm/providers/openaiProvider';
import {computeRank} from 'app/services/proactiveCare/streakRank';

const CHANNEL_ID = 'daily-briefs';
const NOTIFICATION_ID = 'daily-brief-notification';

const STORAGE_KEYS = {
  lastDeliveredDate: 'proactiveCare:dailyBrief:lastDeliveredDate',
  latestBrief: 'proactiveCare:dailyBrief:latestBrief',
  userProfile: 'proactiveCare:dailyBrief:userProfile:v1',
};

export type DailyBriefConfig = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export type DailyBriefAiOptions = {
  enabled: boolean;
  apiKey?: string;
  model?: string;
};

type StoredBrief = {
  title: string;
  body: string;
  source: 'ai' | 'fallback';
  createdAt: string;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getLastCompletedWindow(now: Date, anchorHour: number) {
  const end = new Date(now);
  end.setHours(anchorHour, 0, 0, 0);
  if (now.getTime() < end.getTime()) end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return {start, end};
}

function nextScheduledTime(now: Date, hour: number, minute: number): Date {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

function clampInt(n: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isNightHour(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

async function ensureChannel(lang: Lang) {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: tr(lang, 'brief.channelName'),
    importance: AndroidImportance.DEFAULT,
  });
}

async function persistLatestBrief(brief: Omit<StoredBrief, 'createdAt'>) {
  await AsyncStorage.setItem(
    STORAGE_KEYS.latestBrief,
    JSON.stringify({...brief, createdAt: new Date().toISOString()}),
  );
}

export async function getLatestDailyBrief(): Promise<StoredBrief | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.latestBrief);
    if (!raw) return null;
    return JSON.parse(raw) as StoredBrief;
  } catch {
    return null;
  }
}

type PeriodStats = {
  tir: number;
  avg: number;
  lows: number;
  highs: number;
  inRange: number;
  count: number;
  upMoves: number;
  downMoves: number;
};

type HolisticSignals = {
  reboundEpisodes: number;
  severeLowEvents: number;
  preBolusMissingMeals: number;
  preBolusCoveragePct: number;
  correctionBolusCount: number;
  mealsWithResponsibleCorrectionCount: number;
  followUpChecksAfterHighCount: number;
};

type DailyProfile = {
  updatedAt: string;
  dominantRisk: 'lows' | 'highs' | 'balanced';
  avgTir7d: number;
  avgGlucose7d: number;
  grammaticalGender?: 'female' | 'male';
};

function calcStats(list: any[], hypo: number, hyper: number): PeriodStats {
  if (!list.length) {
    return {tir: 0, avg: 0, lows: 0, highs: 0, inRange: 0, count: 0, upMoves: 0, downMoves: 0};
  }

  const lows = list.filter(r => (r.sgv ?? 0) < hypo).length;
  const highs = list.filter(r => (r.sgv ?? 0) > hyper).length;
  const inRange = list.filter(r => (r.sgv ?? 0) >= hypo && (r.sgv ?? 0) <= hyper).length;
  const avg = Math.round(list.reduce((s, r) => s + (r.sgv ?? 0), 0) / list.length);
  const tir = Math.round((inRange / list.length) * 100);

  let upMoves = 0;
  let downMoves = 0;
  for (let i = 1; i < list.length; i += 1) {
    const prev = Number(list[i - 1]?.sgv ?? 0);
    const cur = Number(list[i]?.sgv ?? 0);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    if (cur > prev) upMoves += 1;
    if (cur < prev) downMoves += 1;
  }

  return {tir, avg, lows, highs, inRange, count: list.length, upMoves, downMoves};
}

function computeHolisticSignals(params: {
  yList: any[];
  yTreatments: any[];
  hypo: number;
  hyper: number;
}): HolisticSignals {
  const {yList, yTreatments, hypo, hyper} = params;

  const severeLowEvents = yList.filter(r => Number(r?.sgv ?? 0) <= 54).length;

  const reboundEpisodes = yList.filter((row, idx) => {
    const cur = Number(row?.sgv ?? 0);
    if (cur > hypo) return false;
    const t0 = Number(row?.date ?? 0);
    if (!Number.isFinite(t0) || t0 <= 0) return false;
    for (let i = idx + 1; i < yList.length; i += 1) {
      const nextTs = Number(yList[i]?.date ?? 0);
      if (!Number.isFinite(nextTs) || nextTs <= t0) continue;
      if (nextTs - t0 > 3 * 60 * 60 * 1000) break;
      if (Number(yList[i]?.sgv ?? 0) >= hyper) return true;
    }
    return false;
  }).length;

  const meals = (yTreatments ?? []).filter(t => Number(t?.carbs ?? 0) > 0).map(t => ({
    ts: Date.parse(String(t?.created_at ?? '')),
  })).filter(m => Number.isFinite(m.ts));

  const boluses = (yTreatments ?? [])
    .filter(t => Number(t?.insulin ?? 0) > 0)
    .map(t => ({
      ts: Date.parse(String(t?.created_at ?? '')),
      eventType: String(t?.eventType ?? ''),
    }))
    .filter(b => Number.isFinite(b.ts));

  let preBolusDetected = 0;
  for (const meal of meals) {
    const hasPre = boluses.some(b => b.ts <= meal.ts && b.ts >= meal.ts - 25 * 60 * 1000);
    if (hasPre) preBolusDetected += 1;
  }

  const preBolusMissingMeals = Math.max(0, meals.length - preBolusDetected);
  const preBolusCoveragePct = meals.length ? Math.round((preBolusDetected / meals.length) * 100) : 0;

  const correctionBoluses = boluses.filter(b => {
    const type = b.eventType.toLowerCase();
    return type.includes('correction') || type.includes('bolus');
  });
  const correctionBolusCount = correctionBoluses.length;

  let mealsWithResponsibleCorrectionCount = 0;
  for (const meal of meals) {
    const corrected = correctionBoluses.some(
      b => b.ts >= meal.ts + 20 * 60 * 1000 && b.ts <= meal.ts + 3 * 60 * 60 * 1000,
    );
    if (corrected) {
      mealsWithResponsibleCorrectionCount += 1;
    }
  }

  let followUpChecksAfterHighCount = 0;
  for (let i = 0; i < yList.length; i += 1) {
    const cur = Number(yList[i]?.sgv ?? 0);
    const t0 = Number(yList[i]?.date ?? 0);
    if (!Number.isFinite(t0) || cur <= hyper) continue;

    let checks = 0;
    for (let j = i + 1; j < yList.length; j += 1) {
      const nextTs = Number(yList[j]?.date ?? 0);
      if (!Number.isFinite(nextTs) || nextTs <= t0) continue;
      if (nextTs - t0 > 2 * 60 * 60 * 1000) break;
      checks += 1;
    }
    if (checks >= 3) followUpChecksAfterHighCount += 1;
  }

  return {
    reboundEpisodes,
    severeLowEvents,
    preBolusMissingMeals,
    preBolusCoveragePct,
    correctionBolusCount,
    mealsWithResponsibleCorrectionCount,
    followUpChecksAfterHighCount,
  };
}

async function readDailyProfile(): Promise<DailyProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.userProfile);
    return raw ? (JSON.parse(raw) as DailyProfile) : null;
  } catch {
    return null;
  }
}

async function writeDailyProfile(profile: DailyProfile) {
  await AsyncStorage.setItem(STORAGE_KEYS.userProfile, JSON.stringify(profile));
}

async function buildFallbackBrief(glucose: GlucoseSettings, lang: Lang) {
  const now = new Date();
  const {start: windowStart, end: windowEnd} = getLastCompletedWindow(now, 6);
  const weekStart = new Date(windowStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [yRows, wRows, yTreatments] = await Promise.all([
    fetchBgDataForDateRangeUncached(windowStart, windowEnd, {throwOnError: false}),
    fetchBgDataForDateRangeUncached(weekStart, windowStart, {throwOnError: false}),
    fetchTreatmentsForDateRangeUncached(windowStart, windowEnd),
  ]);

  const yList = ((yRows as any[]) ?? []).sort((a, b) => Number(a?.date ?? 0) - Number(b?.date ?? 0));
  const wList = ((wRows as any[]) ?? []).sort((a, b) => Number(a?.date ?? 0) - Number(b?.date ?? 0));

  if (!yList.length) {
    return {
      title: tr(lang, 'brief.title'),
      nightLine: tr(lang, 'brief.noDataNight'),
      summaryLine: tr(lang, 'brief.noDataYesterday'),
      keyLine: lang === 'he' ? '🔎 מה זה אומר: אין מספיק נתונים כדי לזהות דפוס יומי.' : '🔎 What stands out: not enough data to identify a daily pattern.',
      actionLine: tr(lang, 'brief.actionCollect'),
      whyLine: tr(lang, 'brief.whyTirAvg', {tir: 0, avg: 0}),
      source: 'fallback' as const,
      stats: {yesterday: {tir: 0, avg: 0, lows: 0, highs: 0, inRange: 0, count: 0, upMoves: 0, downMoves: 0}, week: {tir: 0, avg: 0, lows: 0, highs: 0, inRange: 0, count: 0, upMoves: 0, downMoves: 0}, nightLows: 0, tirDeltaVsWeek: 0, avgDeltaVsWeek: 0, holisticSignals: {reboundEpisodes: 0, severeLowEvents: 0, preBolusMissingMeals: 0, preBolusCoveragePct: 0, correctionBolusCount: 0, mealsWithResponsibleCorrectionCount: 0, followUpChecksAfterHighCount: 0}, sleepScore: 0},
    };
  }

  const hypo = glucose.hypo ?? 70;
  const hyper = glucose.hyper ?? 180;

  const yStats = calcStats(yList, hypo, hyper);
  const wStats = calcStats(wList, hypo, hyper);
  const holisticSignals = computeHolisticSignals({
    yList,
    yTreatments: (yTreatments as any[]) ?? [],
    hypo,
    hyper,
  });

  const nightRows = yList.filter(r => {
    const ds = r?.dateString;
    if (!ds) return false;
    return isNightHour(new Date(ds).getHours(), glucose.nightStartHour, glucose.nightEndHour);
  });
  const nightLows = nightRows.filter(r => (r.sgv ?? 0) < hypo).length;

  const tirDeltaVsWeek = yStats.tir - wStats.tir;
  const avgDeltaVsWeek = yStats.avg - wStats.avg;

  const rank = computeRank({tir: yStats.tir, lows: yStats.lows, highs: yStats.highs});

  const nightLine = nightLows > 0 ? tr(lang, 'brief.nightLows', {count: nightLows}) : tr(lang, 'brief.nightStable');
  const summaryLine = `${tr(lang, 'brief.yesterdayTir', {tir: yStats.tir, tier: rank.tier})} | ${lang === 'he' ? `Δשבוע TIR ${tirDeltaVsWeek >= 0 ? '+' : ''}${tirDeltaVsWeek}% | Δממוצע ${avgDeltaVsWeek >= 0 ? '+' : ''}${avgDeltaVsWeek}` : `Δ7d TIR ${tirDeltaVsWeek >= 0 ? '+' : ''}${tirDeltaVsWeek}% | ΔAvg ${avgDeltaVsWeek >= 0 ? '+' : ''}${avgDeltaVsWeek}`}`;

  const keyLine = ensurePrefix(
    ensureEffortFirstOpening(
      lang === 'he'
        ? `מה עבד: נשמר TIR של ${yStats.tir}% — זו עבודה טובה ביום מורכב.`
        : `What worked: you kept ${yStats.tir}% TIR — solid work on a demanding day.`,
      lang,
      holisticSignals,
      undefined,
    ),
    '🔎',
  );

  let actionLine =
    lang === 'he'
      ? '🎯 פעולה קטנה להיום: בחר פעולה אחת פשוטה לפני השינה והכן אותה מראש.'
      : '🎯 One tiny step for today: pick one simple bedtime action and prepare it in advance.';

  if (nightLows > 0 || yStats.lows >= 2) {
    actionLine =
      lang === 'he'
        ? '🎯 פעולה קטנה להיום: כשאתה מתארגן לשינה, שים ליד המיטה 15 גרם פחמימה מדודה מראש.'
        : '🎯 Tiny step: when getting ready for bed, place a pre-measured 15g carb by your bedside.';
  } else if (yStats.highs > yStats.inRange * 0.25) {
    actionLine =
      lang === 'he'
        ? '🎯 פעולה קטנה להיום: לפני הארוחה המאתגרת הבאה, עצור לדקה לתכנון קצר (מתי וכמה).' 
        : '🎯 Tiny step: before your next challenging meal, pause for one minute to plan timing and dose.';
  }

  const whyLine =
    nightLows > 0
      ? lang === 'he'
        ? `🧠 היו ${nightLows} ירידות לילה — זה מתיש, וזו תגובה טבעית של הגוף. אנחנו מתקדמים בצעדים קטנים.`
        : `🧠 There were ${nightLows} night lows — that is exhausting, and your body response is natural. We move in small steps.`
      : yStats.lows > 0
      ? lang === 'he'
        ? `🧠 היו ${yStats.lows} אירועי נמוך. זה מאתגר, ולא אומר שנכשלת — רק שצריך התאמה עדינה.`
        : `🧠 There were ${yStats.lows} low events. This is challenging and not a personal failure — just a signal for small adjustment.`
      : lang === 'he'
      ? `🧠 הגוף שמר על יציבות יחסית. נמשיך באותה גישה רגועה.`
      : `🧠 Your body stayed relatively steady. We’ll continue with the same calm approach.`;

  const sleepScore = Math.max(
    0,
    Math.min(
      100,
      100 - nightLows * 12 - holisticSignals.severeLowEvents * 18 - holisticSignals.reboundEpisodes * 8,
    ),
  );

  return {
    title: tr(lang, 'brief.title'),
    nightLine,
    summaryLine,
    keyLine,
    actionLine,
    whyLine,
    source: 'fallback' as const,
    stats: {
      yesterday: yStats,
      week: wStats,
      nightLows,
      tirDeltaVsWeek,
      avgDeltaVsWeek,
      holisticSignals,
      sleepScore,
    },
  };
}

type LlmDailySections = {
  summaryLine: string;
  keyLine: string;
  actionLine: string;
  whyLine: string;
  source: 'ai' | 'fallback';
};

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(n)}`;
}

function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function compactDeltaLine(params: {
  lang: Lang;
  labelHe: string;
  labelEn: string;
  value: string;
  delta: number;
  betterWhenLower?: boolean;
  emoji?: string;
}) {
  const {lang, labelHe, labelEn, value, delta, betterWhenLower = false, emoji = '•'} = params;
  const improved = betterWhenLower ? delta < 0 : delta > 0;
  const worsened = betterWhenLower ? delta > 0 : delta < 0;
  const trend = improved ? (lang === 'he' ? 'שיפור' : 'improved') : worsened ? (lang === 'he' ? 'ירידה' : 'declined') : lang === 'he' ? 'ללא שינוי' : 'unchanged';
  const deltaText = signed(delta);
  return lang === 'he'
    ? `${emoji} ${labelHe}: ${value} (${trend} ${deltaText})`
    : `${emoji} ${labelEn}: ${value} (${trend} ${deltaText})`;
}

function buildCompactBody(params: {
  lang: Lang;
  base: Awaited<ReturnType<typeof buildFallbackBrief>>;
  llm: LlmDailySections;
}) {
  const {lang, base, llm} = params;
  const y = base.stats.yesterday;
  const w = base.stats.week;

  const yLowPct = pct(y.lows, y.count);
  const yHighPct = pct(y.highs, y.count);
  const wLowPct = pct(w.lows, w.count);
  const wHighPct = pct(w.highs, w.count);

  const lowDelta = yLowPct - wLowPct;
  const highDelta = yHighPct - wHighPct;
  const tirDelta = base.stats.tirDeltaVsWeek;
  const avgDelta = base.stats.avgDeltaVsWeek;

  return [
    // 4-step psychological structure (always first)
    sanitizeEmpathicLanguage(llm.summaryLine),
    sanitizeEmpathicLanguage(llm.keyLine),
    sanitizeEmpathicLanguage(llm.actionLine),
    sanitizeEmpathicLanguage(llm.whyLine),

    // Compact metrics afterward
    compactDeltaLine({
      lang,
      labelHe: 'ממוצע יומי',
      labelEn: 'Daily avg',
      value: `${y.avg} mg/dL`,
      delta: avgDelta,
      betterWhenLower: true,
      emoji: '🟢',
    }),
    compactDeltaLine({
      lang,
      labelHe: 'TIR',
      labelEn: 'TIR',
      value: `${y.tir}%`,
      delta: tirDelta,
      emoji: '🎯',
    }),
    `${lang === 'he' ? '😴 ציון שינה' : '😴 Sleep score'}: ${(base.stats as any).sleepScore ?? 0}/100`,
    compactDeltaLine({
      lang,
      labelHe: 'נמוכים',
      labelEn: 'Lows',
      value: `${yLowPct}%`,
      delta: lowDelta,
      betterWhenLower: true,
      emoji: '🟣',
    }),
    compactDeltaLine({
      lang,
      labelHe: 'גבוהים',
      labelEn: 'Highs',
      value: `${yHighPct}%`,
      delta: highDelta,
      betterWhenLower: true,
      emoji: '🟠',
    }),
  ].join('\n');
}

const LLM_DAILY_TIMEOUT_MS = 20_000;
const LLM_DAILY_MAX_ATTEMPTS = 2;

function parseJsonObject(text: string): any | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function ensurePrefix(line: string, prefix: string): string {
  const text = line.trim();
  if (!text) return text;
  return text.startsWith(prefix) ? text : `${prefix} ${text}`;
}

const BANNED_HE_WORDS: Array<[RegExp, string]> = [
  [/החמרה/g, 'ירידה לעומת השבוע'],
  [/מסוכנ(?:ים|ת|ות)?/g, 'דורש תשומת לב'],
  [/כישלון/g, 'אתגר'],
  [/חוסר ציות/g, 'קושי בהתמדה'],
  [/שליטה גרועה/g, 'איזון מאתגר'],
  [/אתה חייב/g, 'אפשר לנסות'],
  [/את צריכה/g, 'אפשר לנסות'],
  [/אתה צריך/g, 'אפשר לנסות'],
];

function sanitizeEmpathicLanguage(line: string): string {
  let out = line;
  for (const [rx, replacement] of BANNED_HE_WORDS) {
    out = out.replace(rx, replacement);
  }
  return out;
}

function hasEffortSignals(signals: HolisticSignals): boolean {
  return (
    (signals.correctionBolusCount ?? 0) > 0 ||
    (signals.mealsWithResponsibleCorrectionCount ?? 0) > 0 ||
    (signals.followUpChecksAfterHighCount ?? 0) > 0
  );
}

function effortPraisePrefix(params: {
  lang: Lang;
  signals: HolisticSignals;
  gender?: DailyProfile['grammaticalGender'];
}): string {
  const {lang, signals, gender} = params;

  if (lang === 'he') {
    const roleWord = gender === 'female' ? 'אחראית' : gender === 'male' ? 'אחראי' : 'אחראי/ת';
    const evidenceBits: string[] = [];

    if ((signals.mealsWithResponsibleCorrectionCount ?? 0) > 0) {
      evidenceBits.push('ביצעת תיקון אחרי ארוחה מאתגרת');
    }
    if ((signals.followUpChecksAfterHighCount ?? 0) > 0) {
      evidenceBits.push('והמשכת מעקב עם בדיקות חוזרות אחרי עלייה');
    }
    if (evidenceBits.length === 0 && (signals.correctionBolusCount ?? 0) > 0) {
      evidenceBits.push('ביצעת תיקון כשצריך');
    }

    const evidence = evidenceBits.join(' ');
    return evidence
      ? `👏 כל הכבוד על איך שניהלת את זה בצורה ${roleWord}: ${evidence}.`
      : `👏 כל הכבוד על הניהול ה${roleWord} שלך בפועל.`;
  }

  const evidenceBitsEn: string[] = [];
  if ((signals.mealsWithResponsibleCorrectionCount ?? 0) > 0) {
    evidenceBitsEn.push('you corrected after a challenging meal');
  }
  if ((signals.followUpChecksAfterHighCount ?? 0) > 0) {
    evidenceBitsEn.push('and followed up with repeated checks after a rise');
  }
  if (evidenceBitsEn.length === 0 && (signals.correctionBolusCount ?? 0) > 0) {
    evidenceBitsEn.push('you made a correction when needed');
  }

  const evidence = evidenceBitsEn.join(' ');
  return evidence
    ? `👏 Great job on the way you handled this in practice: ${evidence}.`
    : '👏 Great job on your active and responsible self-management.';
}

function ensureEffortFirstOpening(
  line: string,
  lang: Lang,
  signals: HolisticSignals,
  gender?: DailyProfile['grammaticalGender'],
): string {
  const cleaned = line.trim();
  if (!hasEffortSignals(signals)) return cleaned;

  const low = cleaned.toLowerCase();
  const alreadyAffirming =
    low.includes('כל הכבוד') ||
    low.includes('ניהלת') ||
    low.includes('great job') ||
    low.includes('handled this');

  if (alreadyAffirming) return cleaned;
  return `${effortPraisePrefix({lang, signals, gender})} ${cleaned}`.trim();
}

export function buildDailyBriefSystemInstruction(lang: Lang): string {
  const core = [
    'Return JSON only.',
    'Return EXACTLY this 4-step psychological schema with these keys: empathic_opening, clinical_validation, tiny_habit_recommendation, encouraging_closing.',
    'Do not omit keys. Do not add narrative outside JSON.',
    'Fallback keys allowed only for compatibility: summaryLine, keyLine, actionLine, whyLine.',
    'Step intent: empathic_opening=affirm effort with empathy, clinical_validation=normalize physiology and remove blame, tiny_habit_recommendation=one tiny actionable habit, encouraging_closing=brief hopeful close.',
    'Persona: empathetic diabetes coach for people living with type 1 diabetes.',
    'Use motivational interviewing tone (affirmation + reflection + one tiny next step).',
    'Never use blame/fear words (failure, dangerous, non-compliant, worsening).',
    'Do not punish success: if a meal improved, start by highlighting that concrete improvement.',
    'If effort signals exist (follow-up checks and/or correction insulin), the opening MUST start with explicit praise for responsibility before discussing high glucose.',
    'Praise must be evidence-based and concrete (mention the actual action), not exaggerated or generic.',
    'Analyze sequence links: if low BG is followed by high BG within ~3h, frame it as likely rebound physiology (not personal failure).',
    'Use preBolus signals: when preBolus coverage is low/missing, recommend one tiny habit (example: 5 minutes pre-bolus cue) instead of complex recalculation.',
    'Keep language soft, non-judgmental, and practical. Suggest exactly one micro-habit action.',
  ].join(' ');

  if (lang === 'he') {
    return `${core} Keep the final user-facing wording in Hebrew, simple and warm.`;
  }

  return core;
}

export function getDailyBriefLanguageGuardrails() {
  return {
    bannedHebrew: BANNED_HE_WORDS.map(([rx, replacement]) => ({pattern: rx.source, replacement})),
    requiredStructure: ['empathic_opening','clinical_validation','tiny_habit_recommendation','encouraging_closing'],
    fallbackStructure: ['summaryLine','keyLine','actionLine','whyLine'],
  } as const;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function maybeGenerateLlmSections(params: {
  base: Awaited<ReturnType<typeof buildFallbackBrief>>;
  ai?: DailyBriefAiOptions;
  lang: Lang;
  profile: DailyProfile | null;
}): Promise<LlmDailySections> {
  const {base, ai, lang, profile} = params;
  const apiKey = (ai?.apiKey ?? '').trim();

  const fallback: LlmDailySections = {
    summaryLine: base.summaryLine,
    keyLine: base.keyLine,
    actionLine: base.actionLine,
    whyLine: base.whyLine,
    source: 'fallback',
  };

  if (!ai?.enabled || !apiKey) return fallback;

  const provider = new OpenAIProvider({apiKey});
  const model = (ai?.model ?? 'gpt-5.4').trim() || 'gpt-5.4';

  const instruction = buildDailyBriefSystemInstruction(lang);

  for (let attempt = 1; attempt <= LLM_DAILY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await withTimeout(
        provider.sendChat({
          model,
          messages: [
            {role: 'system', content: instruction},
            {
              role: 'user',
              content: `Context:\n${JSON.stringify({
                yesterday: base.stats.yesterday,
                week: base.stats.week,
                deltas: {
                  tirDeltaVsWeek: base.stats.tirDeltaVsWeek,
                  avgDeltaVsWeek: base.stats.avgDeltaVsWeek,
                },
                nightLows: base.stats.nightLows,
                holisticSignals: (base.stats as any).holisticSignals,
                derivedFocus: {
                  topImprovedMealDelta: base.stats.tirDeltaVsWeek,
                  weeklyImprovementAnchor: base.stats.tirDeltaVsWeek > 0 ? `TIR +${base.stats.tirDeltaVsWeek}%` : `TIR ${base.stats.tirDeltaVsWeek}%`,
                },
                fallback: {
                  summaryLine: base.summaryLine,
                  keyLine: base.keyLine,
                  actionLine: base.actionLine,
                  whyLine: base.whyLine,
                },
                userProfile: profile,
                language: lang,
              })}`,
            },
          ],
          temperature: attempt === 1 ? 0.4 : 0.2,
          maxOutputTokens: 260,
        }),
        LLM_DAILY_TIMEOUT_MS,
        'Daily brief LLM call',
      );

      const payload = parseJsonObject((res.content ?? '').trim());
      if (!payload) continue;

      const summaryRaw = String(payload.empathic_opening ?? payload.summaryLine ?? '').trim();
      const keyRaw = String(payload.clinical_validation ?? payload.keyLine ?? '').trim();
      const actionRaw = String(payload.tiny_habit_recommendation ?? payload.actionLine ?? '').trim();
      const whyRaw = String(payload.encouraging_closing ?? payload.whyLine ?? '').trim();

      const summaryLine = ensurePrefix(
        ensureEffortFirstOpening(
          sanitizeEmpathicLanguage(summaryRaw || base.summaryLine),
          lang,
          (base.stats as any).holisticSignals,
          profile?.grammaticalGender,
        ),
        '📊',
      );
      const keyLine = ensurePrefix(sanitizeEmpathicLanguage(keyRaw || base.keyLine), '🔎');
      const actionLine = ensurePrefix(sanitizeEmpathicLanguage(actionRaw || base.actionLine), '🎯');
      const whyLine = ensurePrefix(sanitizeEmpathicLanguage(whyRaw || base.whyLine), '🧠');

      if (!summaryLine || !keyLine || !actionLine || !whyLine) continue;

      return {
        summaryLine,
        keyLine,
        actionLine,
        whyLine,
        source: 'ai',
      };
    } catch {
      // Retry once on timeout/transient/parse errors.
    }
  }

  return fallback;
}

async function computeYesterdayBrief(glucose: GlucoseSettings, lang: Lang, ai?: DailyBriefAiOptions) {
  const base = await buildFallbackBrief(glucose, lang);
  const prevProfile = await readDailyProfile();

  const dominantRisk: DailyProfile['dominantRisk'] =
    base.stats.yesterday.lows > base.stats.yesterday.highs
      ? 'lows'
      : base.stats.yesterday.highs > base.stats.yesterday.lows
      ? 'highs'
      : 'balanced';

  const nextProfile: DailyProfile = {
    updatedAt: new Date().toISOString(),
    dominantRisk,
    avgTir7d: base.stats.week.tir,
    avgGlucose7d: base.stats.week.avg,
  };
  await writeDailyProfile(nextProfile);

  const llm = await maybeGenerateLlmSections({base, ai, lang, profile: prevProfile ?? nextProfile});

  return {
    title: base.title,
    body: buildCompactBody({lang, base, llm}),
    source: llm.source === 'ai' ? 'ai' : base.source,
  } as const;
}

export async function regenerateDailyBrief(params: {
  glucose: GlucoseSettings;
  ai?: DailyBriefAiOptions;
  notify?: boolean;
}) {
  const lang = (await getStoredAppLanguage()) as Lang;
  await ensureChannel(lang);

  const brief = await computeYesterdayBrief(params.glucose, lang, params.ai);
  await persistLatestBrief({title: brief.title, body: brief.body, source: brief.source});

  if (params.notify) {
    await notifee.displayNotification({
      id: `${NOTIFICATION_ID}-manual-${Date.now()}`,
      title: brief.title,
      body: brief.body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {route: 'DailyReviewScreen', source: 'daily_brief_manual'},
    });
  }

  return brief;
}

export async function sendDailyBriefNow(glucose: GlucoseSettings, ai?: DailyBriefAiOptions) {
  await regenerateDailyBrief({glucose, ai, notify: true});
}

export async function syncDailyBriefNotifications(params: {
  config: DailyBriefConfig;
  glucose: GlucoseSettings;
  ai?: DailyBriefAiOptions;
}) {
  const lang = (await getStoredAppLanguage()) as Lang;
  const hour = clampInt(params.config.hour, 8, 0, 23);
  const minute = clampInt(params.config.minute, 0, 0, 59);

  await ensureChannel(lang);
  await notifee.cancelNotification(NOTIFICATION_ID);
  if (!params.config.enabled) return;

  const now = new Date();
  const todayKey = ymd(now);
  const todaySchedule = new Date(now);
  todaySchedule.setHours(hour, minute, 0, 0);

  const lastDelivered = await AsyncStorage.getItem(STORAGE_KEYS.lastDeliveredDate);
  if (now.getTime() >= todaySchedule.getTime() && lastDelivered !== todayKey) {
    await regenerateDailyBrief({glucose: params.glucose, ai: params.ai, notify: true});
    await AsyncStorage.setItem(STORAGE_KEYS.lastDeliveredDate, todayKey);
  }

  const nextTs = nextScheduledTime(new Date(), hour, minute);
  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID,
      title: tr(lang, 'brief.notifReadyTitle'),
      body: tr(lang, 'brief.notifReadyBody'),
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {route: 'DailyReviewScreen', source: 'daily_brief_trigger'},
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: nextTs.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: false,
    },
  );
}


