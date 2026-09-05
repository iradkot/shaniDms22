import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  JournalButton,
  JournalChoice,
  JournalChoiceRow,
  JournalField,
  JournalFormActions,
} from '../journal';
import type {ActivityDraft} from './formModel';
import type {ActivitiesLocale} from './selectors';

const CATEGORIES: readonly ActivityDraft['category'][] = [
  'walking',
  'running',
  'cycling',
  'strength',
  'swimming',
  'sport',
  'other',
];

const INTENSITIES = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;

const COPY = {
  en: {
    category: 'Activity type',
    categories: {
      walking: 'Walking',
      running: 'Running',
      cycling: 'Cycling',
      strength: 'Strength',
      swimming: 'Swimming',
      sport: 'Sport',
      other: 'Other',
    },
    customName: 'Activity name',
    start: 'Start (YYYY-MM-DD HH:mm)',
    end: 'End (YYYY-MM-DD HH:mm)',
    state: 'Activity state',
    ongoing: 'Still in progress',
    completed: 'Completed',
    intensity: 'Intensity',
    none: 'Not set',
    intensities: {
      very_low: 'Very light',
      low: 'Light',
      medium: 'Medium',
      high: 'High',
      very_high: 'Very high',
    },
    notes: 'Notes',
    tags: 'Tags, separated by commas',
    save: 'Save activity',
    saving: 'Saving…',
    cancel: 'Cancel',
  },
  he: {
    category: 'סוג פעילות',
    categories: {
      walking: 'הליכה',
      running: 'ריצה',
      cycling: 'רכיבה',
      strength: 'אימון כוח',
      swimming: 'שחייה',
      sport: 'ספורט',
      other: 'אחר',
    },
    customName: 'שם הפעילות',
    start: 'התחלה (YYYY-MM-DD HH:mm)',
    end: 'סיום (YYYY-MM-DD HH:mm)',
    state: 'מצב הפעילות',
    ongoing: 'עדיין בתהליך',
    completed: 'הסתיימה',
    intensity: 'עצימות',
    none: 'ללא בחירה',
    intensities: {
      very_low: 'קלילה מאוד',
      low: 'קלילה',
      medium: 'בינונית',
      high: 'גבוהה',
      very_high: 'גבוהה מאוד',
    },
    notes: 'הערות',
    tags: 'תגיות, מופרדות בפסיקים',
    save: 'שמירת הפעילות',
    saving: 'שומר…',
    cancel: 'ביטול',
  },
} as const;

export const ActivityEditor = ({
  draft,
  locale,
  mode,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  readonly draft: ActivityDraft;
  readonly locale: ActivitiesLocale;
  readonly mode: 'create' | 'edit';
  readonly busy: boolean;
  readonly onChange: React.Dispatch<React.SetStateAction<ActivityDraft>>;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) => {
  const copy = COPY[locale];
  const prefix = mode === 'create' ? 'activity-create' : 'activity-edit';
  const rtl = locale === 'he';
  const update = <TKey extends keyof ActivityDraft>(
    key: TKey,
    value: ActivityDraft[TKey],
  ): void => onChange(current => ({...current, [key]: value}));

  return (
    <View testID={`${prefix}-form`}>
      <Text style={[styles.label, rtl && styles.rtlText]}>{copy.category}</Text>
      <JournalChoiceRow locale={locale}>
        {CATEGORIES.map(category => (
          <JournalChoice
            key={category}
            label={copy.categories[category]}
            onPress={() => update('category', category)}
            selected={draft.category === category}
            testID={`${prefix}-category-${category}`}
          />
        ))}
      </JournalChoiceRow>
      {draft.category === 'other' ? (
        <JournalField
          label={copy.customName}
          locale={locale}
          onChangeText={value => update('customName', value)}
          testID={`${prefix}-custom-name`}
          value={draft.customName}
        />
      ) : null}

      <View style={[styles.columns, rtl && styles.rowReverse]}>
        <View style={styles.column}>
          <JournalField
            label={copy.start}
            locale={locale}
            onChangeText={value => update('startedAt', value)}
            testID={`${prefix}-start`}
            value={draft.startedAt}
          />
        </View>
        {!draft.ongoing ? (
          <View style={styles.column}>
            <JournalField
              label={copy.end}
              locale={locale}
              onChangeText={value => update('endedAt', value)}
              testID={`${prefix}-end`}
              value={draft.endedAt}
            />
          </View>
        ) : null}
      </View>

      <Text style={[styles.label, rtl && styles.rtlText]}>{copy.state}</Text>
      <JournalChoiceRow locale={locale}>
        <JournalChoice
          label={copy.ongoing}
          onPress={() => update('ongoing', true)}
          selected={draft.ongoing}
          testID={`${prefix}-ongoing`}
        />
        <JournalChoice
          label={copy.completed}
          onPress={() => update('ongoing', false)}
          selected={!draft.ongoing}
          testID={`${prefix}-completed`}
        />
      </JournalChoiceRow>

      <Text style={[styles.label, rtl && styles.rtlText]}>
        {copy.intensity}
      </Text>
      <JournalChoiceRow locale={locale}>
        <JournalChoice
          label={copy.none}
          onPress={() => update('intensity', undefined)}
          selected={draft.intensity === undefined}
          testID={`${prefix}-intensity-none`}
        />
        {INTENSITIES.map(intensity => (
          <JournalChoice
            key={intensity}
            label={copy.intensities[intensity]}
            onPress={() => update('intensity', intensity)}
            selected={draft.intensity === intensity}
            testID={`${prefix}-intensity-${intensity}`}
          />
        ))}
      </JournalChoiceRow>

      <JournalField
        label={copy.notes}
        locale={locale}
        multiline
        onChangeText={value => update('notes', value)}
        testID={`${prefix}-notes`}
        value={draft.notes}
      />
      <JournalField
        label={copy.tags}
        locale={locale}
        onChangeText={value => update('tags', value)}
        testID={`${prefix}-tags`}
        value={draft.tags}
      />
      <JournalFormActions locale={locale}>
        <JournalButton
          disabled={busy}
          label={busy ? copy.saving : copy.save}
          onPress={onSave}
          testID={`${prefix}-save`}
          tone="primary"
        />
        <JournalButton
          disabled={busy}
          label={copy.cancel}
          onPress={onCancel}
          testID={`${prefix}-cancel`}
          tone="quiet"
        />
      </JournalFormActions>
    </View>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  label: {
    color: '#253444',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 7,
  },
  columns: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5},
  column: {flexGrow: 1, flexBasis: 250, paddingHorizontal: 5},
});
