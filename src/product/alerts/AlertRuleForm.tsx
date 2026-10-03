import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {
  AlertRule,
  AlertRuleCondition,
  AlertRuleInput,
  AlertRuleTrend,
} from '../../modules/alerts';
import {
  ALERT_RULE_CONDITIONS,
  ALERT_RULE_TRENDS,
  encodeAlertRuleConditionBounds,
  formatClockTime,
  inferAlertRuleCondition,
  parseClockTime,
  validateAlertRuleInput,
} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';

type SchedulePreset = 'all-day' | 'night' | 'custom';

const ALL_DAY = {from: 0, to: 1439} as const;
const NIGHT = {from: 22 * 60, to: 7 * 60} as const;

const COPY = {
  en: {
    addTitle: 'Create an alert',
    editTitle: 'Edit alert',
    intro:
      'Choose the situation first. You can review exactly what will happen before saving.',
    conditionTitle: 'When should I alert?',
    conditionLabels: {
      below: 'Below a value',
      above: 'Above a value',
      'outside-range': 'Outside a range',
    },
    belowValue: 'Alert below (mg/dL)',
    aboveValue: 'Alert above (mg/dL)',
    lowerValue: 'Lower edge (mg/dL)',
    upperValue: 'Upper edge (mg/dL)',
    strictBelow: (value: string, example: string) =>
      `The limit itself does not trigger. At ${value}, ${example} triggers and ${value} does not.`,
    strictAbove: (value: string, example: string) =>
      `The limit itself does not trigger. At ${value}, ${example} triggers and ${value} does not.`,
    strictRange:
      'The two edges themselves do not trigger. Only a value below the lower edge or above the upper edge does.',
    scheduleTitle: 'When is it active?',
    scheduleLabels: {
      'all-day': 'All day',
      night: 'Night · 22:00–07:00',
      custom: 'Custom hours',
    },
    from: 'Starts at (HH:mm)',
    to: 'Ends at (HH:mm)',
    overnight: 'This time window crosses midnight into the next day.',
    summaryTitle: 'Your alert, in plain language',
    summaryCondition: {
      below: (value: string) => `Alert when glucose is below ${value} mg/dL.`,
      above: (value: string) => `Alert when glucose is above ${value} mg/dL.`,
      'outside-range': (lower: string, upper?: string) =>
        `Alert when glucose is below ${lower} or above ${upper} mg/dL.`,
    },
    summarySchedule: {
      'all-day': 'Active all day, from 00:00 until 23:59.',
      night: 'Active every night, from 22:00 until 07:00 (crosses midnight).',
      custom: (from: string, to: string, overnight: boolean) =>
        `Active every day from ${from} until ${to}${
          overnight ? ' (crosses midnight)' : ''
        }.`,
    },
    trendTitle: 'Trend (optional)',
    trendHelp: '“Any trend” means the glucose direction does not matter.',
    trendSummaryAny: 'Glucose direction does not matter.',
    trendSummary: (trend: string) =>
      `Only when the trend is ${trend.toLowerCase()}.`,
    cooldown: 'After an alert, this rule can alert again after 20 minutes.',
    name: 'Alert name',
    nameHelp: 'This is only the label shown in your list.',
    defaultNames: {
      below: 'Low glucose alert',
      above: 'High glucose alert',
      'outside-range': 'Glucose range alert',
    },
    cancel: 'Cancel',
    save: 'Save alert',
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
      'name-required': 'Enter an alert name.',
      'name-too-long': 'Keep the alert name to 80 characters or fewer.',
      'glucose-not-integer': 'Glucose values must be whole numbers.',
      'glucose-out-of-bounds':
        'Glucose values must be between 1 and 1000 mg/dL.',
      'one-sided-threshold':
        'A below or above threshold must be between 2 and 999 mg/dL.',
      'glucose-range-order': 'The lower value must be below the upper value.',
      'time-not-integer': 'Enter each time as HH:mm, for example 06:30.',
      'time-out-of-bounds': 'Enter a valid time between 00:00 and 23:59.',
      'time-window-empty': 'The start and end time cannot be identical.',
    },
  },
  he: {
    addTitle: 'יצירת התראה',
    editTitle: 'עריכת התראה',
    intro:
      'קודם בוחרים באיזה מצב להתריע. לפני השמירה אפשר לראות בדיוק מה יקרה.',
    conditionTitle: 'מתי להתריע?',
    conditionLabels: {
      below: 'מתחת לערך',
      above: 'מעל לערך',
      'outside-range': 'מחוץ לטווח',
    },
    belowValue: 'להתריע מתחת ל־ (mg/dL)',
    aboveValue: 'להתריע מעל ל־ (mg/dL)',
    lowerValue: 'הקצה התחתון (mg/dL)',
    upperValue: 'הקצה העליון (mg/dL)',
    strictBelow: (value: string, example: string) =>
      `הגבול עצמו לא מפעיל התראה. כשהגבול הוא ${value}, הערך ${example} מפעיל התראה ו־${value} לא.`,
    strictAbove: (value: string, example: string) =>
      `הגבול עצמו לא מפעיל התראה. כשהגבול הוא ${value}, הערך ${example} מפעיל התראה ו־${value} לא.`,
    strictRange:
      'שני קצות הטווח עצמם לא מפעילים התראה. רק ערך מתחת לקצה התחתון או מעל לקצה העליון מפעיל אותה.',
    scheduleTitle: 'באילו שעות?',
    scheduleLabels: {
      'all-day': 'כל היום',
      night: 'לילה · 22:00–07:00',
      custom: 'שעות מותאמות',
    },
    from: 'התחלה (HH:mm)',
    to: 'סיום (HH:mm)',
    overnight: 'חלון הזמן הזה חוצה את חצות וממשיך ליום הבא.',
    summaryTitle: 'כך ההתראה תעבוד',
    summaryCondition: {
      below: (value: string) => `התראה כשהסוכר נמוך מ־${value} mg/dL.`,
      above: (value: string) => `התראה כשהסוכר גבוה מ־${value} mg/dL.`,
      'outside-range': (lower: string, upper?: string) =>
        `התראה כשהסוכר נמוך מ־${lower} או גבוה מ־${upper} mg/dL.`,
    },
    summarySchedule: {
      'all-day': 'פעילה כל היום, מ־00:00 עד 23:59.',
      night: 'פעילה בכל לילה, מ־22:00 עד 07:00 (הטווח חוצה חצות).',
      custom: (from: string, to: string, overnight: boolean) =>
        `פעילה בכל יום מ־${from} עד ${to}${
          overnight ? ' (הטווח חוצה חצות)' : ''
        }.`,
    },
    trendTitle: 'מגמה (לא חובה)',
    trendHelp: '״כל מגמה״ אומר שכיוון תנועת הסוכר לא משנה.',
    trendSummaryAny: 'כיוון תנועת הסוכר לא משנה.',
    trendSummary: (trend: string) => `רק כשהמגמה היא ${trend}.`,
    cooldown: 'אחרי התראה, הכלל יוכל להתריע שוב כעבור 20 דקות.',
    name: 'שם ההתראה',
    nameHelp: 'זה רק השם שיופיע ברשימת ההתראות.',
    defaultNames: {
      below: 'התראת סוכר נמוך',
      above: 'התראת סוכר גבוה',
      'outside-range': 'התראת טווח סוכר',
    },
    cancel: 'ביטול',
    save: 'שמירת ההתראה',
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
      'name-required': 'צריך להזין שם להתראה.',
      'name-too-long': 'שם ההתראה יכול להכיל עד 80 תווים.',
      'glucose-not-integer': 'ערכי הסוכר צריכים להיות מספרים שלמים.',
      'glucose-out-of-bounds': 'ערכי הסוכר צריכים להיות בין 1 ל־1000 mg/dL.',
      'one-sided-threshold':
        'ערך להתראה מסוג ״מתחת״ או ״מעל״ צריך להיות בין 2 ל־999 mg/dL.',
      'glucose-range-order': 'הערך התחתון חייב להיות נמוך מהערך העליון.',
      'time-not-integer': 'צריך להזין כל שעה במבנה HH:mm, למשל 06:30.',
      'time-out-of-bounds': 'צריך להזין שעה תקינה בין 00:00 ל־23:59.',
      'time-window-empty': 'שעת ההתחלה ושעת הסיום לא יכולות להיות זהות.',
    },
  },
} as const;

const parseInteger = (value: string): number =>
  /^\d+$/.test(value) ? Number(value) : Number.NaN;

const inferSchedulePreset = (input?: AlertRuleInput): SchedulePreset => {
  if (
    input?.activeFromMinute === NIGHT.from &&
    input.activeToMinute === NIGHT.to
  ) {
    return 'night';
  }
  if (
    input?.activeFromMinute === ALL_DAY.from &&
    input.activeToMinute === ALL_DAY.to
  ) {
    return 'all-day';
  }
  return input ? 'custom' : 'all-day';
};

export const createBelow65NightAlertDraft = (
  locale: DestinationLocale,
): AlertRuleInput => ({
  name: locale === 'he' ? 'סוכר נמוך בלילה' : 'Low glucose at night',
  enabled: true,
  lowerBoundMgDl: 65,
  upperBoundMgDl: 1000,
  activeFromMinute: NIGHT.from,
  activeToMinute: NIGHT.to,
  trend: 'any',
});

export interface AlertRuleFormProps {
  readonly locale: DestinationLocale;
  readonly initialRule?: AlertRule;
  readonly initialDraft?: AlertRuleInput;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: AlertRuleInput) => Promise<void>;
}

export const AlertRuleForm = ({
  locale,
  initialRule,
  initialDraft,
  saving,
  onCancel,
  onSubmit,
}: AlertRuleFormProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const source = initialRule ?? initialDraft;
  const initialCondition = source
    ? inferAlertRuleCondition(source)
    : ('below' as const);
  const [condition, setCondition] =
    useState<AlertRuleCondition>(initialCondition);
  const [schedule, setSchedule] = useState<SchedulePreset>(() =>
    inferSchedulePreset(source),
  );
  const [name, setName] = useState(
    source?.name ?? copy.defaultNames[initialCondition],
  );
  const [nameWasEdited, setNameWasEdited] = useState(source !== undefined);
  const [lower, setLower] = useState(
    String(source?.lowerBoundMgDl === 1 ? 70 : source?.lowerBoundMgDl ?? 70),
  );
  const [upper, setUpper] = useState(
    String(
      source?.upperBoundMgDl === 1000 ? 180 : source?.upperBoundMgDl ?? 180,
    ),
  );
  const [from, setFrom] = useState(
    formatClockTime(source?.activeFromMinute ?? ALL_DAY.from),
  );
  const [to, setTo] = useState(
    formatClockTime(source?.activeToMinute ?? ALL_DAY.to),
  );
  const [trend, setTrend] = useState<AlertRuleTrend>(source?.trend ?? 'any');
  const [error, setError] = useState<string | undefined>();

  const chooseCondition = (next: AlertRuleCondition) => {
    setCondition(next);
    if (!nameWasEdited) {
      setName(copy.defaultNames[next]);
    }
  };

  const chooseSchedule = (next: SchedulePreset) => {
    setSchedule(next);
    if (next === 'all-day') {
      setFrom(formatClockTime(ALL_DAY.from));
      setTo(formatClockTime(ALL_DAY.to));
    } else if (next === 'night') {
      setFrom(formatClockTime(NIGHT.from));
      setTo(formatClockTime(NIGHT.to));
    }
  };

  const scheduleMinutes =
    schedule === 'all-day'
      ? ALL_DAY
      : schedule === 'night'
      ? NIGHT
      : {
          from: parseClockTime(from) ?? Number.NaN,
          to: parseClockTime(to) ?? Number.NaN,
        };
  const bounds = encodeAlertRuleConditionBounds(condition, {
    lowerBoundMgDl: parseInteger(lower),
    upperBoundMgDl: parseInteger(upper),
  });

  const submit = () => {
    const selectedThreshold = parseInteger(
      condition === 'above' ? upper : lower,
    );
    if (
      condition !== 'outside-range' &&
      Number.isSafeInteger(selectedThreshold) &&
      (selectedThreshold <= 1 || selectedThreshold >= 1000)
    ) {
      setError(copy.errors['one-sided-threshold']);
      return;
    }
    const result = validateAlertRuleInput({
      name,
      enabled: source?.enabled ?? true,
      ...bounds,
      activeFromMinute: scheduleMinutes.from,
      activeToMinute: scheduleMinutes.to,
      trend,
    });
    if (!result.ok) {
      setError(copy.errors[result.issues[0]!.code]);
      return;
    }
    setError(undefined);
    onSubmit(result.value).catch(() => undefined);
  };

  const conditionSummary =
    condition === 'outside-range'
      ? copy.summaryCondition['outside-range'](lower || '—', upper || '—')
      : copy.summaryCondition[condition](
          (condition === 'below' ? lower : upper) || '—',
        );
  const parsedFrom = parseClockTime(from);
  const parsedTo = parseClockTime(to);
  const customOvernight =
    parsedFrom !== undefined && parsedTo !== undefined && parsedFrom > parsedTo;
  const scheduleSummary =
    schedule === 'custom'
      ? copy.summarySchedule.custom(from || '—', to || '—', customOvernight)
      : copy.summarySchedule[schedule];
  const selectedValue = condition === 'above' ? upper : lower;
  const selectedNumber = parseInteger(selectedValue);
  const strictHint =
    condition === 'below'
      ? copy.strictBelow(
          selectedValue || '—',
          Number.isSafeInteger(selectedNumber)
            ? String(selectedNumber - 1)
            : '—',
        )
      : condition === 'above'
      ? copy.strictAbove(
          selectedValue || '—',
          Number.isSafeInteger(selectedNumber)
            ? String(selectedNumber + 1)
            : '—',
        )
      : copy.strictRange;

  const renderNumberField = (
    key: 'lower' | 'upper',
    label: string,
    value: string,
    onChangeText: (next: string) => void,
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, rtl && styles.rtlText]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={!saving}
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={onChangeText}
        selectTextOnFocus
        style={[styles.input, styles.numberInput, rtl && styles.rtlText]}
        testID={`alert-rule-form-${key}`}
        value={value}
      />
    </View>
  );

  return (
    <View style={styles.formCard} testID="alert-rule-form">
      <Text
        accessibilityRole="header"
        style={[styles.formTitle, rtl && styles.rtlText]}>
        {initialRule ? copy.editTitle : copy.addTitle}
      </Text>
      <Text style={[styles.intro, rtl && styles.rtlText]}>{copy.intro}</Text>

      <Text style={[styles.sectionTitle, rtl && styles.rtlText]}>
        {copy.conditionTitle}
      </Text>
      <View
        accessibilityLabel={copy.conditionTitle}
        accessibilityRole="radiogroup"
        style={[styles.choices, rtl && styles.rowReverse]}>
        {ALERT_RULE_CONDITIONS.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{selected: condition === option}}
            disabled={saving}
            key={option}
            onPress={() => chooseCondition(option)}
            style={({pressed}) => [
              styles.choice,
              condition === option && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-condition-${option}`}>
            <Text
              style={[
                styles.choiceText,
                condition === option && styles.choiceTextSelected,
              ]}>
              {copy.conditionLabels[option]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        style={
          condition === 'outside-range'
            ? [styles.rangeFields, rtl && styles.rowReverse]
            : undefined
        }>
        {condition !== 'above'
          ? renderNumberField(
              'lower',
              condition === 'below' ? copy.belowValue : copy.lowerValue,
              lower,
              setLower,
            )
          : null}
        {condition !== 'below'
          ? renderNumberField(
              'upper',
              condition === 'above' ? copy.aboveValue : copy.upperValue,
              upper,
              setUpper,
            )
          : null}
      </View>
      <Text style={[styles.hint, rtl && styles.rtlText]}>{strictHint}</Text>

      <Text style={[styles.sectionTitle, rtl && styles.rtlText]}>
        {copy.scheduleTitle}
      </Text>
      <View
        accessibilityLabel={copy.scheduleTitle}
        accessibilityRole="radiogroup"
        style={[styles.choices, rtl && styles.rowReverse]}>
        {(['all-day', 'night', 'custom'] as const).map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{selected: schedule === option}}
            disabled={saving}
            key={option}
            onPress={() => chooseSchedule(option)}
            style={({pressed}) => [
              styles.choice,
              schedule === option && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-schedule-${option}`}>
            <Text
              style={[
                styles.choiceText,
                schedule === option && styles.choiceTextSelected,
              ]}>
              {copy.scheduleLabels[option]}
            </Text>
          </Pressable>
        ))}
      </View>
      {schedule === 'custom' ? (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.from}
            </Text>
            <TextInput
              accessibilityLabel={copy.from}
              editable={!saving}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setFrom}
              style={[styles.input, rtl && styles.rtlText]}
              testID="alert-rule-form-from"
              value={from}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, rtl && styles.rtlText]}>{copy.to}</Text>
            <TextInput
              accessibilityLabel={copy.to}
              editable={!saving}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setTo}
              style={[styles.input, rtl && styles.rtlText]}
              testID="alert-rule-form-to"
              value={to}
            />
          </View>
          {customOvernight ? (
            <Text style={[styles.hint, rtl && styles.rtlText]}>
              {copy.overnight}
            </Text>
          ) : null}
        </>
      ) : null}

      <View
        accessibilityLiveRegion="polite"
        style={styles.summaryCard}
        testID="alert-rule-form-summary">
        <Text style={[styles.summaryTitle, rtl && styles.rtlText]}>
          {copy.summaryTitle}
        </Text>
        <Text style={[styles.summaryLine, rtl && styles.rtlText]}>
          {conditionSummary}
        </Text>
        <Text style={[styles.summaryLine, rtl && styles.rtlText]}>
          {scheduleSummary}
        </Text>
        <Text style={[styles.summaryLine, rtl && styles.rtlText]}>
          {trend === 'any'
            ? copy.trendSummaryAny
            : copy.trendSummary(copy.trendLabels[trend])}
        </Text>
        <Text style={[styles.cooldown, rtl && styles.rtlText]}>
          {copy.cooldown}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, rtl && styles.rtlText]}>
        {copy.trendTitle}
      </Text>
      <Text style={[styles.hint, rtl && styles.rtlText]}>{copy.trendHelp}</Text>
      <View
        accessibilityLabel={copy.trendTitle}
        accessibilityRole="radiogroup"
        style={[styles.choices, rtl && styles.rowReverse]}>
        {ALERT_RULE_TRENDS.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{selected: trend === option}}
            disabled={saving}
            key={option}
            onPress={() => setTrend(option)}
            style={({pressed}) => [
              styles.choice,
              trend === option && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
            testID={`alert-rule-form-trend-${option}`}>
            <Text
              style={[
                styles.choiceText,
                trend === option && styles.choiceTextSelected,
              ]}>
              {copy.trendLabels[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.nameSection}>
        <Text style={[styles.label, rtl && styles.rtlText]}>{copy.name}</Text>
        <TextInput
          accessibilityLabel={copy.name}
          editable={!saving}
          maxLength={80}
          onChangeText={next => {
            setName(next);
            setNameWasEdited(true);
          }}
          style={[styles.input, rtl && styles.rtlText]}
          testID="alert-rule-form-name"
          value={name}
        />
        <Text style={[styles.hint, styles.nameHelp, rtl && styles.rtlText]}>
          {copy.nameHelp}
        </Text>
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
          <Text style={styles.saveText}>
            {saving ? copy.saving : copy.save}
          </Text>
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
    borderColor: '#93C5FD',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 2,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.lg,
  },
  formTitle: {
    color: productUiTokens.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  intro: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: productUiTokens.spacing.xs,
  },
  sectionTitle: {
    color: productUiTokens.colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.xl,
  },
  field: {flex: 1, marginTop: productUiTokens.spacing.sm},
  label: {
    color: productUiTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: productUiTokens.spacing.xs,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: productUiTokens.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: productUiTokens.colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  numberInput: {fontSize: 20, fontWeight: '700'},
  rangeFields: {columnGap: productUiTokens.spacing.md, flexDirection: 'row'},
  hint: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.sm,
  },
  choices: {flexDirection: 'row', flexWrap: 'wrap'},
  choice: {
    backgroundColor: '#FFFFFF',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  choiceSelected: {
    backgroundColor: productUiTokens.colors.action,
    borderColor: productUiTokens.colors.action,
  },
  choiceText: {
    color: productUiTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  choiceTextSelected: {color: productUiTokens.colors.actionText},
  summaryCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.md,
  },
  summaryTitle: {color: '#134E77', fontSize: 15, fontWeight: '800'},
  summaryLine: {
    color: productUiTokens.colors.text,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  cooldown: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  nameSection: {marginTop: productUiTokens.spacing.xl},
  nameHelp: {marginTop: 4},
  error: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: productUiTokens.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: productUiTokens.spacing.lg,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.md,
    minHeight: 46,
    paddingHorizontal: productUiTokens.spacing.xl,
  },
  saveText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  cancelButton: {justifyContent: 'center', minHeight: 46, paddingHorizontal: 8},
  cancelText: {color: productUiTokens.colors.action, fontWeight: '700'},
});
