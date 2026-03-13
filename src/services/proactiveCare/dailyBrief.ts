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

async function buildFallbackBrief(glucose: GlucoseSettings, lang: Lang) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const rows = await fetchBgDataForDateRangeUncached(yesterdayStart, todayStart, {
    throwOnError: false,
  });
  const list = (rows as any[]) ?? [];

  if (!list.length) {
    return {
      title: tr(lang, 'brief.title'),
      nightLine: tr(lang, 'brief.noDataNight'),
      dayLine: tr(lang, 'brief.noDataYesterday'),
      actionLine: tr(lang, 'brief.actionCollect'),
      source: 'fallback' as const,
      stats: {tir: 0, avg: 0, lows: 0, highs: 0, nightLows: 0},
    };
  }

  const hypo = glucose.hypo ?? 70;
  const hyper = glucose.hyper ?? 180;
  const lows = list.filter(r => (r.sgv ?? 0) < hypo);
  const highs = list.filter(r => (r.sgv ?? 0) > hyper);
  const inRange = list.filter(r => (r.sgv ?? 0) >= hypo && (r.sgv ?? 0) <= hyper);
  const avg = Math.round(list.reduce((s, r) => s + (r.sgv ?? 0), 0) / Math.max(1, list.length));
  const tir = Math.round((inRange.length / Math.max(1, list.length)) * 100);

  const nightRows = list.filter(r => {
    const ds = r?.dateString;
    if (!ds) return false;
    return isNightHour(new Date(ds).getHours(), glucose.nightStartHour, glucose.nightEndHour);
  });
  const nightLows = nightRows.filter(r => (r.sgv ?? 0) < hypo);
  const rank = computeRank({tir, lows: lows.length, highs: highs.length});

  const nightLine =
    nightLows.length > 0
      ? tr(lang, 'brief.nightLows', {count: nightLows.length})
      : tr(lang, 'brief.nightStable');

  const dayLine = tr(lang, 'brief.yesterdayTir', {tir, tier: rank.tier});

  let actionLine = tr(lang, 'brief.actionKeep');
  if (nightLows.length > 0 || lows.length >= 2) {
    actionLine = tr(lang, 'brief.actionAvoid');
  } else if (highs.length > inRange.length * 0.25) {
    actionLine = tr(lang, 'brief.actionBolus');
  }

  return {
    title: tr(lang, 'brief.title'),
    nightLine,
    dayLine,
    actionLine,
    source: 'fallback' as const,
    stats: {tir, avg, lows: lows.length, highs: highs.length, nightLows: nightLows.length},
  };
}

async function maybeGenerateLlmActionLine(params: {
  baseActionLine: string;
  stats: {tir: number; avg: number; lows: number; highs: number; nightLows: number};
  ai?: DailyBriefAiOptions;
  lang: Lang;
}): Promise<{actionLine: string; source: 'ai' | 'fallback'}> {
  const {baseActionLine, stats, ai, lang} = params;
  const apiKey = (ai?.apiKey ?? '').trim();
  if (!ai?.enabled || !apiKey) return {actionLine: baseActionLine, source: 'fallback'};

  try {
    const provider = new OpenAIProvider({apiKey});
    const model = (ai?.model ?? 'gpt-5.4').trim() || 'gpt-5.4';

    const res = await provider.sendChat({
      model,
      messages: [
        {role: 'system', content: tr(lang, 'brief.llmSystem')},
        {role: 'user', content: `Stats: ${JSON.stringify(stats)}\nBase suggestion: ${baseActionLine}`},
      ],
      temperature: 0.7,
      maxOutputTokens: 90,
    });

    const text = (res.content ?? '').trim();
    if (!text) return {actionLine: baseActionLine, source: 'fallback'};
    if (text.startsWith('🎯')) return {actionLine: text, source: 'ai'};
    return {
      actionLine: lang === 'he' ? `🎯 היום: ${text}` : `🎯 Today: ${text}`,
      source: 'ai',
    };
  } catch {
    return {actionLine: baseActionLine, source: 'fallback'};
  }
}

async function computeYesterdayBrief(glucose: GlucoseSettings, lang: Lang, ai?: DailyBriefAiOptions) {
  const base = await buildFallbackBrief(glucose, lang);

  const generated = await maybeGenerateLlmActionLine({
    baseActionLine: base.actionLine,
    stats: base.stats,
    ai,
    lang,
  });

  const whyLine =
    base.stats.nightLows > 0
      ? tr(lang, 'brief.whyNight', {count: base.stats.nightLows})
      : base.stats.lows > 0
      ? tr(lang, 'brief.whyLows', {count: base.stats.lows})
      : tr(lang, 'brief.whyTirAvg', {tir: base.stats.tir, avg: base.stats.avg});

  return {
    title: base.title,
    body: `${base.nightLine}\n${base.dayLine}\n${generated.actionLine}\n${whyLine}`,
    source: generated.source === 'ai' ? 'ai' : base.source,
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
