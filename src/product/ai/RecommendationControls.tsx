import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {AiLocale} from '../../modules/ai';

export const recommendationColors = {
  ink: '#163A38',
  muted: '#5C716E',
  teal: '#116B60',
  border: '#D5E5DF',
  soft: '#EDF6F1',
  page: '#F5F8F5',
} as const;

export const RecommendationButton = ({
  label,
  onPress,
  testID,
  secondary = false,
  disabled = false,
  selected,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly secondary?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly accessibilityLabel?: string;
}) => (
  <Pressable
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityRole="button"
    accessibilityState={{
      disabled,
      ...(selected === undefined ? {} : {selected}),
    }}
    {...(selected === undefined ? {} : {'aria-pressed': selected})}
    disabled={disabled}
    onPress={onPress}
    style={({pressed}) => [
      styles.button,
      secondary && styles.secondary,
      selected && styles.selected,
      disabled && styles.disabled,
      pressed && styles.pressed,
    ]}
    testID={testID}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
      {label}
    </Text>
  </Pressable>
);

export const RecommendationChoice = ({
  label,
  description,
  locale,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly description?: string;
  readonly locale: AiLocale;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{checked: selected}}
    accessibilityLabel={description ? `${label}. ${description}` : label}
    onPress={onPress}
    style={({pressed}) => [
      styles.choice,
      selected && styles.choiceSelected,
      pressed && styles.pressed,
      locale === 'he' && styles.reverse,
    ]}
    testID={testID}>
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
    <View style={styles.choiceContent}>
      <Text style={[styles.choiceLabel, locale === 'he' && styles.rtl]}>
        {label}
      </Text>
      {description ? (
        <Text style={[styles.choiceDescription, locale === 'he' && styles.rtl]}>
          {description}
        </Text>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  reverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.5},
  button: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: recommendationColors.teal,
    borderColor: recommendationColors.teal,
    borderWidth: 1,
    borderRadius: 16,
  },
  buttonText: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
  secondary: {
    backgroundColor: '#FFFFFF',
    borderColor: recommendationColors.border,
  },
  secondaryText: {color: recommendationColors.teal},
  selected: {
    backgroundColor: '#DCEFE5',
    borderColor: recommendationColors.teal,
  },
  choice: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
    padding: 14,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderColor: recommendationColors.border,
    borderWidth: 1,
    borderRadius: 16,
  },
  choiceSelected: {
    backgroundColor: '#E4F2E9',
    borderColor: recommendationColors.teal,
  },
  choiceContent: {flex: 1},
  choiceLabel: {
    color: recommendationColors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  choiceDescription: {
    color: recommendationColors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 3,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#93AFA5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {borderColor: recommendationColors.teal},
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: recommendationColors.teal,
  },
});
