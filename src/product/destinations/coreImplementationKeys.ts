/**
 * Canonical implementation identities for the built-in destination catalogue.
 *
 * Persisted destination IDs remain the navigation identity. These keys only
 * select the implementation or migration adapter that renders that identity.
 */
export const CORE_IMPLEMENTATION_KEYS = {
  dayGraph: 'DayGraph',
  dailyOverview: 'DailyOverview',
  previousDaySummary: 'PreviousDaySummary',
  trends: 'Trends',
  trendsOverview: 'TrendsOverview',
  trendsAgpDailyPatterns: 'TrendsAgpDailyPatterns',
  trendsComparePeriods: 'TrendsComparePeriods',
  trendsTherapyContext: 'TrendsTherapyContext',
  hypoInvestigation: 'HypoInvestigation',
  similarEvents: 'SimilarEvents',
  loopChangesImpact: 'LoopChangesImpact',
  aiAnalyst: 'AiAnalyst',
  aiGeneralChat: 'AiGeneralChat',
  aiHypoSpecialist: 'AiHypoSpecialist',
  aiBehaviorSpecialist: 'AiBehaviorSpecialist',
  aiLoopSpecialist: 'AiLoopSpecialist',
  aiMealSpecialist: 'AiMealSpecialist',
  meals: 'Meals',
  activity: 'Activity',
  updateCenter: 'UpdateCenter',
  alertRules: 'AlertRules',
  settings: 'Settings',
} as const;

export type CoreImplementationKey =
  (typeof CORE_IMPLEMENTATION_KEYS)[keyof typeof CORE_IMPLEMENTATION_KEYS];

export const CORE_IMPLEMENTATION_KEY_LIST: readonly CoreImplementationKey[] =
  Object.freeze(Object.values(CORE_IMPLEMENTATION_KEYS));

const coreImplementationKeySet: ReadonlySet<string> = new Set(
  CORE_IMPLEMENTATION_KEY_LIST,
);

export const isCoreImplementationKey = (
  value: unknown,
): value is CoreImplementationKey =>
  typeof value === 'string' && coreImplementationKeySet.has(value);

/** Fails fast when the built-in catalogue drifts from its canonical keys. */
export const assertCoreImplementationKeyCoverage = (
  implementationKeys: readonly string[],
): void => {
  const counts = new Map<string, number>();
  implementationKeys.forEach(key =>
    counts.set(key, (counts.get(key) ?? 0) + 1),
  );

  const missing = CORE_IMPLEMENTATION_KEY_LIST.filter(key => !counts.has(key));
  const duplicate = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const unknown = [...counts.keys()].filter(
    key => !isCoreImplementationKey(key),
  );

  if (missing.length === 0 && duplicate.length === 0 && unknown.length === 0) {
    return;
  }

  throw new Error(
    [
      'Core implementation-key coverage is invalid.',
      missing.length > 0 ? `Missing: ${missing.join(', ')}.` : '',
      duplicate.length > 0 ? `Duplicate: ${duplicate.join(', ')}.` : '',
      unknown.length > 0 ? `Unknown: ${unknown.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
};
