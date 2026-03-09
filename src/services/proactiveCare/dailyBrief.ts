import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, RepeatFrequency, TriggerType} from '@notifee/react-native';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
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

function isNightHour(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function toInt(n: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function buildBriefText(params: {
  rows: Array<{sgv: number; dateString?: string}>;
  glucose: GlucoseSettings;
}) {
  const {rows, glucose} = params;
  if (!rows.length) {
    return {
      title: 'Daily brief',
      nightLine: '🌙 Night: no data',
      dayLine: '📊 Yesterday: no data',
      actionLine: '🎯 Today: capture more readings',
      stats: {tir: 0, avg: 0, lows: 0, highs: 0, nightLows: 0},
    };
  }

  const lows = rows.filter(r => r.sgv < glucose.hypo);
  const highs = rows.filter(r => r.sgv > glucose.hyper);
  const inRange = rows.filter(r => r.sgv >= glucose.hypo && r.sgv <= glucose.hyper);
  const avg = Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
  const tir = Math.round((inRange.length / rows.length) * 100);

  const nightRows = rows.filter(r => {
    if (!r.dateString) return false;
    const hour = new Date(r.dateString).getHours();
    return isNightHour(hour, glucose.nightStartHour, glucose.nightEndHour);
  });
  const nightLows = nightRows.filter(r => r.sgv < glucose.hypo);

  const nightLine =
    nightLows.length > 0
      ? `🌙 Night: ${nightLows.length} lows, min ${Math.min(...nightLows.map(r => r.sgv))}`
      : `🌙 Night: stable`;

  const rank = computeRank({tir, lows: lows.length, highs: highs.length});
  const dayLine = `📊 Yesterday: TIR ${tir}% | ${rank.tier}`;

  let actionLine = '🎯 Today: keep same routine';
  if (nightLows.length > 0 || lows.length >= 2) {
    actionLine = '🎯 Today: avoid insulin stacking';
  } else if (highs.length > inRange.length * 0.25) {
    actionLine = '🎯 Today: improve meal bolus timing';
  }

  return {
    title: 'Daily brief',
    nightLine,
    dayLine,
    actionLine,
    stats: {
      tir,
      avg,
      lows: lows.length,
      highs: highs.length,
      nightLows: nightLows.length,
    },
  };
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily briefs',
    importance: AndroidImportance.DEFAULT,
  });
}

function composeBody(lines: {nightLine: string; dayLine: string; actionLine: string}) {
  return `${lines.nightLine}\n${lines.dayLine}\n${lines.actionLine}`;
}

async function maybeGenerateLlmActionLine(params: {
  baseActionLine: string;
  stats: {tir: number; avg: number; lows: number; highs: number; nightLows: number};
  ai?: DailyBriefAiOptions;
}): Promise<string> {
  const {baseActionLine, stats, ai} = params;
  const apiKey = (ai?.apiKey ?? '').trim();
  if (!ai?.enabled || !apiKey) return baseActionLine;

  try {
    const provider = new OpenAIProvider({apiKey});
    const model = (ai?.model ?? 'gpt-5.4').trim() || 'gpt-5.4';

    const system =
      'You write a very short daily diabetes action line. ' +
      'Output ONLY one concise sentence (max 12 words), practical and specific.';

    const user =
      `Stats: ${JSON.stringify(stats)}\n` +
      `Base suggestion: ${baseActionLine}\n` +
      'Return one improved action line prefixed with "🎯 Today:".';

    const res = await provider.sendChat({
      model,
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      temperature: 0.2,
      maxOutputTokens: 80,
    });

    const text = (res.content ?? '').trim();
    if (!text) return baseActionLine;
    return text.startsWith('🎯') ? text : `🎯 Today: ${text}`;
  } catch {
    return baseActionLine;
  }
}

async function computeYesterdayBrief(glucose: GlucoseSettings, ai?: DailyBriefAiOptions) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const rows = await fetchBgDataForDateRangeUncached(yesterdayStart, todayStart, {
    throwOnError: false,
  });

  const base = buildBriefText({
    rows: rows.map(r => ({sgv: (r as any).sgv, dateString: (r as any).dateString})),
    glucose,
  });

  const llmAction = await maybeGenerateLlmActionLine({
    baseActionLine: base.actionLine,
    stats: base.stats,
    ai,
  });

  return {
    title: base.title,
    body: composeBody({
      nightLine: base.nightLine,
      dayLine: base.dayLine,
      actionLine: llmAction,
    }),
  };
}

async function persistLatestBrief(brief: {title: string; body: string}) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.latestBrief,
      JSON.stringify({
        ...brief,
        createdAt: new Date().toISOString(),
      }),
    );
  } catch {
    // best effort
  }
}

export async function getLatestDailyBrief(): Promise<{title: string; body: string; createdAt?: string} | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.latestBrief);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function regenerateDailyBrief(params: {
  glucose: GlucoseSettings;
  ai?: DailyBriefAiOptions;
  notify?: boolean;
}) {
  const brief = await computeYesterdayBrief(params.glucose, params.ai);
  await persistLatestBrief(brief);

  if (params.notify) {
    await ensureChannel();
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
  const hour = toInt(params.config.hour, 8, 0, 23);
  const minute = toInt(params.config.minute, 0, 0, 59);

  await ensureChannel();

  await notifee.cancelNotification(NOTIFICATION_ID);

  if (!params.config.enabled) return;

  const now = new Date();
  const todayKey = ymd(now);
  const todaySchedule = new Date(now);
  todaySchedule.setHours(hour, minute, 0, 0);

  const lastDelivered = await AsyncStorage.getItem(STORAGE_KEYS.lastDeliveredDate);

  const brief = await computeYesterdayBrief(params.glucose, params.ai);
  await persistLatestBrief(brief);

  if (now.getTime() >= todaySchedule.getTime() && lastDelivered !== todayKey) {
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: brief.title,
      body: brief.body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {
        route: 'DailyReviewScreen',
        source: 'daily_brief',
      },
    });

    await AsyncStorage.setItem(STORAGE_KEYS.lastDeliveredDate, todayKey);
  }

  const nextTs = nextScheduledTime(new Date(), hour, minute);

  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID,
      title: brief.title,
      body: brief.body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {
        route: 'DailyReviewScreen',
        source: 'daily_brief',
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

