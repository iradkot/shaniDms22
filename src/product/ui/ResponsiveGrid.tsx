import React, {Children} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';
import type {ReactNode} from 'react';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from './tokens';

export type ProductGridColumnCount = 2 | 3;

/**
 * The single responsive decision shared by the main Hub and internal Hubs.
 * Product pages stay dense on phones and gain one column on wider layouts.
 */
export const useProductGridColumnCount = (): ProductGridColumnCount => {
  const {width} = useWindowDimensions();
  return Number.isFinite(width) &&
    width >= productUiTokens.layout.threeColumnMinViewportWidth
    ? 3
    : 2;
};

export interface ResponsiveGridProps {
  readonly locale: DestinationLocale;
  readonly children: ReactNode;
  readonly testID?: string;
}

/**
 * Owns the two/three-column decision and RTL row ordering for Product cards.
 * Items remain full-width inside their grid cell.
 */
export const ResponsiveGrid = ({
  locale,
  children,
  testID,
}: ResponsiveGridProps) => {
  const columns = useProductGridColumnCount();
  const itemWidth =
    columns === 3
      ? productUiTokens.layout.threeColumnItemWidth
      : productUiTokens.layout.twoColumnItemWidth;

  return (
    <View
      style={[styles.grid, locale === 'he' && styles.rowReverse]}
      testID={testID}>
      {Children.map(children, (child, index) => (
        <View
          style={[styles.item, {width: itemWidth}]}
          testID={testID ? `${testID}-item-${index}` : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    columnGap: productUiTokens.spacing.md,
    justifyContent: 'flex-start',
    rowGap: productUiTokens.spacing.md,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  item: {alignSelf: 'stretch'},
});
