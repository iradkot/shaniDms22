import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

export type JournalButtonTone = 'primary' | 'secondary' | 'danger' | 'quiet';

export const JournalButton = ({
  label,
  onPress,
  testID,
  disabled = false,
  tone = 'secondary',
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
  readonly tone?: JournalButtonTone;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{disabled}}
    disabled={disabled}
    onPress={onPress}
    style={({pressed}) => [
      styles.button,
      tone === 'primary' && styles.primaryButton,
      tone === 'danger' && styles.dangerButton,
      tone === 'quiet' && styles.quietButton,
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
    ]}
    testID={testID}>
    <Text
      style={[
        styles.buttonLabel,
        tone === 'primary' && styles.primaryButtonLabel,
        tone === 'danger' && styles.dangerButtonLabel,
      ]}>
      {label}
    </Text>
  </Pressable>
);

export const JournalChoice = ({
  label,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="radio"
    accessibilityState={{selected}}
    onPress={onPress}
    style={({pressed}) => [
      styles.choice,
      selected && styles.choiceSelected,
      pressed && styles.pressed,
    ]}
    testID={testID}>
    <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
      {label}
    </Text>
  </Pressable>
);

export const JournalField = ({
  label,
  value,
  onChangeText,
  testID,
  locale,
  inputMode,
  multiline = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly testID: string;
  readonly locale: 'en' | 'he';
  readonly inputMode?: 'text' | 'decimal' | 'numeric';
  readonly multiline?: boolean;
}) => (
  <View style={styles.field}>
    <Text
      style={[styles.fieldLabel, locale === 'he' && styles.rtlText]}
      nativeID={`${testID}-label`}>
      {label}
    </Text>
    <TextInput
      accessibilityLabel={label}
      inputMode={inputMode}
      keyboardType={
        inputMode === 'decimal'
          ? 'decimal-pad'
          : inputMode === 'numeric'
          ? 'number-pad'
          : 'default'
      }
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={label}
      style={[
        styles.input,
        multiline && styles.multiline,
        locale === 'he' && styles.rtlText,
      ]}
      testID={testID}
      value={value}
    />
  </View>
);

export const JournalNotice = ({
  message,
  locale,
  tone = 'error',
  testID,
}: {
  readonly message: string;
  readonly locale: 'en' | 'he';
  readonly tone?: 'error' | 'success' | 'info';
  readonly testID?: string;
}) => (
  <View
    accessibilityRole={tone === 'error' ? 'alert' : undefined}
    style={[
      styles.notice,
      tone === 'error' && styles.errorNotice,
      tone === 'success' && styles.successNotice,
    ]}
    testID={testID}>
    <Text
      style={[
        styles.noticeText,
        tone === 'error' && styles.errorNoticeText,
        locale === 'he' && styles.rtlText,
      ]}>
      {message}
    </Text>
  </View>
);

export const JournalFormActions = ({
  children,
  locale,
}: {
  readonly children: React.ReactNode;
  readonly locale: 'en' | 'he';
}) => (
  <View style={[styles.actions, locale === 'he' && styles.rowReverse]}>
    {children}
  </View>
);

export const JournalChoiceRow = ({
  children,
  locale,
}: {
  readonly children: React.ReactNode;
  readonly locale: 'en' | 'he';
}) => (
  <View style={[styles.choices, locale === 'he' && styles.rowReverse]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#2B6CB0',
    borderWidth: 1,
    borderRadius: 12,
    marginEnd: 8,
    marginBottom: 8,
    paddingHorizontal: 15,
  },
  primaryButton: {backgroundColor: '#1769AA', borderColor: '#1769AA'},
  dangerButton: {backgroundColor: '#FFF4F2', borderColor: '#C5423B'},
  quietButton: {borderColor: 'transparent'},
  buttonLabel: {color: '#1769AA', fontSize: 14, fontWeight: '700'},
  primaryButtonLabel: {color: '#FFFFFF'},
  dangerButtonLabel: {color: '#A22D28'},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.7},
  choice: {
    minHeight: 40,
    justifyContent: 'center',
    borderColor: '#C8D0D8',
    borderWidth: 1,
    borderRadius: 20,
    marginEnd: 8,
    marginBottom: 8,
    paddingHorizontal: 13,
  },
  choiceSelected: {backgroundColor: '#E7F1FA', borderColor: '#1769AA'},
  choiceLabel: {color: '#5C6875', fontSize: 14, fontWeight: '600'},
  choiceLabelSelected: {color: '#1769AA'},
  field: {marginBottom: 12},
  fieldLabel: {
    color: '#253444',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 5,
  },
  input: {
    minHeight: 48,
    borderColor: '#C8D0D8',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    color: '#17202A',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  multiline: {minHeight: 88, textAlignVertical: 'top'},
  notice: {
    borderRadius: 10,
    backgroundColor: '#EAF4FC',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorNotice: {backgroundColor: '#FCE9E7'},
  successNotice: {backgroundColor: '#E5F6EC'},
  noticeText: {color: '#355268', fontSize: 14, lineHeight: 20},
  errorNoticeText: {color: '#8F2F29'},
  actions: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  choices: {flexDirection: 'row', flexWrap: 'wrap'},
});
