import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  ResolvedDestinationTarget,
} from '../destinations';
import {productUiTokens} from './tokens';

const UNAVAILABLE_COPY: Readonly<Record<DestinationLocale, string>> = {
  en: 'Unavailable on this device',
  he: 'לא זמין במכשיר הזה',
};

export interface DestinationCardProps {
  readonly destination: ResolvedDestinationTarget;
  readonly locale: DestinationLocale;
  readonly onOpen: (destination: AvailableDestinationTarget) => void;
  readonly testID: string;
  readonly minimumHeight?: number;
}

/**
 * Renders availability, localized destination copy, RTL direction and the
 * guarded navigation interaction behind one interface.
 */
export const DestinationCard = ({
  destination,
  locale,
  onOpen,
  testID,
  minimumHeight = 104,
}: DestinationCardProps) => {
  const copy = destination.destination?.copy[locale];
  if (!copy) {
    return null;
  }

  const rtl = locale === 'he';
  const unavailable = destination.status === 'unavailable';

  return (
    <Pressable
      accessibilityLabel={`${copy.title}. ${copy.description}${
        unavailable ? `. ${UNAVAILABLE_COPY[locale]}` : ''
      }`}
      accessibilityRole="button"
      accessibilityState={{disabled: unavailable}}
      disabled={unavailable}
      onPress={() => {
        if (destination.status === 'available') {
          onOpen(destination);
        }
      }}
      style={({pressed}) => [
        styles.card,
        {minHeight: minimumHeight},
        unavailable && styles.disabled,
        pressed && !unavailable && styles.pressed,
      ]}
      testID={testID}>
      <View style={[styles.titleRow, rtl && styles.rowReverse]}>
        <Text numberOfLines={2} style={[styles.title, rtl && styles.rtlText]}>
          {copy.title}
        </Text>
        <Text
          accessibilityElementsHidden
          accessible={false}
          style={styles.chevron}>
          {rtl ? '‹' : '›'}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={[styles.description, rtl && styles.rtlText]}>
        {copy.description}
      </Text>
      {unavailable ? (
        <Text style={[styles.unavailable, rtl && styles.rtlText]}>
          {UNAVAILABLE_COPY[locale]}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    width: '100%',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  title: {
    flex: 1,
    color: productUiTokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  description: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.xs,
  },
  chevron: {
    color: productUiTokens.colors.action,
    fontSize: 22,
    lineHeight: 22,
    marginHorizontal: productUiTokens.spacing.xs,
  },
  unavailable: {
    color: productUiTokens.colors.danger,
    fontSize: 12,
    lineHeight: 16,
    marginTop: productUiTokens.spacing.xs,
  },
  disabled: {opacity: productUiTokens.opacity.disabled},
  pressed: {opacity: productUiTokens.opacity.pressed},
});
