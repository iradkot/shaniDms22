import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'notifications:snooze:until:v1';

type SnoozeMap = Record<string, number>;

async function readMap(): Promise<SnoozeMap> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: SnoozeMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

export async function setRuleSnooze(ruleId: string, minutes: number): Promise<void> {
  const map = await readMap();
  map[ruleId] = Date.now() + minutes * 60 * 1000;
  await writeMap(map);
}

export async function isRuleSnoozed(ruleId: string, nowMs: number): Promise<boolean> {
  const map = await readMap();
  const until = Number(map[ruleId] ?? 0);
  if (!until || nowMs >= until) {
    if (map[ruleId]) {
      delete map[ruleId];
      await writeMap(map);
    }
    return false;
  }
  return true;
}

export async function handleSnoozeAction(pressActionId?: string, ruleId?: string): Promise<boolean> {
  if (!pressActionId || !ruleId) return false;
  const match = /^snooze_(\d+)$/.exec(pressActionId);
  if (!match) return false;
  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  await setRuleSnooze(ruleId, minutes);
  return true;
}
