import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  TriggerType,
} from '@notifee/react-native';

import {BgSample} from 'app/types/day_bgs.types';
import {sha1} from 'js-sha1';

const STORAGE_KEYS = {
  lastTriggeredAtMs: 'proactiveCare:hypoNow:lastTriggeredAtMs',
  lastBgTimestampMs: 'proactiveCare:hypoNow:lastBgTimestampMs',
} as const;

const DEFAULTS = {
  lowThresholdMgDl: 70,
  cooldownMs: 25 * 60 * 1000,
  followUpDelayMs: 15 * 60 * 1000,
  staleSnapshotMs: 10 * 60 * 1000,
  analysisWindowMs: 6 * 60 * 60 * 1000,
} as const;

const CHANNEL_ID = 'hypo-alerts';
const PRESS_ACTION_ID = 'open_hypo_investigation';

export type HypoNowEvaluationInput = {
  scopeId: string;
  latestBgSample: BgSample | null | undefined;
  nowMs?: number;
};

const scopedStorageKey = (key: string, scopeId: string): string => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(scopeId)) {
    throw new Error('Hypo notification Workspace scope is invalid.');
  }
  return `${key}:${scopeId}`;
};

const notificationIds = (scopeId: string) => {
  const token = sha1(scopeId);
  return {
    current: `hypo-now-${token}`,
    followUp: `hypo-follow-up-${token}`,
  };
};

export type HypoNowEvaluationResult = {
  shouldNotify: boolean;
  reason:
    | 'missing_bg'
    | 'stale_bg'
    | 'not_hypo'
    | 'cooldown_active'
    | 'duplicate_bg'
    | 'notify_hypo_now';
  debug?: Record<string, unknown>;
};

function getSampleTimestampMs(sample: BgSample): number | null {
  if (typeof sample?.date === 'number' && Number.isFinite(sample.date)) {
    return sample.date;
  }

  if (typeof (sample as any)?.dateString === 'string') {
    const parsed = Date.parse((sample as any).dateString);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getSampleGlucose(sample: BgSample): number | null {
  const sgv = (sample as any)?.sgv;
  return typeof sgv === 'number' && Number.isFinite(sgv) ? sgv : null;
}

function buildHypoNowCopy(): {title: string; body: string} {
  return {
    title: 'Possible hypo now',
    body: 'Your glucose appears low now. Please take a fast-acting carb and re-check in 15 minutes.',
  };
}

async function ensureNotificationChannel(): Promise<string> {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Hypo alerts',
    importance: AndroidImportance.HIGH,
  });
}

async function scheduleFollowUpNotification(params: {
  scopeId: string;
  baseTimestampMs: number;
}) {
  const {baseTimestampMs, scopeId} = params;

  const trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: baseTimestampMs + DEFAULTS.followUpDelayMs,
    alarmManager: false,
  } as const;

  const title = 'Quick follow-up';
  const body = '15 minutes passed. Can you re-check glucose and update me?';

  await notifee.createTriggerNotification(
    {
      id: notificationIds(scopeId).followUp,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {
          id: PRESS_ACTION_ID,
        },
      },
      data: {
        route: 'HypoInvestigationScreen',
        source: 'hypo_follow_up',
        workspaceScopeId: scopeId,
      },
    },
    trigger,
  );
}

export async function evaluateHypoNowAndNotify(input: HypoNowEvaluationInput): Promise<HypoNowEvaluationResult> {
  const nowMs = input.nowMs ?? Date.now();
  const sample = input.latestBgSample;

  if (!sample) {
    return {shouldNotify: false, reason: 'missing_bg'};
  }

  const sampleTimestampMs = getSampleTimestampMs(sample);
  if (sampleTimestampMs == null || nowMs - sampleTimestampMs > DEFAULTS.staleSnapshotMs) {
    return {
      shouldNotify: false,
      reason: 'stale_bg',
      debug: {sampleTimestampMs, nowMs},
    };
  }

  const sgv = getSampleGlucose(sample);
  if (sgv == null || sgv >= DEFAULTS.lowThresholdMgDl) {
    return {
      shouldNotify: false,
      reason: 'not_hypo',
      debug: {sgv},
    };
  }

  const [lastTriggeredRaw, lastBgTimestampRaw] = await Promise.all([
    AsyncStorage.getItem(
      scopedStorageKey(STORAGE_KEYS.lastTriggeredAtMs, input.scopeId),
    ),
    AsyncStorage.getItem(
      scopedStorageKey(STORAGE_KEYS.lastBgTimestampMs, input.scopeId),
    ),
  ]);

  const lastTriggeredAtMs = lastTriggeredRaw ? Number(lastTriggeredRaw) : null;
  const lastBgTimestampMs = lastBgTimestampRaw ? Number(lastBgTimestampRaw) : null;

  if (lastBgTimestampMs != null && lastBgTimestampMs === sampleTimestampMs) {
    return {
      shouldNotify: false,
      reason: 'duplicate_bg',
      debug: {sampleTimestampMs},
    };
  }

  if (lastTriggeredAtMs != null && nowMs - lastTriggeredAtMs < DEFAULTS.cooldownMs) {
    return {
      shouldNotify: false,
      reason: 'cooldown_active',
      debug: {lastTriggeredAtMs, cooldownMs: DEFAULTS.cooldownMs},
    };
  }

  await ensureNotificationChannel();

  const copy = buildHypoNowCopy();
  const endMs = nowMs;
  const startMs = nowMs - DEFAULTS.analysisWindowMs;

  await notifee.displayNotification({
    id: notificationIds(input.scopeId).current,
    title: copy.title,
    body: copy.body,
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
      pressAction: {
        id: PRESS_ACTION_ID,
      },
    },
    data: {
      route: 'HypoInvestigationScreen',
      startMs: String(startMs),
      endMs: String(endMs),
      lowThreshold: String(DEFAULTS.lowThresholdMgDl),
      source: 'hypo_now_mvp',
      workspaceScopeId: input.scopeId,
    },
  });

  await scheduleFollowUpNotification({
    scopeId: input.scopeId,
    baseTimestampMs: nowMs,
  });

  await Promise.all([
    AsyncStorage.setItem(
      scopedStorageKey(STORAGE_KEYS.lastTriggeredAtMs, input.scopeId),
      String(nowMs),
    ),
    AsyncStorage.setItem(
      scopedStorageKey(STORAGE_KEYS.lastBgTimestampMs, input.scopeId),
      String(sampleTimestampMs),
    ),
  ]);

  return {
    shouldNotify: true,
    reason: 'notify_hypo_now',
    debug: {sgv, sampleTimestampMs, lowThreshold: DEFAULTS.lowThresholdMgDl},
  };
}

/** Cancels only notifications belonging to the Workspace being left. */
export async function clearHypoNowNotifications(scopeId: string): Promise<void> {
  const ids = notificationIds(scopeId);
  await Promise.all([
    notifee.cancelNotification(ids.current),
    notifee.cancelNotification(ids.followUp),
  ]);
}
