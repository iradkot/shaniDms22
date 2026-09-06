import React from 'react';
import {StyleSheet, Text, type ScrollView} from 'react-native';
import {ChartScrollView} from '../../components/charts/interaction/ChartScrollView';
import type {ReactNode, Ref} from 'react';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from './tokens';

export interface ProductPageProps {
  readonly locale: DestinationLocale;
  readonly title: string;
  readonly subtitle: string;
  readonly testID: string;
  readonly children: ReactNode;
  readonly scrollRef?: Ref<ScrollView>;
}

/** Shared page framing for destination landing views. */
export const ProductPage = ({
  locale,
  title,
  subtitle,
  testID,
  children,
  scrollRef,
}: ProductPageProps) => {
  const rtl = locale === 'he';

  return (
    <ChartScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.title, rtl && styles.rtlText]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, rtl && styles.rtlText]}>{subtitle}</Text>
      {children}
    </ChartScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: productUiTokens.colors.page},
  content: {
    width: '100%',
    maxWidth: productUiTokens.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingTop: productUiTokens.spacing.lg,
    paddingBottom: productUiTokens.spacing.pageBottom,
  },
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  title: {
    color: productUiTokens.colors.text,
    fontSize: 27,
    fontWeight: '700',
    lineHeight: 34,
  },
  subtitle: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xs,
  },
});
