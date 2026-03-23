import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, RepeatFrequency, TriggerType} from '@notifee/react-native';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
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

type DailyProfile = {
  updatedAt: string;
  dominantRisk: 'lows' | 'highs' | 'balanced';
  avgTir7d: number;
  avgGlucose7d: number;
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
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 8);

  const [yRows, wRows] = await Promise.all([
    fetchBgDataForDateRangeUncached(yesterdayStart, todayStart, {throwOnError: false}),
    fetchBgDataForDateRangeUncached(weekStart, yesterdayStart, {throwOnError: false}),
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
      stats: {yesterday: {tir: 0, avg: 0, lows: 0, highs: 0, inRange: 0, count: 0, upMoves: 0, downMoves: 0}, week: {tir: 0, avg: 0, lows: 0, highs: 0, inRange: 0, count: 0, upMoves: 0, downMoves: 0}, nightLows: 0, tirDeltaVsWeek: 0, avgDeltaVsWeek: 0},
    };
  }

  const hypo = glucose.hypo ?? 70;
  const hyper = glucose.hyper ?? 180;

  const yStats = calcStats(yList, hypo, hyper);
  const wStats = calcStats(wList, hypo, hyper);

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

  const moreUps = yStats.upMoves > yStats.downMoves;
  const keyLine =
    yStats.highs > yStats.lows
      ? lang === 'he'
        ? `🔎 מה בלט: היו יותר גבוהים מנמוכים (${yStats.highs} מול ${yStats.lows}), ו${moreUps ? 'יותר עליות' : 'יותר ירידות'} (${yStats.upMoves} מול ${yStats.downMoves}).`
        : `🔎 What stands out: highs were more frequent than lows (${yStats.highs} vs ${yStats.lows}), with ${moreUps ? 'more rises' : 'more drops'} (${yStats.upMoves} vs ${yStats.downMoves}).`
      : lang === 'he'
      ? `🔎 מה בלט: היו יותר נמוכים מגבוהים (${yStats.lows} מול ${yStats.highs}), ו${moreUps ? 'יותר עליות' : 'יותר ירידות'} (${yStats.upMoves} מול ${yStats.downMoves}).`
      : `🔎 What stands out: lows were more frequent than highs (${yStats.lows} vs ${yStats.highs}), with ${moreUps ? 'more rises' : 'more drops'} (${yStats.upMoves} vs ${yStats.downMoves}).`;

  let actionLine = tr(lang, 'brief.actionKeep');
  if (nightLows > 0 || yStats.lows >= 2) actionLine = tr(lang, 'brief.actionAvoid');
  else if (yStats.highs > yStats.inRange * 0.25) actionLine = tr(lang, 'brief.actionBolus');

  const whyLine = nightLows > 0 ? tr(lang, 'brief.whyNight', {count: nightLows}) : yStats.lows > 0 ? tr(lang, 'brief.whyLows', {count: yStats.lows}) : tr(lang, 'brief.whyTirAvg', {tir: yStats.tir, avg: yStats.avg});

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
  const trend = improved ? (lang === 'he' ? 'שיפור' : 'improved') : worsened ? (lang === 'he' ? 'החמרה' : 'worsened') : lang === 'he' ? 'ללא שינוי' : 'unchanged';
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
    sanitizeEmpathicLanguage(llm.actionLine),
    sanitizeEmpathicLanguage(llm.whyLine),
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

  const instruction =
    lang === 'he'
      ? 'החזר JSON בלבד. העדף את השדות empathic_opening,clinical_validation,tiny_habit_recommendation,encouraging_closing. לחלופין מותר summaryLine,keyLine,actionLine,whyLine. כל שורה קצרה ועדינה. אסור להשתמש במילים: החמרה, מסוכן/מסכנים, כישלון, חוסר ציות. חובה לפתוח בחיזוק חיובי, להסביר ללא אשמה, ולהציע פעולה קטנה אחת בלבד.'
      : 'Return JSON only. Prefer keys empathic_opening,clinical_validation,tiny_habit_recommendation,encouraging_closing. Alternatively summaryLine,keyLine,actionLine,whyLine is allowed. Keep lines short and gentle. Never use blame/fear wording. Always start with positive reinforcement, include non-judgmental validation, and suggest exactly one tiny action.';

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

      const summaryLine = ensurePrefix(sanitizeEmpathicLanguage(summaryRaw), '📊');
      const keyLine = ensurePrefix(sanitizeEmpathicLanguage(keyRaw), '🔎');
      const actionLine = ensurePrefix(sanitizeEmpathicLanguage(actionRaw), '🎯');
      const whyLine = ensurePrefix(sanitizeEmpathicLanguage(whyRaw), '🧠');

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

