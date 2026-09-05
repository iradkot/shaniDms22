import {
  CORE_DESTINATIONS,
  CORE_DESTINATION_IDS,
  DestinationDefinition,
  DestinationRegistry,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  destinationId,
} from 'app/product/destinations';
import {
  HubItem,
  SelectHubModelInput,
  selectCurrentSnapshotTarget,
  selectHubViewModel,
} from 'app/product/hub';

const makeInput = (
  overrides: Partial<SelectHubModelInput> = {},
): SelectHubModelInput => ({
  locale: 'en',
  runtime: {platform: 'ios'},
  preferences: {favorites: [], recents: []},
  ...overrides,
});

describe('Hub selectors', () => {
  it('builds the fixed, task-oriented All Modules groups', () => {
    const model = selectHubViewModel(coreDestinationRegistry, makeInput());

    expect(model.groups.map(group => group.id)).toEqual([
      'today',
      'understand',
      'ask',
      'record',
      'updates',
      'manage',
    ]);
    const allItems = model.groups.reduce<HubItem[]>(
      (items, group) => [...items, ...group.items],
      [],
    );
    const today = model.groups.find(group => group.id === 'today');
    expect(allItems).toHaveLength(13);
    expect(today).toBeDefined();
    expect(today?.items.map(item => item.key)).toEqual([
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.previousDaySummary,
    ]);
  });

  it('keeps unavailable favorites in their saved order and removes duplicates', () => {
    const unknown = createStoredDestinationTarget('removed.old-module');
    const trends = createStoredDestinationTarget(CORE_DESTINATION_IDS.trends);
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        preferences: {favorites: [unknown, trends, trends]},
      }),
    );

    expect(model.favorites).toHaveLength(2);
    expect(model.favorites[0]).toMatchObject({
      key: 'removed.old-module',
      resolved: {
        status: 'unavailable',
        reason: {code: 'unknown-destination'},
      },
    });
    expect(model.favorites[1]).toMatchObject({
      key: CORE_DESTINATION_IDS.trends,
      resolved: {status: 'available'},
    });
  });

  it('records a stable child visit as its owning module and drops transient state', () => {
    const agpId = destinationId('core.trends-agp');
    const child: DestinationDefinition = {
      id: agpId,
      kind: 'module-child',
      ownerModuleId: CORE_DESTINATION_IDS.trends,
      implementationKey: 'TrendsAgp',
      order: 10,
      copy: {
        en: {title: 'AGP', description: 'AGP and daily patterns'},
        he: {title: 'AGP', description: 'AGP ודפוסים יומיים'},
      },
      targetPolicy: {favorite: true, start: true, shortcut: true},
      availability: {
        platforms: ['ios', 'android', 'web'],
        requiredCapabilities: [],
      },
    };
    const registry = new DestinationRegistry([...CORE_DESTINATIONS, child]);
    const model = selectHubViewModel(
      registry,
      makeInput({
        preferences: {
          favorites: [],
          recents: [
            {target: createStoredDestinationTarget(agpId), visitedAt: 20},
            {
              target: createStoredDestinationTarget(
                CORE_DESTINATION_IDS.trends,
              ),
              visitedAt: 10,
            },
          ],
        },
      }),
    );

    expect(model.recents).toHaveLength(1);
    expect(model.recents[0]?.key).toBe(CORE_DESTINATION_IDS.trends);
  });

  it('sorts recent modules, caps them, and attaches operational badges', () => {
    const day = createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph);
    const meals = createStoredDestinationTarget(CORE_DESTINATION_IDS.meals);
    const updates = createStoredDestinationTarget(
      CORE_DESTINATION_IDS.updateCenter,
    );
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        recentLimit: 2,
        operationalBadges: new Map([
          [CORE_DESTINATION_IDS.updateCenter, {label: '3 new'}],
        ]),
        preferences: {
          favorites: [],
          recents: [
            {target: day, visitedAt: 1},
            {target: updates, visitedAt: 3},
            {target: meals, visitedAt: 2},
          ],
        },
      }),
    );

    expect(model.recents.map(item => item.key)).toEqual([
      CORE_DESTINATION_IDS.updateCenter,
      CORE_DESTINATION_IDS.meals,
    ]);
    expect(model.recents[0]?.operationalBadge).toEqual({label: '3 new'});
  });

  it('hides modules only from All Modules, not from explicit favorites', () => {
    const meals = createStoredDestinationTarget(CORE_DESTINATION_IDS.meals);
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        preferences: {
          favorites: [meals],
          hiddenModuleIds: new Set([CORE_DESTINATION_IDS.meals]),
        },
      }),
    );

    expect(model.favorites.map(item => item.key)).toContain(
      CORE_DESTINATION_IDS.meals,
    );
    const allModuleKeys = model.groups.reduce<string[]>(
      (keys, group) => [...keys, ...group.items.map(item => item.key)],
      [],
    );
    expect(allModuleKeys).not.toContain(CORE_DESTINATION_IDS.meals);
  });

  it('provides Hebrew copy and RTL direction without changing group semantics', () => {
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({locale: 'he'}),
    );

    expect(model.direction).toBe('rtl');
    const today = model.groups.find(group => group.id === 'today');
    expect(today?.title).toBe('היום');
    expect(today?.items[0]?.title).toBe('גרף יומי');
  });

  it('resolves the optional Current Snapshot to Day Graph', () => {
    const result = selectCurrentSnapshotTarget(coreDestinationRegistry, {
      runtime: {platform: 'ios'},
    });

    expect(result).toMatchObject({
      status: 'available',
      destination: {id: CORE_DESTINATION_IDS.dayGraph},
    });
  });
});
