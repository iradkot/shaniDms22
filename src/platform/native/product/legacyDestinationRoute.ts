import {
  AI_ANALYST_TAB_SCREEN,
  DAILY_REVIEW_SCREEN,
  Food_Tracking_TAB_SCREEN,
  HOME_TAB_SCREEN,
  HYPO_INVESTIGATION_SCREEN,
  LOOP_TUNER_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
  ORACLE_TAB_SCREEN,
  SETTINGS_TAB_SCREEN,
  SPORT_TRACKING_TAB_SCREEN,
  TRENDS_TAB_SCREEN,
} from '../../../constants/SCREEN_NAMES';
import {
  CORE_IMPLEMENTATION_KEYS,
  CoreImplementationKey,
  isCoreImplementationKey,
} from '../../../product/destinations';

export const LEGACY_TRENDS_SECTIONS = [
  'overview',
  'agp-daily-patterns',
  'compare-periods',
] as const;

export type LegacyTrendsSection = (typeof LEGACY_TRENDS_SECTIONS)[number];

/** Params understood by the preserved native Trends screen. */
export interface LegacyTrendsRouteParams {
  readonly initialSection?: LegacyTrendsSection | undefined;
}

export const readLegacyTrendsSection = (
  params: unknown,
): LegacyTrendsSection | undefined => {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return undefined;
  }
  const section = (params as {readonly initialSection?: unknown})
    .initialSection;
  return typeof section === 'string' &&
    (LEGACY_TRENDS_SECTIONS as readonly string[]).includes(section)
    ? (section as LegacyTrendsSection)
    : undefined;
};

export interface LegacyTrendsScrollTarget {
  readonly section: LegacyTrendsSection;
  readonly y: number;
}

/** Pure focus decision used by the legacy screen and its navigation tests. */
export const selectLegacyTrendsScrollTarget = (
  requestedSection: LegacyTrendsSection | undefined,
  sectionOffsets: Readonly<Partial<Record<LegacyTrendsSection, number>>>,
  consumedSection?: LegacyTrendsSection,
): LegacyTrendsScrollTarget | undefined => {
  if (requestedSection === undefined || requestedSection === consumedSection) {
    return undefined;
  }
  const offset = sectionOffsets[requestedSection];
  return typeof offset === 'number' && Number.isFinite(offset)
    ? {section: requestedSection, y: Math.max(0, offset - 8)}
    : undefined;
};

export type LegacyDestinationRoute =
  | {readonly kind: 'root'; readonly screen: string}
  | {
      readonly kind: 'tab';
      readonly screen: string;
      readonly params?: Readonly<Record<string, string>>;
    };

const focusedLegacyTrendsRoute = (
  initialSection: LegacyTrendsSection,
): LegacyDestinationRoute => ({
  kind: 'tab',
  screen: TRENDS_TAB_SCREEN,
  params: {initialSection},
});

const LEGACY_ROUTES = {
  [CORE_IMPLEMENTATION_KEYS.dayGraph]: {
    kind: 'tab',
    screen: HOME_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.dailyOverview]: {
    kind: 'tab',
    screen: HOME_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.previousDaySummary]: {
    kind: 'root',
    screen: DAILY_REVIEW_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.trends]: {
    kind: 'tab',
    screen: TRENDS_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.trendsOverview]:
    focusedLegacyTrendsRoute('overview'),
  [CORE_IMPLEMENTATION_KEYS.trendsAgpDailyPatterns]:
    focusedLegacyTrendsRoute('agp-daily-patterns'),
  [CORE_IMPLEMENTATION_KEYS.trendsComparePeriods]:
    focusedLegacyTrendsRoute('compare-periods'),
  [CORE_IMPLEMENTATION_KEYS.trendsTherapyContext]: {
    kind: 'tab',
    screen: TRENDS_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.hypoInvestigation]: {
    kind: 'root',
    screen: HYPO_INVESTIGATION_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.similarEvents]: {
    kind: 'tab',
    screen: ORACLE_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.loopChangesImpact]: {
    kind: 'tab',
    screen: LOOP_TUNER_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.aiAnalyst]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.aiGeneralChat]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
    params: {initialMission: 'openChat'},
  },
  [CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
    params: {initialMission: 'hypoDetective'},
  },
  [CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
    params: {initialMission: 'userBehavior'},
  },
  [CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
    params: {initialMission: 'loopSettings'},
  },
  [CORE_IMPLEMENTATION_KEYS.aiMealSpecialist]: {
    kind: 'tab',
    screen: AI_ANALYST_TAB_SCREEN,
    params: {initialMission: 'mealAnalysis'},
  },
  [CORE_IMPLEMENTATION_KEYS.meals]: {
    kind: 'tab',
    screen: Food_Tracking_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.activity]: {
    kind: 'tab',
    screen: SPORT_TRACKING_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.updateCenter]: {
    kind: 'tab',
    screen: NOTIFICATION_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.alertRules]: {
    kind: 'tab',
    screen: NOTIFICATION_TAB_SCREEN,
  },
  [CORE_IMPLEMENTATION_KEYS.settings]: {
    kind: 'tab',
    screen: SETTINGS_TAB_SCREEN,
  },
} as const satisfies Readonly<
  Record<CoreImplementationKey, LegacyDestinationRoute>
>;

export const findLegacyDestinationRoute = (
  implementationKey: string,
): LegacyDestinationRoute | undefined =>
  isCoreImplementationKey(implementationKey)
    ? LEGACY_ROUTES[implementationKey]
    : undefined;
