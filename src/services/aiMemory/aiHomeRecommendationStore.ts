import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  aiWorkspaceStorageKey,
  type AiWorkspaceScope,
} from './aiWorkspaceScope';

const LEGACY_UNSCOPED_KEY = 'home:todayRecommendation:v1';
const storageKey = (scope: AiWorkspaceScope): string =>
  aiWorkspaceStorageKey('home.today-recommendation', scope);

export type AiHomeRecommendation = {
  readonly date: string;
  readonly text: string;
  readonly generatedAt: number;
};

const purgeLegacyUnscopedRecommendation = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LEGACY_UNSCOPED_KEY);
  } catch {
    // It cannot be safely assigned to the Workspace that happens to be active.
  }
};

export const loadAiHomeRecommendation = async (
  scope: AiWorkspaceScope,
): Promise<AiHomeRecommendation | null> => {
  await purgeLegacyUnscopedRecommendation();
  try {
    const raw = await AsyncStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.date !== 'string' ||
      typeof candidate.text !== 'string' ||
      candidate.text.trim().length === 0 ||
      typeof candidate.generatedAt !== 'number' ||
      !Number.isFinite(candidate.generatedAt)
    ) {
      return null;
    }
    return {
      date: candidate.date,
      text: candidate.text,
      generatedAt: candidate.generatedAt,
    };
  } catch {
    return null;
  }
};

export const saveAiHomeRecommendation = async (
  scope: AiWorkspaceScope,
  recommendation: AiHomeRecommendation,
): Promise<void> => {
  await purgeLegacyUnscopedRecommendation();
  await AsyncStorage.setItem(
    storageKey(scope),
    JSON.stringify(recommendation),
  );
};
