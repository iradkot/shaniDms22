import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {AlertRule, AlertRuleInput, AlertRuleTrend} from '../../modules/alerts';
import {
  ALERT_RULE_TRENDS,
  formatClockTime,
  parseClockTime,
  validateAlertRuleInput,
} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';

const COPY = {
  en: {
    addTitle: 'New alert rule',
    editTitle: 'Edit alert rule',
    name: 'Rule name',
    lower: 'Lower glucose limit (mg/dL)',
    upper: 'Upper glucose limit (mg/dL)',
    from: 'Active from (HH:mm)',
    to: 'Active until (HH:mm)',
    overnight: 'A start time after the end time creates an overnight window.',
    trend: 'Required trend',
    cancel: 'Cancel',
    save: 'Save rule',
    saving: 'Saving…',
    trendLabels: {
      any: 'Any trend',
      'double-down': 'Falling very fast',
      'single-down': 'Falling',
      'forty-five-down': 'Falling slowly',
      'forty-five-up': 'Rising slowly',
      'single-up': 'Rising',
      'double-up': 'Rising very fast',
    },
    errors: {
      'name-required': 'Enter a rule name.',
      'name-too-long': 'Keep the rule name to 80 characters or fewer.',
      'glucose-not-integer': 'Glucose limits must be whole numbers.',
      'glucose-out-of-bounds': 'Glucose limits must be between 1 and 1000 mg/dL.',
      'glucose-range-order':
        'The lower glucose limit must be below the upper limit.',
      'time-not-integer': 'Enter each time as HH:mm, for example 06:30.',
      'time-out-of-bounds': 'Enter a valid time between 00:00 and 23:59.',
      'time-window-empty': 'The start and end time cannot be identical.',
    },
  },
  he: {
    addTitle: 'כלל התראה חדש',
    editTitle: 'עריכת כלל התראה',
    name: 'שם הכלל',
    lower: 'גבול סוכר תחתון (mg/dL)',
    upper: 'גבול סוכר עליון (mg/dL)',
    from: 'פעיל משעה (HH:mm)',
    to: 'פעיל עד שעה (HH:mm)',
    overnight: 'שעת התחלה מאוחרת משעת הסיום יוצרת חלון שחוצה חצות.',
    trend: 'מגמה נדרשת',
    cancel: 'ביטול',
    save: 'שמירת הכלל',
    saving: 'שומר…',
    trendLabels: {
      any: 'כל מגמה',
      'double-down': 'ירידה מהירה מאוד',
      'single-down': 'ירידה',
      'forty-five-down': 'ירידה מתונה',
      'forty-five-up': 'עלייה מתונה',
      'single-up': 'עלייה',
      'double-up': 'עלייה מהירה מאוד',
    },
    errors: {
      'name-required': 'צריך להזין שם לכלל.',
      'name-too-long': 'שם הכלל יכול להכיל עד 80 תווים.',
      'glucose-not-integer': 'גבולות הסוכר צריכים להיות מספרים שלמים.',
      'glucose-out-of-bounds': 'גבולות הסוכר צריכים להיות בין 1 ל־1000 mg/dL.',
      'glucose-range-order': 'גבול הסוכר התחתון חייב להיות נמוך מהגבול העליון.',
      'time-not-integer': 'צריך להזין כל שעה במבנה HH:mm, למשל 06:30.',
      'time-out-of-bounds': 'צריך להזין שעה תקינה בין 00:00 ל־23:59.',
      'time-window-empty': 'שעת ההתחלה ושעת הסיום לא יכולות להיות זהות.',
    },
  },
} as const;

const parseInteger = (value: string): number =>
  /^\d+$/.test(value) ? Number(value) : Number.NaN;

export interface AlertRuleFormProps {
  readonly locale: DestinationLocale;
  readonly initialRule?: AlertRule;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: AlertRuleInput) => Promise<void>;
}

export const AlertRuleForm = ({
  locale,
  initialRule,
  saving,
  onCancel,
  onSubmit,
}: AlertRuleFormProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [name, setName] = useState(initialRule?.name ?? '');
  const [lower, setLower] = useState(
    String(initialRule?.lowerBoundMgDl ?? 70),
  );
  const [upper, setUpper] = useState(
    String(initialRule?.upperBoundMgDl ?? 180),
  );
  const [from, setFrom] = useState(
    formatClockTime(initialRule?.activeFromMinute ?? 0),
  );
  const [to, setTo] = useState(
    formatClockTime(initialRule?.activeToMinute ?? 1439),
  );
  const [trend, setTrend] = useState<AlertRuleTrend>(
    initialRule?.trend ?? 'any',
  );
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const result = validateAlertRuleInput({
      name,
      enabled: initialRule?.enabled ?? true,
      lowerBoundMgDl: parseInteger(lower),
      upperBoundMgDl: parseInteger(upper),
      activeFromMinute: parseClockTime(from) ?? Number.NaN,
      activeToMinute: parseClockTime(to) ?? Number.NaN,
      trend,
    });
    if (!result.ok) {
      setError(copy.errors[result.issues[0]!.code]);
      return;
    }
    setError(undefined);
    onSubmit(result.value).catch(() => undefined);
  };

  const fields = [
    {
      key: 'name',
      label: copy.name,
      value: name,
      onChangeText: setName,
      keyboardType: 'default' as const,
    },
    {
      key: 'lower',
      label: copy.lower,
      value: lower,
      onChangeText: setLower,
      keyboardType: 'number-pad' as const,
    },
    {
      key: 'upper',
      label: copy.upper,
      value: upper,
      onChangeText: setUpper,
      keyboardType: 'number-pad' as const,
    },
    {
      key: 'from',
      label: copy.from,
      value: from,
      onChangeText: setFrom,
      keyboardType: 'numbers-and-punctuation' as const,
    },
    {
      key: 'to',
      label: copy.to,
      value: to,
      onChangeText: setTo,
      keyboardType: 'numbers-and-punctuation' as const,
    },
  ];

  return (
    <View style={styles.formCard} testID="alert-rule-form">
      <Text
        accessibilityRole="header"
        style={[styles.formTitle, rtl && styles.rtlText]}>
        {initialRule ? copy.editTitle : copy.addTitle}
      </Text>
      {fields.map(field => (
        <View key={field.key} style={styles.field}>
          <Text style={[styles.label, rtl && styles.rtlText]}>{field.label}</Text>
          <TextInput
            accessibilityLabel={field.label}
            editable={!saving}
            keyboardType={field.keyboardType}
            maxLength={field.key === 'name' ? 80 : 5}
            onChangeText={field.onChangeText}
            style={[styles.input, rtl && styles.rtlText]}
            testID={`alert-rule-form-${field.key}`}
            value={field.value}
          />
        </View>
      ))}
      <Text style={[styles.hint, rtl && styles.rtlText]}>{copy.overnight}</Text>
      <Text style={[styles.label, rtl && styles.rtlText]}>{copy.trend}</Text>
      <View style={[styles.trends, rtl && styles.rowReverse]}>
        {ALERT_RULE_TRENDS.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{selected: trend === option}}
            disabled={saving}
            key={option}
            onPress={() => setTrend(option)}
            style={({pressed}) => [
              styles.trendChoice,
              trend === option && styles.trendChoiceSelected,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-form-trend-${option}`}>
            <Text
              style={[
                styles.trendText,
                trend === option && styles.trendTextSelected,
              ]}>
              {copy.trendLabels[option]}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, rtl && styles.rtlText]}>
          {error}
        </Text>
      ) : null}
      <View style={[styles.actions, rtl && styles.rowReverse]}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={submit}
          style={({pressed}) => [
            styles.saveButton,
            saving && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="alert-rule-form-save">
          <Text style={styles.saveText}>{saving ? copy.saving : copy.save}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onCancel}
          style={({pressed}) => [
            styles.cancelButton,
            pressed && styles.pressed,
          ]}
          testID="alert-rule-form-cancel">
          <Text style={styles.cancelText}>{copy.cancel}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  formCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: '#BFDBFE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 2,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.lg,
  },
  formTitle: {
    color: productUiTokens.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: productUiTokens.spacing.md,
  },
  field: {marginBottom: productUiTokens.spacing.md},
  label: {
    color: productUiTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: productUiTokens.spacing.xs,
  },
  input: {
    borderColor: productUiTokens.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: productUiTokens.colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  hint: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: productUiTokens.spacing.md,
  },
  trends: {flexDirection: 'row', flexWrap: 'wrap'},
  trendChoice: {
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: productUiTokens.spacing.md,
  },
  trendChoiceSelected: {backgroundColor: productUiTokens.colors.action},
  trendText: {color: productUiTokens.colors.text, fontSize: 13, fontWeight: '700'},
  trendTextSelected: {color: productUiTokens.colors.actionText},
  error: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: productUiTokens.spacing.sm,
  },
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  saveButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.md,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  saveText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  cancelButton: {justifyContent: 'center', minHeight: 44, paddingHorizontal: 8},
  cancelText: {color: productUiTokens.colors.action, fontWeight: '700'},
});
