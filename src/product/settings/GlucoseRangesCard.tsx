import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  DEFAULT_GLUCOSE_RANGE_THRESHOLDS,
  isValidGlucoseRangeThresholds,
} from '../../modules/settings';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {ProductSection, productUiTokens} from '../ui';

const COPY = {
  en: {
    title: 'Personal glucose ranges',
    description:
      'Choose the boundaries used for your daily time in range (TIR), glucose summaries, and charts. All values are in mg/dL.',
    veryLowMaxMgDl: 'Very low: below',
    targetMinMgDl: 'In range (TIR): from',
    targetMaxMgDl: 'In range (TIR): up to and including',
    highMaxMgDl: 'Very high: above',
    preview: 'Your five glucose ranges',
    veryLow: 'Very low',
    low: 'Low',
    target: 'In range (TIR)',
    high: 'High',
    veryHigh: 'Very high',
    validation:
      'Enter four whole numbers from 20 to 600 in increasing order: very low < target minimum < target maximum < very high.',
    save: 'Save glucose ranges',
    saving: 'Saving…',
    reset: 'Restore defaults',
    saveFailed:
      'The ranges could not be saved. Your entries are kept. Try again.',
  },
  he: {
    title: 'טווחי הסוכר האישיים',
    description:
      'בחירת הגבולות לחישוב אחוז הזמן היומי בטווח (TIR), לסיכומי הסוכר ולגרפים. כל הערכים ביחידות mg/dL.',
    veryLowMaxMgDl: 'נמוך מאוד: מתחת ל־',
    targetMinMgDl: 'בטווח (TIR): החל מ־',
    targetMaxMgDl: 'בטווח (TIR): עד וכולל',
    highMaxMgDl: 'גבוה מאוד: מעל',
    preview: 'חמשת טווחי הסוכר שלך',
    veryLow: 'נמוך מאוד',
    low: 'נמוך',
    target: 'בטווח (TIR)',
    high: 'גבוה',
    veryHigh: 'גבוה מאוד',
    validation:
      'יש להזין ארבעה מספרים שלמים בין 20 ל־600 בסדר עולה: סף נמוך מאוד, גבול תחתון של הטווח, גבול עליון של הטווח, סף גבוה מאוד.',
    save: 'שמירת טווחי הסוכר',
    saving: 'שומר…',
    reset: 'שחזור ברירת המחדל',
    saveFailed:
      'לא הצלחנו לשמור את הטווחים. הערכים שהזנת נשמרו בטופס. אפשר לנסות שוב.',
  },
} as const;

const FIELDS = [
  'veryLowMaxMgDl',
  'targetMinMgDl',
  'targetMaxMgDl',
  'highMaxMgDl',
] as const;
type Draft = Record<(typeof FIELDS)[number], string>;

const draftFrom = (thresholds: TrendsRangeThresholds): Draft => ({
  veryLowMaxMgDl: String(thresholds.veryLowMaxMgDl),
  targetMinMgDl: String(thresholds.targetMinMgDl),
  targetMaxMgDl: String(thresholds.targetMaxMgDl),
  highMaxMgDl: String(thresholds.highMaxMgDl),
});

const parseDraft = (draft: Draft): TrendsRangeThresholds | undefined => {
  if (FIELDS.some(field => !/^\d+$/.test(draft[field].trim()))) {
    return undefined;
  }
  const thresholds = {
    veryLowMaxMgDl: Number(draft.veryLowMaxMgDl),
    targetMinMgDl: Number(draft.targetMinMgDl),
    targetMaxMgDl: Number(draft.targetMaxMgDl),
    highMaxMgDl: Number(draft.highMaxMgDl),
  };
  return isValidGlucoseRangeThresholds(thresholds) ? thresholds : undefined;
};

export const GlucoseRangesCard = ({
  thresholds,
  locale,
  saving,
  onSave,
}: {
  readonly thresholds: TrendsRangeThresholds;
  readonly locale: DestinationLocale;
  readonly saving: boolean;
  readonly onSave: (next: TrendsRangeThresholds) => Promise<boolean>;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [draft, setDraft] = useState(() => draftFrom(thresholds));
  const [saveFailed, setSaveFailed] = useState(false);
  const candidate = parseDraft(draft);

  useEffect(() => {
    setDraft(draftFrom(thresholds));
    setSaveFailed(false);
    // Only persisted boundary changes reset drafts; other settings keep edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    thresholds.veryLowMaxMgDl,
    thresholds.targetMinMgDl,
    thresholds.targetMaxMgDl,
    thresholds.highMaxMgDl,
  ]);

  const save = async (next: TrendsRangeThresholds | undefined) => {
    if (saving || !next) {
      return;
    }
    setSaveFailed(false);
    setSaveFailed(!(await onSave(next)));
  };

  const bands = candidate
    ? [
        {label: copy.veryLow, value: `< ${candidate.veryLowMaxMgDl}`},
        {
          label: copy.low,
          value: `≥ ${candidate.veryLowMaxMgDl}, < ${candidate.targetMinMgDl}`,
        },
        {
          label: copy.target,
          value: `≥ ${candidate.targetMinMgDl}, ≤ ${candidate.targetMaxMgDl}`,
        },
        {
          label: copy.high,
          value: `> ${candidate.targetMaxMgDl}, ≤ ${candidate.highMaxMgDl}`,
        },
        {label: copy.veryHigh, value: `> ${candidate.highMaxMgDl}`},
      ]
    : [];

  return (
    <ProductSection locale={locale} title={copy.title}>
      <View style={styles.card} testID="settings-glucose-ranges">
        <Text style={[styles.description, rtl && styles.rtlText]}>
          {copy.description}
        </Text>
        {FIELDS.map(field => (
          <View key={field} style={styles.field}>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy[field]}
            </Text>
            <TextInput
              accessibilityLabel={`${copy[field]} (mg/dL)`}
              editable={!saving}
              keyboardType="number-pad"
              onChangeText={value => {
                setDraft(current => ({...current, [field]: value}));
                setSaveFailed(false);
              }}
              selectTextOnFocus
              style={styles.input}
              testID={`settings-glucose-${field}`}
              value={draft[field]}
            />
          </View>
        ))}
        {candidate ? (
          <View style={styles.preview} testID="settings-glucose-preview">
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.preview}
            </Text>
            {bands.map(band => (
              <View
                key={band.label}
                style={[styles.band, rtl && styles.reverseRow]}>
                <Text style={[styles.bandLabel, rtl && styles.rtlText]}>
                  {band.label}
                </Text>
                <Text style={styles.boundary}>{band.value} mg/dL</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text
            accessibilityRole="alert"
            style={[styles.error, rtl && styles.rtlText]}
            testID="settings-glucose-validation">
            {copy.validation}
          </Text>
        )}
        {saveFailed ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, rtl && styles.rtlText]}
            testID="settings-glucose-save-error">
            {copy.saveFailed}
          </Text>
        ) : null}
        <View style={[styles.actions, rtl && styles.reverseRow]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: saving || !candidate}}
            disabled={saving || !candidate}
            onPress={() => save(candidate)}
            style={[styles.button, (saving || !candidate) && styles.disabled]}
            testID="settings-glucose-save">
            <Text style={styles.buttonText}>
              {saving ? copy.saving : copy.save}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: saving}}
            disabled={saving}
            onPress={() => {
              setDraft(draftFrom(DEFAULT_GLUCOSE_RANGE_THRESHOLDS));
              return save(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
            }}
            style={[styles.reset, saving && styles.disabled]}
            testID="settings-glucose-reset">
            <Text style={styles.resetText}>{copy.reset}</Text>
          </Pressable>
        </View>
      </View>
    </ProductSection>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.md,
  },
  description: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  reverseRow: {flexDirection: 'row-reverse'},
  field: {marginTop: productUiTokens.spacing.md},
  label: {color: productUiTokens.colors.text, fontSize: 14, fontWeight: '700'},
  input: {
    borderColor: productUiTokens.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: productUiTokens.colors.text,
    fontSize: 18,
    minHeight: 48,
    marginTop: 6,
    paddingHorizontal: 12,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  preview: {marginTop: productUiTokens.spacing.lg},
  band: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  bandLabel: {color: productUiTokens.colors.text, fontSize: 14},
  boundary: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    writingDirection: 'ltr',
  },
  error: {color: productUiTokens.colors.danger, fontSize: 14, marginTop: 12},
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: productUiTokens.spacing.lg,
  },
  button: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  buttonText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  reset: {justifyContent: 'center', minHeight: 44, paddingHorizontal: 8},
  resetText: {color: productUiTokens.colors.action, fontWeight: '700'},
  disabled: {opacity: productUiTokens.opacity.disabled},
});
