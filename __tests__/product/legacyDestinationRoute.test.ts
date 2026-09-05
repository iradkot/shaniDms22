import {
  DAILY_REVIEW_SCREEN,
  Food_Tracking_TAB_SCREEN,
  HOME_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
  TRENDS_TAB_SCREEN,
} from '../../src/constants/SCREEN_NAMES';
import {
  CORE_DESTINATIONS,
  CORE_IMPLEMENTATION_KEY_LIST,
  CORE_IMPLEMENTATION_KEYS,
} from '../../src/product/destinations';
import {
  findLegacyDestinationRoute,
  readLegacyTrendsSection,
  selectLegacyTrendsScrollTarget,
} from '../../src/platform/native/product';

describe('legacy destination bridge', () => {
  it('routes rebuilt top-level destinations to their preserved screens', () => {
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.dayGraph),
    ).toEqual({
      kind: 'tab',
      screen: HOME_TAB_SCREEN,
    });
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.previousDaySummary),
    ).toEqual({
      kind: 'root',
      screen: DAILY_REVIEW_SCREEN,
    });
    expect(findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.trends)).toEqual(
      {
        kind: 'tab',
        screen: TRENDS_TAB_SCREEN,
      },
    );
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.alertRules),
    ).toEqual({
      kind: 'tab',
      screen: NOTIFICATION_TAB_SCREEN,
    });
  });

  it('keeps the full legacy Meals manager reachable during migration', () => {
    expect(findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.meals)).toEqual({
      kind: 'tab',
      screen: Food_Tracking_TAB_SCREEN,
    });
    expect(findLegacyDestinationRoute('UnknownModule')).toBeUndefined();
  });

  it('opens focused AI destinations in their matching current mission', () => {
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.aiGeneralChat),
    ).toMatchObject({
      kind: 'tab',
      params: {initialMission: 'openChat'},
    });
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist),
    ).toMatchObject({
      kind: 'tab',
      params: {initialMission: 'loopSettings'},
    });
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.aiMealSpecialist),
    ).toMatchObject({
      kind: 'tab',
      params: {initialMission: 'mealAnalysis'},
    });
  });

  it('retains each stable Trends child identity as a focused legacy section', () => {
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.trendsOverview),
    ).toEqual({
      kind: 'tab',
      screen: TRENDS_TAB_SCREEN,
      params: {initialSection: 'overview'},
    });
    expect(
      findLegacyDestinationRoute(
        CORE_IMPLEMENTATION_KEYS.trendsAgpDailyPatterns,
      ),
    ).toEqual({
      kind: 'tab',
      screen: TRENDS_TAB_SCREEN,
      params: {initialSection: 'agp-daily-patterns'},
    });
    expect(
      findLegacyDestinationRoute(CORE_IMPLEMENTATION_KEYS.trendsComparePeriods),
    ).toEqual({
      kind: 'tab',
      screen: TRENDS_TAB_SCREEN,
      params: {initialSection: 'compare-periods'},
    });

    expect(readLegacyTrendsSection({initialSection: 'compare-periods'})).toBe(
      'compare-periods',
    );
    expect(readLegacyTrendsSection({initialSection: 'typo'})).toBeUndefined();
    expect(readLegacyTrendsSection(null)).toBeUndefined();

    expect(
      selectLegacyTrendsScrollTarget(
        'agp-daily-patterns',
        {'agp-daily-patterns': 420},
        undefined,
      ),
    ).toEqual({section: 'agp-daily-patterns', y: 412});
    expect(
      selectLegacyTrendsScrollTarget(
        'agp-daily-patterns',
        {'agp-daily-patterns': 420},
        'agp-daily-patterns',
      ),
    ).toBeUndefined();
    expect(
      selectLegacyTrendsScrollTarget('compare-periods', {}, undefined),
    ).toBeUndefined();
  });

  it('keeps every not-yet-rebuilt core module reachable', () => {
    expect(
      CORE_DESTINATIONS.filter(
        destination =>
          findLegacyDestinationRoute(destination.implementationKey) ===
          undefined,
      ),
    ).toEqual([]);
    expect(
      CORE_IMPLEMENTATION_KEY_LIST.filter(
        key => findLegacyDestinationRoute(key) === undefined,
      ),
    ).toEqual([]);
  });
});
