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
import {productUiTokens} from 'app/product/ui';

const setViewportWidth = (width: number) => {
  const dimensions = {fontScale: 1, height: 800, scale: 1, width};
  Dimensions.set({window: dimensions, screen: dimensions});
};

const makeModel = (locale: 'en' | 'he' = 'en') =>
  selectHubViewModel(coreDestinationRegistry, {
    locale,
    runtime: {platform: 'ios'},
    recentLimit: 5,
    operationalBadges: new Map([
      [CORE_DESTINATION_IDS.updateCenter, {label: '3 new'}],
    ]),
    preferences: {
      favorites: [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.trends,
        CORE_DESTINATION_IDS.aiAnalyst,
        CORE_DESTINATION_IDS.meals,
        CORE_DESTINATION_IDS.updateCenter,
      ].map(createStoredDestinationTarget),
      recents: [
        CORE_DESTINATION_IDS.settings,
        CORE_DESTINATION_IDS.alertRules,
        CORE_DESTINATION_IDS.activity,
        CORE_DESTINATION_IDS.previousDaySummary,
        CORE_DESTINATION_IDS.hypoInvestigation,
      ].map((destinationId, index) => ({
        target: createStoredDestinationTarget(destinationId),
        visitedAt: 10 - index,
      })),
    },
  });

const gridItems = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    node =>
      node.type === View &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith(`${testID}-item-`),
  );

const pressableByTestId = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable || node.props.onPress !== undefined);

describe('HubView', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');

  afterEach(() => {
    jest.restoreAllMocks();
    Dimensions.set({window: originalWindow, screen: originalScreen});
  });

  it('keeps quick access to one two-column phone row and expands favorites', () => {
    setViewportWidth(390);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={makeModel()} onOpenDestination={jest.fn()} />,
      );
    });

    expect(gridItems(tree!, 'hub-grid-favorites')).toHaveLength(2);
    expect(gridItems(tree!, 'hub-grid-recents')).toHaveLength(2);
    expect(
      StyleSheet.flatten(gridItems(tree!, 'hub-grid-favorites')[0]?.props.style)
        .width,
    ).toBe(productUiTokens.layout.twoColumnItemWidth);

    const toggle = pressableByTestId(tree!, 'hub-favorites-toggle');
    expect(toggle?.props.accessibilityState).toEqual({expanded: false});

    act(() => toggle?.props.onPress());
    expect(gridItems(tree!, 'hub-grid-favorites')).toHaveLength(5);
    expect(
      tree!.root
        .findAllByProps({testID: 'hub-favorites-toggle'})
        .some(node =>
          node
            .findAllByType(Text)
            .some(text => text.props.children === 'Show less'),
        ),
    ).toBe(true);

    act(() =>
      pressableByTestId(tree!, 'hub-favorites-toggle')?.props.onPress(),
    );
    expect(gridItems(tree!, 'hub-grid-favorites')).toHaveLength(2);

    act(() => tree!.unmount());
  });

  it('shows three quick-access tiles per row on a wide viewport', () => {
    setViewportWidth(900);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={makeModel()} onOpenDestination={jest.fn()} />,
      );
    });

    expect(gridItems(tree!, 'hub-grid-favorites')).toHaveLength(3);
    expect(gridItems(tree!, 'hub-grid-recents')).toHaveLength(3);
    expect(
      StyleSheet.flatten(gridItems(tree!, 'hub-grid-favorites')[0]?.props.style)
        .width,
    ).toBe(productUiTokens.layout.threeColumnItemWidth);

    act(() => tree!.unmount());
  });

  it('does not spend vertical space on an empty Recent section', () => {
    setViewportWidth(390);
    const model = {...makeModel(), recents: []};
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={jest.fn()} />,
      );
    });

    expect(
      tree!.root.findAllByProps({testID: 'hub-section-recents'}),
    ).toHaveLength(0);

    act(() => tree!.unmount());
  });

  it('announces every fact shown in the current snapshot', () => {
    const model = makeModel();
    const target = model.groups
      .reduce<HubItem[]>((items, group) => [...items, ...group.items], [])
      .find(item => item.key === CORE_DESTINATION_IDS.dayGraph)?.resolved;
    if (!target) {
      throw new Error('Expected the day graph Destination.');
    }
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView
          currentSnapshot={{
            status: 'stale',
            target,
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

  it('uses compact category cards and reveals one Module group at a time', () => {
    setViewportWidth(390);
    const model = makeModel();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={jest.fn()} />,
      );
    });

    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(1);
    expect(
      tree!.root.findAllByProps({testID: 'hub-section-all-modules'}),
    ).not.toHaveLength(0);

    model.groups.forEach(group => {
      expect(
        tree!.root.findAllByProps({testID: `hub-category-${group.id}`}),
      ).not.toHaveLength(0);
      const count = tree!.root.findByProps({
        testID: `hub-category-${group.id}-count`,
      });
      expect(count.props.accessible).toBe(false);
      expect(count.props.accessibilityElementsHidden).toBe(true);
      expect(
        tree!.root.findByProps({
          accessibilityLabel: `${group.title}: ${group.items.length}`,
        }).props.accessibilityRole,
      ).toBe('tab');
    });

    const todayGroup = model.groups.find(group => group.id === 'today');
    if (!todayGroup) {
      throw new Error('Expected the Today Module group.');
    }
    expect(gridItems(tree!, 'hub-grid-today')).toHaveLength(
      todayGroup.items.length,
    );
    expect(gridItems(tree!, 'hub-grid-ask')).toHaveLength(0);

    act(() =>
      pressableByTestId(tree!, 'hub-category-ask')?.props.onPress(),
    );
    expect(
      tree!.root.findAllByProps({
        testID: `hub-grid-ask-tile-${CORE_DESTINATION_IDS.aiAnalyst}`,
      }).length,
    ).toBeGreaterThan(0);
    expect(gridItems(tree!, 'hub-grid-today')).toHaveLength(0);
    const askGrid = tree!.root
      .findAllByProps({testID: 'hub-grid-ask'})
      .find(node => node.type === View);
    expect(StyleSheet.flatten(askGrid?.props.style).alignItems).toBe(
      'flex-start',
    );

    act(() => tree!.unmount());
  });

  it('keeps compact accessible tiles, navigation, badges, and long press', () => {
    setViewportWidth(390);
    const onOpen = jest.fn();
    const onCustomize = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView
          model={makeModel('he')}
          onCustomize={onCustomize}
          onOpenDestination={onOpen}
        />,
      );
    });

    const dayTile = pressableByTestId(
      tree!,
      `hub-grid-favorites-tile-${CORE_DESTINATION_IDS.dayGraph}`,
    );
    expect(dayTile?.props.accessibilityRole).toBe('button');
    expect(dayTile?.props.accessibilityState).toEqual({disabled: false});
    expect(dayTile?.props.accessibilityHint).toBe(
      'לחיצה ארוכה פותחת את התאמת המודולים.',
    );

    act(() => dayTile?.props.onPress());
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'available',
        destination: expect.objectContaining({
          id: CORE_DESTINATION_IDS.dayGraph,
        }),
      }),
    );
    act(() => dayTile?.props.onLongPress());
    expect(onCustomize).toHaveBeenCalledWith('quick-access');

    const dayTileView = tree!.root
      .findAllByProps({
        testID: `hub-grid-favorites-tile-${CORE_DESTINATION_IDS.dayGraph}`,
      })
      .find(node => node.type === View);
    expect(StyleSheet.flatten(dayTileView?.props.style).minHeight).toBe(116);
    expect(StyleSheet.flatten(dayTileView?.props.style).flexGrow).toBe(1);
    const description = dayTile
      ?.findAllByType(Text)
      .find(
        text =>
          text.props.children === 'סוכר, טיפולים ואירועים לאורך היום שנבחר.',
      );
    expect(description?.props.numberOfLines).toBe(2);
    act(() =>
      pressableByTestId(tree!, 'hub-favorites-toggle')?.props.onPress(),
    );
    expect(
      tree!.root
        .findAllByType(Text)
        .some(text => text.props.children === '3 new'),
    ).toBe(true);

    const favoritesGrid = tree!.root
      .findAllByProps({testID: 'hub-grid-favorites'})
      .find(node => node.type === View);
    expect(StyleSheet.flatten(favoritesGrid?.props.style).flexDirection).toBe(
      'row-reverse',
    );
    expect(
      StyleSheet.flatten(gridItems(tree!, 'hub-grid-favorites')[0]?.props.style)
        .alignSelf,
    ).toBe('stretch');

    const renderedTileIDs = tree!.root
      .findAllByType(Pressable)
      .map(node => node.props.testID)
      .filter(
        (testID): testID is string =>
          typeof testID === 'string' && testID.includes('-tile-'),
      );
    expect(new Set(renderedTileIDs).size).toBe(renderedTileIDs.length);

    act(() => tree!.unmount());
  });

  it('gives destinations semantic icons and distinct category colors', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={makeModel()} onOpenDestination={jest.fn()} />,
      );
    });

    const dayTestID =
      `hub-grid-today-tile-${CORE_DESTINATION_IDS.dayGraph}` as const;
    const aiTestID =
      `hub-grid-ask-tile-${CORE_DESTINATION_IDS.aiAnalyst}` as const;
    const dayTile = tree!.root
      .findAllByProps({testID: dayTestID})
      .find(node => node.type === View);
    const dayTileStyle = StyleSheet.flatten(dayTile?.props.style);
    const dayIconProps = tree!.root.findByProps({
      testID: `${dayTestID}-icon-glyph`,
    }).props;
    act(() =>
      pressableByTestId(tree!, 'hub-category-ask')?.props.onPress(),
    );
    const aiTile = tree!.root
      .findAllByProps({testID: aiTestID})
      .find(node => node.type === View);

    expect(dayTileStyle).toEqual(
      expect.objectContaining({
        backgroundColor: '#EFF6FF',
        borderColor: '#BFDBFE',
      }),
    );
    expect(StyleSheet.flatten(aiTile?.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#FDF4FF',
        borderColor: '#F0ABFC',
      }),
    );
    expect(dayIconProps).toEqual(
      expect.objectContaining({name: 'show-chart', color: '#2563EB'}),
    );
    expect(
      tree!.root.findByProps({testID: `${aiTestID}-icon-glyph`}).props,
    ).toEqual(
      expect.objectContaining({name: 'auto-awesome', color: '#A21CAF'}),
    );

    act(() => tree!.unmount());
  });

  it('keeps a favorited child destination in its owning module color family', () => {
    const model = selectHubViewModel(coreDestinationRegistry, {
      locale: 'en',
      runtime: {platform: 'ios'},
      preferences: {
        favorites: [
          createStoredDestinationTarget(
            CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
          ),
        ],
        recents: [],
      },
    });
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HubView model={model} onOpenDestination={jest.fn()} />,
      );
    });

    const tileTestID =
      `hub-grid-favorites-tile-${CORE_DESTINATION_IDS.trendsAgpDailyPatterns}` as const;
    const tile = tree!.root
      .findAllByProps({testID: tileTestID})
      .find(node => node.type === View);
    expect(StyleSheet.flatten(tile?.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#F5F3FF',
        borderColor: '#DDD6FE',
      }),
    );
    expect(
      tree!.root.findByProps({testID: `${tileTestID}-icon-glyph`}).props.name,
    ).toBe('stacked-line-chart');

    act(() => tree!.unmount());
  });

  it('localizes the Hub chrome and card copy in English and Hebrew', () => {
    let english: renderer.ReactTestRenderer;
    let hebrew: renderer.ReactTestRenderer;

    act(() => {
      english = renderer.create(
        <HubView model={makeModel('en')} onOpenDestination={jest.fn()} />,
      );
      hebrew = renderer.create(
        <HubView model={makeModel('he')} onOpenDestination={jest.fn()} />,
      );
    });

    const hasText = (tree: renderer.ReactTestRenderer, value: string) =>
      tree.root.findAllByType(Text).some(node => node.props.children === value);

    expect(hasText(english!, 'Hub')).toBe(true);
    expect(hasText(english!, 'Favorites')).toBe(true);
    expect(hasText(english!, 'Day graph')).toBe(true);
    expect(hasText(hebrew!, 'המרכז שלי')).toBe(true);
    expect(hasText(hebrew!, 'מועדפים')).toBe(true);
    expect(hasText(hebrew!, 'גרף יומי')).toBe(true);

    const englishDayIcon = english!.root.findByProps({
      testID: `hub-grid-today-tile-${CORE_DESTINATION_IDS.dayGraph}-icon-glyph`,
    });
    const hebrewDayIcon = hebrew!.root.findByProps({
      testID: `hub-grid-today-tile-${CORE_DESTINATION_IDS.dayGraph}-icon-glyph`,
    });
    expect(englishDayIcon.props.name).toBe(hebrewDayIcon.props.name);

    act(() => {
      english!.unmount();
      hebrew!.unmount();
    });
  });
});
