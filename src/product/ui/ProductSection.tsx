import React from 'react';
import {StyleSheet, Text} from 'react-native';
import type {ReactNode} from 'react';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from './tokens';

export interface ProductSectionProps {
  readonly locale: DestinationLocale;
  readonly title: string;
  readonly children: ReactNode;
}

/** A titled section without adding an extra native layout wrapper. */
export const ProductSection = ({
  locale,
  title,
  children,
}: ProductSectionProps) => {
  const rtl = locale === 'he';

  return (
    <>
      <Text
        accessibilityRole="header"
        style={[styles.title, rtl && styles.rtlText]}>
        {title}
      </Text>
      {children}
    </>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  title: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: productUiTokens.spacing.xl,
    marginBottom: productUiTokens.spacing.sm,
  },
});
