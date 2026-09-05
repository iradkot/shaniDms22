import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Dimensions, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../src/product/destinations';
import {
  DestinationCard,
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../../src/product/ui';

const resolveOverview = (disabled = false) =>
  resolveDestinationTarget(
    coreDestinationRegistry,
    createStoredDestinationTarget(CORE_DESTINATION_IDS.trendsOverview),
    undefined,
    {
      platform: 'ios',
      ...(disabled
        ? {
            disabledDestinations: new Map([
              [CORE_DESTINATION_IDS.trendsOverview, 'Temporarily unavailable'],
            ]),
          }
        : {}),
    },
  );

describe('Product UI Module', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');

  afterEach(() => {
    jest.restoreAllMocks();
    Dimensions.set({window: originalWindow, screen: originalScreen});
  });

  it('opens an available Destination through the card interface', () => {
    const destination = resolveOverview();
    const onOpen = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <DestinationCard
          destination={destination}
          locale="en"
          onOpen={onOpen}
          testID="destination-card"
        />,
      );
    });

    const card = tree!.root.findByType(Pressable);
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({disabled: false});
    expect(card.props.accessibilityLabel).toContain(
      'Range distribution, level, variability, coverage',
    );
    expect(
      StyleSheet.flatten(card.props.style({pressed: false})).minHeight,
    ).toBe(104);
    expect(
      tree!.root
        .findAllByType(Text)
        .find(
          node =>
            node.props.children ===
            'Range distribution, level, variability, coverage, and a matched previous period.',
        )?.props.numberOfLines,
    ).toBe(2);

    act(() => card.props.onPress());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(destination);
    expect(
      tree!.root
        .findAllByType(Text)
        .some(node => node.props.children === 'Overview'),
    ).toBe(true);

    act(() => tree!.unmount());
  });

  it('keeps an unavailable Destination disabled and localizes its state', () => {
    const onOpen = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <DestinationCard
          destination={resolveOverview(true)}
          locale="he"
          onOpen={onOpen}
          testID="destination-card"
        />,
      );
    });

    const card = tree!.root.findByType(Pressable);
    expect(card.props.disabled).toBe(true);
    expect(card.props.accessibilityState).toEqual({disabled: true});

    act(() => card.props.onPress());
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      tree!.root
        .findAllByType(Text)
        .some(node => node.props.children === 'לא זמין במכשיר הזה'),
    ).toBe(true);

    act(() => tree!.unmount());
  });

  it('owns responsive columns and RTL row ordering', () => {
    Dimensions.set({
      window: {fontScale: 1, height: 800, scale: 1, width: 900},
      screen: {fontScale: 1, height: 800, scale: 1, width: 900},
    });
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ResponsiveGrid locale="he" testID="responsive-grid">
          <Text>First</Text>
          <Text>Second</Text>
        </ResponsiveGrid>,
      );
    });

    const grid = tree!.root
      .findAllByProps({testID: 'responsive-grid'})
      .find(node => node.type === View);
    expect(StyleSheet.flatten(grid?.props.style).flexDirection).toBe(
      'row-reverse',
    );
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'responsive-grid-item-0'}).props.style,
      ).width,
    ).toBe(productUiTokens.layout.threeColumnItemWidth);
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'responsive-grid-item-0'}).props.style,
      ).alignSelf,
    ).toBe('stretch');

    act(() => {
      Dimensions.set({
        window: {fontScale: 1, height: 800, scale: 1, width: 500},
        screen: {fontScale: 1, height: 800, scale: 1, width: 500},
      });
    });
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'responsive-grid-item-0'}).props.style,
      ).width,
    ).toBe(productUiTokens.layout.twoColumnItemWidth);

    act(() => tree!.unmount());
  });

  it('provides localized page framing and section headings', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ProductPage
          locale="he"
          subtitle="תיאור"
          testID="product-page"
          title="כותרת">
          <ProductSection locale="he" title="חלק">
            <Text>תוכן</Text>
          </ProductSection>
        </ProductPage>,
      );
    });

    const headers = tree!.root
      .findAllByType(Text)
      .filter(node => node.props.accessibilityRole === 'header');
    expect(headers.map(header => header.props.children)).toEqual([
      'כותרת',
      'חלק',
    ]);
    expect(StyleSheet.flatten(headers[0]?.props.style).writingDirection).toBe(
      'rtl',
    );

    act(() => tree!.unmount());
  });
});
