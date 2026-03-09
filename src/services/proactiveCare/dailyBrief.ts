import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, RepeatFrequency, TriggerType} from '@notifee/react-native';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';

const CHANNEL_ID = 'daily-briefs';
const NOTIFICATION_ID = 'daily-brief-notification';

const STORAGE_KEYS = {
  lastDeliveredDate: 'proactiveCare:dailyBrief:lastDeliveredDate',
};

export type DailyBriefConfig = {
  enabled: boolean;
  hour: number;
  minute: number;
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
      body: '🌙 Night: no data\n📊 Yesterday: no data\n🎯 Today: capture more readings',
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

  const dayLine = `📊 Yesterday: TIR ${tir}% | avg ${avg}`;

  let actionLine = '🎯 Today: keep same routine';
  if (nightLows.length > 0 || lows.length >= 2) {
    actionLine = '🎯 Today: avoid insulin stacking';
  } else if (highs.length > inRange.length * 0.25) {
    actionLine = '🎯 Today: improve meal bolus timing';
  }

  return {
    title: 'Daily brief',
    body: `${nightLine}\n${dayLine}\n${actionLine}`,
  };
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily briefs',
    importance: AndroidImportance.DEFAULT,
  });
}

async function computeYesterdayBrief(glucose: GlucoseSettings) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const rows = await fetchBgDataForDateRangeUncached(yesterdayStart, todayStart, {
    throwOnError: false,
  });

  return buildBriefText({
    rows: rows.map(r => ({sgv: (r as any).sgv, dateString: (r as any).dateString})),
    glucose,
  });
}

export async function sendDailyBriefNow(glucose: GlucoseSettings) {
  await ensureChannel();
  const brief = await computeYesterdayBrief(glucose);

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

export async function syncDailyBriefNotifications(params: {
  config: DailyBriefConfig;
  glucose: GlucoseSettings;
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

  const brief = await computeYesterdayBrief(params.glucose);

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

