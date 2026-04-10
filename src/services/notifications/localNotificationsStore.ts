import AsyncStorage from '@react-native-async-storage/async-storage';

import {NotificationRequest, NotificationResponse} from 'app/types/notifications';

const STORAGE_KEY = 'notifications:rules:v1';

function nowMs() {
  return Date.now();
}

function safeArray(input: unknown): NotificationResponse[] {
  if (!Array.isArray(input)) return [];
  return input.filter(Boolean) as NotificationResponse[];
}

function sanitizeRequest(input: NotificationRequest): NotificationRequest {
  return {
    ...input,
    name: String(input.name ?? '').trim(),
    enabled: Boolean(input.enabled),
    range_start: Number(input.range_start),
    range_end: Number(input.range_end),
    hour_from_in_minutes: Number(input.hour_from_in_minutes),
    hour_to_in_minutes: Number(input.hour_to_in_minutes),
  };
}

function createId(): string {
  return `rule_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function readAll(): Promise<NotificationResponse[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return safeArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeAll(items: NotificationResponse[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function getNotificationRules(): Promise<NotificationResponse[]> {
  return readAll();
}

export async function addNotificationRule(notification: NotificationRequest): Promise<NotificationResponse> {
  const all = await readAll();
  const created: NotificationResponse = {
    ...sanitizeRequest(notification),
    id: createId(),
    related_user: null as any,
    times_called: [],
    time_read: 0,
  };
  const next = [created, ...all];
  await writeAll(next);
  return created;
}

export async function updateNotificationRule(id: string, notification: NotificationRequest): Promise<void> {
  const all = await readAll();
  const next = all.map(item =>
    item.id === id
      ? {
          ...item,
          ...sanitizeRequest(notification),
        }
      : item,
  );
  await writeAll(next);
}

export async function deleteNotificationRule(id: string): Promise<void> {
  const all = await readAll();
  const next = all.filter(item => item.id !== id);
  await writeAll(next);
}

export async function markNotificationRuleCalled(id: string, calledAtMs: number): Promise<void> {
  const all = await readAll();
  const next = all.map(item => {
    if (item.id !== id) return item;
    const times = [...(item.times_called ?? []), calledAtMs].slice(-50);
    return {
      ...item,
      times_called: times,
      time_read: calledAtMs,
    };
  });
  await writeAll(next);
}
