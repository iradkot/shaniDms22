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
  it('groups all launchable screens under their owning module category', () => {
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
    expect(allItems).toHaveLength(17);
    expect(allItems.map(item => item.key)).toEqual(
      expect.arrayContaining(
        CORE_DESTINATIONS.filter(destination =>
          destination.kind === 'module' || destination.targetPolicy.shortcut,
        ).map(destination => destination.id),
      ),
    );
    expect(today).toBeDefined();
    expect(today?.items.map(item => item.key)).toEqual([
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.previousDaySummary,
    ]);
    expect(
      model.groups
        .find(group => group.id === 'understand')
        ?.items.map(item => item.key),
    ).toContain(CORE_DESTINATION_IDS.trendsAgpDailyPatterns);
    expect(
      model.groups
        .find(group => group.id === 'ask')
        ?.items.map(item => item.key),
    ).toEqual([CORE_DESTINATION_IDS.aiAnalyst]);
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

  it('keeps a stable child and its owning module as distinct recent screens', () => {
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

    expect(model.recents.map(item => item.key)).toEqual([
      agpId,
      CORE_DESTINATION_IDS.trends,
    ]);
    expect(model.recents[0]?.resolved.target).toEqual(
      createStoredDestinationTarget(agpId),
    );
  });

  it('shows the eight most recent unique screens in visit order by default', () => {
    const visited = CORE_DESTINATIONS.slice(0, 10);
    const newest = visited[0];
    if (!newest) {
      throw new Error('Expected at least one registered destination.');
    }
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        preferences: {
          favorites: [],
          recents: [
            ...visited.map((destination, index) => ({
              target: createStoredDestinationTarget(destination.id),
              visitedAt: index,
            })),
            {target: createStoredDestinationTarget(newest.id), visitedAt: 100},
          ],
        },
      }),
    );

    expect(model.recents.map(item => item.key)).toEqual([
      newest.id,
      ...visited
        .slice(3)
        .reverse()
        .map(destination => destination.id),
    ]);
  });

  it('deduplicates aliases by their resolved screen while retaining latest visit order', () => {
    const alias = destinationId('legacy.trends-overview');
    const registry = new DestinationRegistry(
      CORE_DESTINATIONS.map(destination =>
        destination.id === CORE_DESTINATION_IDS.trendsOverview
          ? {...destination, aliases: [alias]}
          : destination,
      ),
    );
    const model = selectHubViewModel(
      registry,
      makeInput({
        preferences: {
          favorites: [],
          recents: [
            {target: createStoredDestinationTarget(alias), visitedAt: 30},
            {
              target: createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
              visitedAt: 20,
            },
            {
              target: createStoredDestinationTarget(
                CORE_DESTINATION_IDS.trendsOverview,
              ),
              visitedAt: 10,
            },
          ],
        },
      }),
    );

    expect(model.recents.map(item => item.key)).toEqual([
      CORE_DESTINATION_IDS.trendsOverview,
      CORE_DESTINATION_IDS.meals,
    ]);
  });

  it('honors an explicit recent limit and attaches operational badges', () => {
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

  it('keeps unavailable child screens visible with their own runtime availability', () => {
    const id = CORE_DESTINATION_IDS.trendsOverview;
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        runtime: {
          platform: 'ios',
          disabledDestinations: new Map([[id, 'Try again later.']]),
        },
        preferences: {
          favorites: [],
          recents: [{target: createStoredDestinationTarget(id), visitedAt: 1}],
        },
      }),
    );
    const child = model.groups
      .flatMap(group => group.items)
      .find(item => item.key === id);

    expect(child).toMatchObject({
      key: id,
      resolved: {status: 'unavailable', reason: {code: 'disabled'}},
    });
    expect(child?.description).toContain('Try again later.');
    expect(model.recents[0]).toEqual(child);
  });

  it('omits child screens that cannot be launched as shortcuts', () => {
    const registry = new DestinationRegistry(
      CORE_DESTINATIONS.map(destination =>
        destination.id === CORE_DESTINATION_IDS.trendsOverview
          ? {
              ...destination,
              targetPolicy: {...destination.targetPolicy, shortcut: false},
            }
          : destination,
      ),
    );
    const model = selectHubViewModel(registry, makeInput());
    const keys = model.groups.flatMap(group =>
      group.items.map(item => item.key),
    );

    expect(keys).not.toContain(CORE_DESTINATION_IDS.trendsOverview);
    expect(keys).toContain(CORE_DESTINATION_IDS.trends);
  });

  it('hides every child of a hidden module and honors explicitly hidden screens', () => {
    const model = selectHubViewModel(
      coreDestinationRegistry,
      makeInput({
        preferences: {
          favorites: [
            createStoredDestinationTarget(CORE_DESTINATION_IDS.trendsOverview),
          ],
          hiddenModuleIds: new Set([
            CORE_DESTINATION_IDS.trends,
            CORE_DESTINATION_IDS.aiGeneralChat,
          ]),
        },
      }),
    );
    const items = model.groups.flatMap(group => group.items);

    expect(
      items.some(
        item =>
          item.resolved.destination?.ownerModuleId ===
          CORE_DESTINATION_IDS.trends,
      ),
    ).toBe(false);
    expect(items.map(item => item.key)).not.toContain(
      CORE_DESTINATION_IDS.aiGeneralChat,
    );
    expect(items.map(item => item.key)).toContain(
      CORE_DESTINATION_IDS.aiAnalyst,
    );
    expect(model.favorites[0]?.key).toBe(CORE_DESTINATION_IDS.trendsOverview);
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
