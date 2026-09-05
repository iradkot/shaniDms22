import AsyncStorage from '@react-native-async-storage/async-storage';
import type {NotificationStoreScope} from './localNotificationsStore';

const LEGACY_KEY = 'notifications:snooze:until:v1';

type SnoozeMap = Record<string, number>;

const storageKey = (scope?: NotificationStoreScope): string => {
  if (scope === undefined) {
    return LEGACY_KEY;
  }
  const scopeId = scope.scopeId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(scopeId)) {
    throw new Error('Notification snooze scope is invalid.');
  }
  return `notifications:snooze:until:v2:${scopeId}`;
};

async function readMap(scope?: NotificationStoreScope): Promise<SnoozeMap> {
  const raw = await AsyncStorage.getItem(storageKey(scope));
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(
  map: SnoozeMap,
  scope?: NotificationStoreScope,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(scope), JSON.stringify(map));
}

export async function setRuleSnooze(
  ruleId: string,
  minutes: number,
  scope?: NotificationStoreScope,
): Promise<void> {
  const map = await readMap(scope);
  map[ruleId] = Date.now() + minutes * 60 * 1000;
  await writeMap(map, scope);
}

export async function isRuleSnoozed(
  ruleId: string,
  nowMs: number,
  scope?: NotificationStoreScope,
): Promise<boolean> {
  const map = await readMap(scope);
  const until = Number(map[ruleId] ?? 0);
  if (!until || nowMs >= until) {
    if (map[ruleId]) {
      delete map[ruleId];
      await writeMap(map, scope);
    }
    return false;
  }
  return true;
}

export async function handleSnoozeAction(
  pressActionId?: string,
  ruleId?: string,
  workspaceScopeId?: string,
): Promise<boolean> {
  if (!pressActionId || !ruleId) {
    return false;
  }
  const match = /^snooze_(\d+)$/.exec(pressActionId);
  if (!match) {
    return false;
  }
  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return false;
  }
  await setRuleSnooze(
    ruleId,
    minutes,
    workspaceScopeId === undefined ? undefined : {scopeId: workspaceScopeId},
  );
  return true;
}
