import React from 'react';
import {
  StyleSheet,
  Text,
  type ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
  readonly header?: ReactNode;
  readonly compact?: boolean;
  readonly onLayout?: ScrollViewProps['onLayout'];
  readonly style?: StyleProp<ViewStyle>;
}

/** Shared page framing for destination landing views. */
export const ProductPage = ({
  locale,
  title,
  subtitle,
  testID,
  children,
  scrollRef,
  header,
  compact = false,
  onLayout,
  style,
}: ProductPageProps) => {
  const rtl = locale === 'he';

  return (
    <ChartScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
      onLayout={onLayout}
      style={[styles.screen, style]}
      testID={testID}>
      {header === undefined ? (
        <>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtlText]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, rtl && styles.rtlText]}>
            {subtitle}
          </Text>
        </>
      ) : (
        header
      )}
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
  compactContent: {
    paddingHorizontal: productUiTokens.spacing.sm,
    paddingTop: productUiTokens.spacing.sm,
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
