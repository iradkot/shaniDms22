import notifee, {
  AndroidImportance,
  TriggerType,
} from '@notifee/react-native';
import {sha1} from 'js-sha1';
import type {NativePreMealIntent} from '../../platform/native/product/nativePreMealAssistance';

const CHANNEL_ID = 'pre-meal-assistance';
const REMINDER_DELAY_MS = 10 * 60_000;
const generations = new Map<string, number>();

const assertScope = (scopeId: string): string => {
  const trimmed = scopeId.trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(trimmed)) {
    throw new Error('Pre-meal notification Workspace scope is invalid.');
  }
  return trimmed;
};

const notificationId = (scopeId: string): string =>
  `pre-meal-${sha1(assertScope(scopeId))}`;

const copy = (locale: 'en' | 'he') =>
  locale === 'he'
    ? {
        channel: 'עזרה לפני ארוחה',
        title: 'הקשר לפני הארוחה מוכן',
        body: 'אפשר לפתוח את גרף היום, לבדוק את הנתונים העדכניים ולתעד את הארוחה.',
      }
    : {
        channel: 'Pre-meal assistance',
        title: 'Your pre-meal context is ready',
        body: 'Open the Day Graph to review current facts and record the meal.',
      };

export const cancelPreMealNotification = async (
  scopeId: string,
): Promise<void> => {
  const id = notificationId(scopeId);
  generations.set(id, (generations.get(id) ?? 0) + 1);
  await notifee.cancelNotification(id);
};

/**
 * Schedules one factual reminder only after an explicit meal intent and
 * separate notification opt-in. It never contains dosing advice.
 */
export const syncPreMealNotification = async (input: {
  readonly scopeId: string;
  readonly locale: 'en' | 'he';
  readonly enabled: boolean;
  readonly intent?: NativePreMealIntent;
  readonly nowMs?: number;
}): Promise<void> => {
  const id = notificationId(input.scopeId);
  const generation = (generations.get(id) ?? 0) + 1;
  generations.set(id, generation);
  const isCurrent = (): boolean => generations.get(id) === generation;
  await notifee.cancelNotification(id);
  const nowMs = input.nowMs ?? Date.now();
  if (
    !input.enabled ||
    input.intent === undefined ||
    input.intent.expiresAtMs <= nowMs ||
    input.intent.startedAtMs > nowMs + 60_000
  ) {
    return;
  }
  const scheduledAtMs = Math.min(
    input.intent.startedAtMs + REMINDER_DELAY_MS,
    input.intent.expiresAtMs - 60_000,
  );
  if (scheduledAtMs <= nowMs) {
    return;
  }
  const message = copy(input.locale);
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: message.channel,
    importance: AndroidImportance.DEFAULT,
  });
  if (!isCurrent()) {
    await notifee.cancelNotification(id);
    return;
  }
  await notifee.createTriggerNotification(
    {
      id,
      title: message.title,
      body: message.body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
      },
      data: {
        route: 'ProductExperience',
        destinationId: 'core.day-graph',
        source: 'pre_meal_assistance',
        workspaceScopeId: input.scopeId,
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: scheduledAtMs,
      alarmManager: false,
    },
  );
  if (!isCurrent()) {
    await notifee.cancelNotification(id);
  }
};
