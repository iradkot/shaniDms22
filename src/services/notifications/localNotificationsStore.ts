import AsyncStorage from '@react-native-async-storage/async-storage';

import {NotificationRequest, NotificationResponse} from 'app/types/notifications';

const LEGACY_STORAGE_KEY = 'notifications:rules:v1';

export interface NotificationStoreScope {
  /** Opaque product Workspace ID. Never pass a URL, email, or API token. */
  readonly scopeId: string;
}

const storageKey = (scope?: NotificationStoreScope): string => {
  if (scope === undefined) {
    return LEGACY_STORAGE_KEY;
  }
  const scopeId = scope.scopeId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(scopeId)) {
    throw new Error('Notification storage scope is invalid.');
  }
  return `notifications:rules:v2:${scopeId}`;
};

function safeArray(input: unknown): NotificationResponse[] {
  if (!Array.isArray(input)) {
    return [];
  }
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

async function readAll(
  scope?: NotificationStoreScope,
): Promise<NotificationResponse[]> {
  const raw = await AsyncStorage.getItem(storageKey(scope));
  if (!raw) {
    return [];
  }
  try {
    return safeArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeAll(
  items: NotificationResponse[],
  scope?: NotificationStoreScope,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(scope), JSON.stringify(items));
}

export async function getNotificationRules(
  scope?: NotificationStoreScope,
): Promise<NotificationResponse[]> {
  return readAll(scope);
}

export async function addNotificationRule(
  notification: NotificationRequest,
  scope?: NotificationStoreScope,
): Promise<NotificationResponse> {
  const all = await readAll(scope);
  const created: NotificationResponse = {
    ...sanitizeRequest(notification),
    id: createId(),
    related_user: null as any,
    times_called: [],
    time_read: 0,
  };
  const next = [created, ...all];
  await writeAll(next, scope);
  return created;
}

export async function updateNotificationRule(
  id: string,
  notification: NotificationRequest,
  scope?: NotificationStoreScope,
): Promise<void> {
  const all = await readAll(scope);
  const next = all.map(item =>
    item.id === id
      ? {
          ...item,
          ...sanitizeRequest(notification),
        }
      : item,
  );
  await writeAll(next, scope);
}

export async function deleteNotificationRule(
  id: string,
  scope?: NotificationStoreScope,
): Promise<void> {
  const all = await readAll(scope);
  const next = all.filter(item => item.id !== id);
  await writeAll(next, scope);
}

export async function markNotificationRuleCalled(
  id: string,
  calledAtMs: number,
  scope?: NotificationStoreScope,
): Promise<void> {
  const all = await readAll(scope);
  const next = all.map(item => {
    if (item.id !== id) {
      return item;
    }
    const times = [...(item.times_called ?? []), calledAtMs].slice(-50);
    return {
      ...item,
      times_called: times,
      time_read: calledAtMs,
    };
  });
  await writeAll(next, scope);
}
