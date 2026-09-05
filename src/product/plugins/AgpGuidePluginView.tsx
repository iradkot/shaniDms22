import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {DestinationLocale} from '../destinations';
import {ProductPage, productUiTokens} from '../ui';

const COPY = {
  en: {
    title: 'How to read AGP',
    subtitle: 'A short, factual guide included in this app build.',
    heading: 'Start with the shape, then inspect the days',
    body: 'The middle line describes the typical glucose pattern. The shaded bands show variation. Open the individual daily profiles to see which days explain a wide band or a data gap.',
    note: 'This guide does not access glucose data and does not make treatment recommendations.',
  },
  he: {
    title: 'איך לקרוא AGP',
    subtitle: 'מדריך עובדתי קצר שנכלל מראש בבילד של האפליקציה.',
    heading: 'מתחילים מהצורה ואז בודקים את הימים',
    body: 'הקו האמצעי מתאר את דפוס הסוכר הטיפוסי. האזורים המוצללים מציגים את השונות. כדאי לפתוח את הפרופילים היומיים כדי לראות אילו ימים מסבירים טווח רחב או חוסר בנתונים.',
    note: 'המדריך לא ניגש לנתוני סוכר ולא נותן המלצות טיפוליות.',
  },
} as const;

export interface AgpGuidePluginViewProps {
  readonly locale: DestinationLocale;
}

/** Safe built-in Runtime Plugin implementation; it renders no remote markup. */
export const AgpGuidePluginView = ({locale}: AgpGuidePluginViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="runtime-plugin-agp-guide"
      title={copy.title}>
      <View style={styles.card}>
        <Text style={[styles.heading, rtl && styles.rtl]}>{copy.heading}</Text>
        <Text style={[styles.body, rtl && styles.rtl]}>{copy.body}</Text>
        <Text style={[styles.note, rtl && styles.rtl]}>{copy.note}</Text>
      </View>
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.featuredCard,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  heading: {
    color: productUiTokens.colors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25,
  },
  body: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    lineHeight: 23,
    marginTop: productUiTokens.spacing.md,
  },
  note: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: productUiTokens.spacing.lg,
  },
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
});
