import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {HubView, selectHubViewModel, type HubItem} from 'app/product/hub';

const makeModel = (locale: 'en' | 'he' = 'en') =>
  selectHubViewModel(coreDestinationRegistry, {
    locale,
    runtime: {platform: 'ios'},
    operationalBadges: new Map([
      [CORE_DESTINATION_IDS.updateCenter, {label: '3 new'}],
    ]),
    preferences: {
      favorites: [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.meals,
        CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
      ].map(createStoredDestinationTarget),
      recents: [
        CORE_DESTINATION_IDS.settings,
        CORE_DESTINATION_IDS.alertRules,
        CORE_DESTINATION_IDS.activity,
      ].map((destinationId, index) => ({
        target: createStoredDestinationTarget(destinationId),
        visitedAt: 10 - index,
      })),
    },
  });

const button = (tree: renderer.ReactTestRenderer, testID: string) => {
  const control = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  if (!control) {
    throw new Error(`Missing button ${testID}.`);
  }
  return control;
};

const gridTiles = (tree: renderer.ReactTestRenderer, grid: string) =>
  tree.root.findAll(
    node =>
      node.type === Pressable &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith(`${grid}-tile-`),
  );

const allItems = (model: ReturnType<typeof makeModel>) =>
  model.groups.reduce<HubItem[]>(
    (items, group) => [...items, ...group.items],
    [],
  );

describe('HubView launcher', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => {
      Dimensions.set({window: originalWindow, screen: originalScreen});
    });
  });

  it.each([
    ['en', ['Zulu', 'Alpha', 'Bravo'], ['Alpha', 'Bravo', 'Zulu']],
    ['he', ['תמר', 'אבוקדו', 'בננה'], ['אבוקדו', 'בננה', 'תמר']],
  ] as const)(
    'shows every screen alphabetically in %s without changing source order',
    (locale, titles, expected) => {
      const base = makeModel(locale);
      const source = allItems(base).slice(0, 3);
      const items = source.map((item, index) => ({
        ...item,
        title: titles[index]!,
      }));
      const model = {
        ...base,
        recents: [],
        groups: [
          {...base.groups[0]!, items: [items[0]!, items[1]!]},
          {...base.groups[1]!, items: [items[2]!]},
        ],
      };
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <HubView model={model} onOpenDestination={jest.fn()} />,
        );
      });

      expect(
        gridTiles(tree!, 'hub-grid-all').map(
          tile => tile.findByType(Text).props.children,
        ),
      ).toEqual(expected);
      expect(
        model.groups.flatMap(group => group.items).map(item => item.title),
      ).toEqual(titles);
      expect(
        tree!.root.findAllByProps({testID: 'hub-category-picker'}),
      ).toHaveLength(0);
      expect(
        button(tree!, 'hub-filter-toggle').props.accessibilityState,
      ).toEqual({expanded: false});
      expect(button(tree!, 'hub-filter-toggle').props['aria-expanded']).toBe(
        false,
      );
      expect(tree!.root.findAllByType(ScrollView)).toHaveLength(1);
      act(() => tree!.unmount());
    },
  );

  it('includes launchable child screens beside their parent modules', () => {
    const model = makeModel();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={jest.fn()} />,
      );
    });

    expect(gridTiles(tree!, 'hub-grid-all')).toHaveLength(
      allItems(model).length,
    );
    expect(
      button(tree!, `hub-grid-all-tile-${CORE_DESTINATION_IDS.trends}`),
    ).toBeDefined();
    expect(
      button(
        tree!,
        `hub-grid-all-tile-${CORE_DESTINATION_IDS.trendsAgpDailyPatterns}`,
      ),
    ).toBeDefined();
    const tileIDs = gridTiles(tree!, 'hub-grid-all').map(
      tile => tile.props.testID,
    );
    expect(new Set(tileIDs).size).toBe(tileIDs.length);
    act(() => tree!.unmount());
  });

  it('places at most eight recent screens in visit order above the library and snapshot', () => {
    const base = makeModel();
    const recents = allItems(base).slice(0, 10).reverse();
    const model = {...base, recents};
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView
          currentSnapshot={{
            status: 'ready',
            target: base.favorites[0]!.resolved,
          }}
          model={model}
          onOpenDestination={jest.fn()}
        />,
      );
    });

    expect(
      gridTiles(tree!, 'hub-grid-recents').map(tile => tile.props.testID),
    ).toEqual(
      recents.slice(0, 8).map(item => `hub-grid-recents-tile-${item.key}`),
    );
    expect(
      tree!.root
        .findAll(
          node =>
            node.type === View &&
            [
              'hub-section-recents',
              'hub-section-all-modules',
              'hub-section-snapshot',
            ].includes(node.props.testID),
        )
        .map(node => node.props.testID),
    ).toEqual([
      'hub-section-recents',
      'hub-section-all-modules',
      'hub-section-snapshot',
    ]);
    expect(
      tree!.root.findAllByProps({testID: 'hub-quick-access-toggle'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('omits Recent when empty or disabled while keeping the full library', () => {
    const model = makeModel();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView
          model={{...model, recents: []}}
          onOpenDestination={jest.fn()}
        />,
      );
    });
    expect(
      tree!.root.findAllByProps({testID: 'hub-section-recents'}),
    ).toHaveLength(0);
    act(() => {
      tree!.update(
        <HubView
          model={model}
          onOpenDestination={jest.fn()}
          showRecents={false}
        />,
      );
    });
    expect(
      tree!.root.findAllByProps({testID: 'hub-section-recents'}),
    ).toHaveLength(0);
    expect(gridTiles(tree!, 'hub-grid-all')).toHaveLength(
      allItems(model).length,
    );
    act(() => tree!.unmount());
  });

  it('filters only on request and resets to all screens when the filter is closed', () => {
    const model = makeModel();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={jest.fn()} />,
      );
    });

    act(() => button(tree!, 'hub-filter-toggle').props.onPress());
    expect(button(tree!, 'hub-filter-toggle').props['aria-expanded']).toBe(
      true,
    );
    expect(button(tree!, 'hub-category-all').props.accessibilityState).toEqual({
      selected: true,
    });
    act(() => button(tree!, 'hub-category-record').props.onPress());
    expect(button(tree!, 'hub-category-record').props.accessibilityRole).toBe(
      'button',
    );
    expect(
      button(tree!, 'hub-category-record').props.accessibilityState,
    ).toEqual({selected: true});
    expect(gridTiles(tree!, 'hub-grid-all')).toHaveLength(0);
    expect(gridTiles(tree!, 'hub-grid-record')).toHaveLength(
      model.groups.find(group => group.id === 'record')!.items.length,
    );
    expect(gridTiles(tree!, 'hub-grid-recents')).toHaveLength(
      model.recents.length,
    );

    act(() => button(tree!, 'hub-filter-toggle').props.onPress());
    expect(
      tree!.root.findAllByProps({testID: 'hub-category-picker'}),
    ).toHaveLength(0);
    expect(gridTiles(tree!, 'hub-grid-all')).toHaveLength(
      allItems(model).length,
    );
    expect(gridTiles(tree!, 'hub-grid-record')).toHaveLength(0);
    act(() => button(tree!, 'hub-filter-toggle').props.onPress());
    expect(button(tree!, 'hub-category-all').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(
      button(tree!, 'hub-category-record').props.accessibilityState,
    ).toEqual({selected: false});
    act(() => tree!.unmount());
  });

  it('returns to all screens when the selected category disappears', () => {
    const model = makeModel();
    const onOpenDestination = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={onOpenDestination} />,
      );
    });
    act(() => button(tree!, 'hub-filter-toggle').props.onPress());
    act(() => button(tree!, 'hub-category-ask').props.onPress());
    act(() =>
      tree!.update(
        <HubView
          model={{
            ...model,
            groups: model.groups.filter(group => group.id !== 'ask'),
          }}
          onOpenDestination={onOpenDestination}
        />,
      ),
    );
    expect(button(tree!, 'hub-category-all').props.accessibilityState).toEqual({
      selected: true,
    });
    act(() =>
      tree!.update(
        <HubView model={model} onOpenDestination={onOpenDestination} />,
      ),
    );
    expect(button(tree!, 'hub-category-all').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(button(tree!, 'hub-category-ask').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(gridTiles(tree!, 'hub-grid-ask')).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('keeps explicitly favorited hidden screens reachable through the Favorites filter', () => {
    const model = selectHubViewModel(coreDestinationRegistry, {
      locale: 'en',
      runtime: {platform: 'ios'},
      preferences: {
        favorites: [createStoredDestinationTarget(CORE_DESTINATION_IDS.meals)],
        hiddenModuleIds: new Set([CORE_DESTINATION_IDS.meals]),
      },
    });
    const onOpen = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={onOpen} />,
      );
    });
    expect(
      tree!.root.findAllByProps({
        testID: `hub-grid-all-tile-${CORE_DESTINATION_IDS.meals}`,
      }),
    ).toHaveLength(0);
    act(() => button(tree!, 'hub-filter-toggle').props.onPress());
    act(() => button(tree!, 'hub-category-favorites').props.onPress());
    act(() =>
      button(
        tree!,
        `hub-grid-favorites-tile-${CORE_DESTINATION_IDS.meals}`,
      ).props.onPress(),
    );
    expect(onOpen).toHaveBeenCalledWith(model.favorites[0]!.resolved);
    act(() => tree!.unmount());
  });

  it('uses only names and icons on tiles while preserving RTL, status announcements, and customization', () => {
    const model = makeModel('he');
    const onOpen = jest.fn();
    const onCustomize = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView
          model={model}
          onOpenDestination={onOpen}
          onCustomize={onCustomize}
        />,
      );
    });

    const day = allItems(model).find(
      item => item.key === CORE_DESTINATION_IDS.dayGraph,
    )!;
    const tileID = `hub-grid-all-tile-${day.key}`;
    const tile = button(tree!, tileID);
    expect(tile.findAllByType(Text).map(text => text.props.children)).toEqual([
      day.title,
    ]);
    expect(tile.findByType(Text).props.numberOfLines).toBe(2);
    expect(tile.props.accessibilityLabel).toContain(day.description);
    expect(tile.props.accessibilityHint).toBe(
      'לחיצה ארוכה פותחת את התאמת הכלים.',
    );
    expect(
      tree!.root.findByProps({testID: `${tileID}-icon-glyph`}).props.name,
    ).toBe('show-chart');
    act(() => tile.props.onPress());
    expect(onOpen).toHaveBeenCalledWith(day.resolved);
    act(() => tile.props.onLongPress());
    expect(onCustomize).toHaveBeenCalledWith('quick-access');

    const updateID = `hub-grid-all-tile-${CORE_DESTINATION_IDS.updateCenter}`;
    expect(button(tree!, updateID).props.accessibilityLabel).toContain('3 new');
    expect(
      button(tree!, updateID)
        .findAllByType(Text)
        .map(text => text.props.children),
    ).not.toContain('3 new');
    const badge = tree!.root.findByProps({testID: `${updateID}-badge`});
    expect(badge.parent?.props.accessibilityElementsHidden).toBe(true);
    const grid = tree!.root
      .findAllByProps({testID: 'hub-grid-all'})
      .find(node => node.type === View);
    expect(StyleSheet.flatten(grid?.props.style).flexDirection).toBe(
      'row-reverse',
    );
    act(() => button(tree!, 'hub-customize').props.onPress());
    expect(onCustomize).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
  });

  it('announces unavailable screens and only enables them with an explanation handler', () => {
    const model = selectHubViewModel(coreDestinationRegistry, {
      locale: 'en',
      runtime: {
        platform: 'ios',
        disabledDestinations: new Map([
          [CORE_DESTINATION_IDS.dayGraph, 'Connection needed.'],
        ]),
      },
      preferences: {favorites: []},
    });
    const onOpen = jest.fn();
    const onUnavailable = jest.fn();
    const tileID = `hub-grid-all-tile-${CORE_DESTINATION_IDS.dayGraph}`;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={onOpen} />,
      );
    });
    expect(button(tree!, tileID).props.disabled).toBe(true);
    expect(button(tree!, tileID).props.accessibilityLabel).toContain(
      'Connection needed.',
    );
    expect(button(tree!, tileID).props.accessibilityLabel).toContain(
      'Unavailable',
    );
    act(() =>
      tree!.update(
        <HubView
          model={model}
          onOpenDestination={onOpen}
          onUnavailableDestination={onUnavailable}
        />,
      ),
    );
    expect(button(tree!, tileID).props.disabled).toBe(false);
    act(() => button(tree!, tileID).props.onPress());
    expect(onUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({status: 'unavailable'}),
    );
    expect(onOpen).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('announces every fact shown in the optional current snapshot', () => {
    const model = makeModel();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HubView
          currentSnapshot={{
            status: 'stale',
            target: model.favorites[0]!.resolved,
            glucoseLabel: '117 mg/dL',
            trendLabel: '↑↑',
            dataAgeLabel: '4 minutes ago',
            iobLabel: 'IOB 1.23 U',
            cobLabel: 'COB 12 g',
            message: 'Last reading is stale.',
          }}
          model={model}
          onOpenDestination={jest.fn()}
        />,
      );
    });
    expect(
      tree!.root.findByProps({testID: 'hub-current-snapshot'}).props
        .accessibilityLabel,
    ).toBe(
      'Current snapshot. Stale data. 117 mg/dL. ↑↑. 4 minutes ago. IOB 1.23 U. COB 12 g. Last reading is stale.',
    );
    act(() => tree!.unmount());
  });
});
