export type AiMemoryCategory =
  | 'current_status'
  | 'clinical_history'
  | 'preferences'
  | 'daily_patterns'
  | 'nightscout_strategy'
  | 'assistant_feedback';

export type AiMemoryDetailLevel = 'brief' | 'normal' | 'detailed';

export type AiMemoryRetentionPolicy = {
  activeUntil?: number | null;
  rememberUntil?: number | null;
  detailLevel: AiMemoryDetailLevel;
  reason?: string;
};

export type AiMemoryFolder = {
  category: AiMemoryCategory;
  path: string[];
};

export const AI_MEMORY_CATEGORY_LABELS: Record<AiMemoryCategory, string> = {
  current_status: 'Current status',
  clinical_history: 'Clinical history',
  preferences: 'Personal preferences',
  daily_patterns: 'Daily patterns',
  nightscout_strategy: 'Nightscout strategy',
  assistant_feedback: 'Assistant feedback',
};

export const DEFAULT_MEMORY_FOLDERS: AiMemoryFolder[] = [
  {category: 'current_status', path: ['active_context']},
  {category: 'current_status', path: ['pregnancy']},
  {category: 'clinical_history', path: ['pregnancy_history']},
  {category: 'clinical_history', path: ['loop_settings_history']},
  {category: 'preferences', path: ['communication_style']},
  {category: 'preferences', path: ['recommendation_style']},
  {category: 'daily_patterns', path: ['meals']},
  {category: 'daily_patterns', path: ['sleep']},
  {category: 'daily_patterns', path: ['exercise']},
  {category: 'nightscout_strategy', path: ['data_fetching']},
  {category: 'nightscout_strategy', path: ['known_data_gaps']},
  {category: 'assistant_feedback', path: ['helpful']},
  {category: 'assistant_feedback', path: ['not_helpful']},
];

export function memoryFolderKey(folder: AiMemoryFolder): string {
  return [folder.category, ...folder.path].filter(Boolean).join('/');
}

export function normalizeMemoryFolder(
  input?: Partial<AiMemoryFolder> | null,
): AiMemoryFolder {
  const category = input?.category ?? 'current_status';
  const pathInput = input?.path;
  const path = Array.isArray(pathInput)
    ? pathInput.map(x => String(x).trim()).filter(Boolean)
    : [];

  return {
    category,
    path: path.length ? path : ['general'],
  };
}

export function shouldUseDetailedMemory(
  retention: AiMemoryRetentionPolicy | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  if (!retention) return true;
  if (retention.detailLevel !== 'detailed') return false;
  return !retention.activeUntil || retention.activeUntil >= nowMs;
}

export function pregnancyRetentionPolicy(params: {
  dueDateMs?: number | null;
  nowMs?: number;
}): AiMemoryRetentionPolicy {
  const nowMs = params.nowMs ?? Date.now();
  const nineMonthsMs = 280 * 24 * 60 * 60 * 1000;
  const twoYearsMs = 730 * 24 * 60 * 60 * 1000;
  const activeUntil = params.dueDateMs ?? nowMs + nineMonthsMs;

  return {
    activeUntil,
    rememberUntil: activeUntil + twoYearsMs,
    detailLevel: 'detailed',
    reason:
      'Pregnancy materially changes glucose targets, insulin sensitivity, and recommendation context while active; after birth keep only historical context.',
  };
}
