import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, RepeatFrequency, TriggerType} from '@notifee/react-native';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {OpenAIProvider} from 'app/services/llm/providers/openaiProvider';
import {computeRank} from 'app/services/proactiveCare/streakRank';
import {getStoredAppLanguage} from 'app/contexts/AppLanguageContext';

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
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
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

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily briefs',
    importance: AndroidImportance.DEFAULT,
  });
}

async function persistLatestBrief(brief: Omit<StoredBrief, 'createdAt'>) {
  const payload: StoredBrief = {
    ...brief,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEYS.latestBrief, JSON.stringify(payload));
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

async function buildFallbackBrief(glucose: GlucoseSettings) {
  const now = new Date();
  const isHe = (await getStoredAppLanguage()) === 'he';
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const rows = await fetchBgDataForDateRangeUncached(yesterdayStart, todayStart, {
    throwOnError: false,
  });
  const list = (rows as any[]) ?? [];

  if (!list.length) {
    return {
      title: isHe ? 'סיכום יומי' : 'Daily brief',
      nightLine: isHe ? '🌙 לילה: אין נתונים' : '🌙 Night: no data',
      dayLine: isHe ? '📊 אתמול: אין נתונים' : '📊 Yesterday: no data',
      actionLine: isHe ? '🎯 היום: כדאי לאסוף עוד נתונים' : '🎯 Today: capture more readings',
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
    const h = new Date(ds).getHours();
    return isNightHour(h, glucose.nightStartHour, glucose.nightEndHour);
  });
  const nightLows = nightRows.filter(r => (r.sgv ?? 0) < hypo);

  const rank = computeRank({tir, lows: lows.length, highs: highs.length});

  const nightLine =
    nightLows.length > 0
      ? (isHe ? `🌙 לילה: ${nightLows.length} ירידות` : `🌙 Night: ${nightLows.length} lows`)
      : (isHe ? '🌙 לילה: יציב' : '🌙 Night: stable');

  const dayLine = isHe ? `📊 אתמול: TIR ${tir}% | ${rank.tier}` : `📊 Yesterday: TIR ${tir}% | ${rank.tier}`;

  let actionLine = isHe ? '🎯 היום: לשמור על אותה שגרה' : '🎯 Today: keep same routine';
  if (nightLows.length > 0 || lows.length >= 2) {
    actionLine = isHe ? '🎯 היום: להימנע מערימת אינסולין' : '🎯 Today: avoid insulin stacking';
  } else if (highs.length > inRange.length * 0.25) {
    actionLine = isHe ? '🎯 היום: לשפר תזמון בולוס בארוחות' : '🎯 Today: improve meal bolus timing';
  }

  return {
    title: isHe ? 'סיכום יומי' : 'Daily brief',
    nightLine,
    dayLine,
    actionLine,
    source: 'fallback' as const,
    stats: {
      tir,
      avg,
      lows: lows.length,
      highs: highs.length,
      nightLows: nightLows.length,
    },
  };
}

async function maybeGenerateLlmActionLine(params: {
  baseActionLine: string;
  stats: {tir: number; avg: number; lows: number; highs: number; nightLows: number};
  ai?: DailyBriefAiOptions;
}): Promise<{actionLine: string; source: 'ai' | 'fallback'}> {
  const {baseActionLine, stats, ai} = params;
  const isHe = (await getStoredAppLanguage()) === 'he';
  const apiKey = (ai?.apiKey ?? '').trim();
  if (!ai?.enabled || !apiKey) return {actionLine: baseActionLine, source: 'fallback'};

  try {
    const provider = new OpenAIProvider({apiKey});
    const model = (ai?.model ?? 'gpt-5.4').trim() || 'gpt-5.4';

    const res = await provider.sendChat({
      model,
      messages: [
        {
          role: 'system',
          content:
            isHe
              ? 'כתוב שורת פעולה יומית קצרה לסוכרת. פרקטי וספציפי, עד 14 מילים. להתחיל ב-"🎯 היום:".'
              : 'Write one short daily diabetes action line. Practical, specific, max 14 words. Start with "🎯 Today:".',
        },
        {
          role: 'user',
          content: `Stats: ${JSON.stringify(stats)}\nBase suggestion: ${baseActionLine}`,
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 90,
    });

    const text = (res.content ?? '').trim();
    if (!text) return {actionLine: baseActionLine, source: 'fallback'};
    if (text.startsWith('🎯')) return {actionLine: text, source: 'ai'};
    return {actionLine: isHe ? `🎯 היום: ${text}` : `🎯 Today: ${text}`, source: 'ai'};
  } catch {
    return {actionLine: baseActionLine, source: 'fallback'};
  }
}

async function computeYesterdayBrief(glucose: GlucoseSettings, ai?: DailyBriefAiOptions) {
  const base = await buildFallbackBrief(glucose);
  const isHe = (await getStoredAppLanguage()) === 'he';

  const generated = await maybeGenerateLlmActionLine({
    baseActionLine: base.actionLine,
    stats: base.stats,
    ai,
  });

  const whyLine =
    base.stats.nightLows > 0
      ? (isHe ? `🧠 למה: זוהו ${base.stats.nightLows} ירידות בלילה` : `🧠 Why: ${base.stats.nightLows} night lows detected`)
      : base.stats.lows > 0
      ? (isHe ? `🧠 למה: היו ${base.stats.lows} ירידות אתמול` : `🧠 Why: ${base.stats.lows} low events yesterday`)
      : (isHe ? `🧠 למה: TIR ${base.stats.tir}% וממוצע ${base.stats.avg}` : `🧠 Why: TIR ${base.stats.tir}% and avg ${base.stats.avg}`);

  const source = generated.source === 'ai' ? 'ai' : base.source;

  return {
    title: base.title,
    body: `${base.nightLine}\n${base.dayLine}\n${generated.actionLine}\n${whyLine}`,
    source,
  } as const;
}

export async function regenerateDailyBrief(params: {
  glucose: GlucoseSettings;
  ai?: DailyBriefAiOptions;
  notify?: boolean;
}) {
  await ensureChannel();

  const brief = await computeYesterdayBrief(params.glucose, params.ai);
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
      data: {
        route: 'DailyReviewScreen',
        source: 'daily_brief_manual',
      },
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
  const hour = clampInt(params.config.hour, 8, 0, 23);
  const minute = clampInt(params.config.minute, 0, 0, 59);

  await ensureChannel();
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
      title: 'Daily brief is ready',
      body: 'Open Daily Review to see your updated summary.',
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {
        route: 'DailyReviewScreen',
        source: 'daily_brief_trigger',
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: nextTs.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: true,
    },
  );
}
