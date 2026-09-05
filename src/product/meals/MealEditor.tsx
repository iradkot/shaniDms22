import React from 'react';
import {StyleSheet, View} from 'react-native';
import {JournalButton, JournalField, JournalFormActions} from '../journal';
import type {MealDraft} from './formModel';
import type {MealsLocale} from './selectors';
import type {MealImageSnapshot} from '../../modules/journal';
import type {MealImagesRuntime} from '../../modules/mealMedia';
import {MealImageField} from './MealImageField';

const COPY = {
  en: {
    name: 'Meal name',
    carbohydrates: 'Meal carbohydrates (g)',
    start: 'Meal start (YYYY-MM-DD HH:mm)',
    notes: 'Notes',
    tags: 'Tags, separated by commas',
    save: 'Save meal',
    saving: 'Saving…',
    cancel: 'Cancel',
  },
  he: {
    name: 'שם הארוחה',
    carbohydrates: 'פחמימות בארוחה (גרם)',
    start: 'תחילת הארוחה (YYYY-MM-DD HH:mm)',
    notes: 'הערות',
    tags: 'תגיות, מופרדות בפסיקים',
    save: 'שמירת הארוחה',
    saving: 'שומר…',
    cancel: 'ביטול',
  },
} as const;

export const MealEditor = ({
  draft,
  locale,
  mode,
  busy,
  onChange,
  onSave,
  onCancel,
  imagesRuntime,
  existingImage,
  additionalFields,
}: {
  readonly draft: MealDraft;
  readonly locale: MealsLocale;
  readonly mode: 'create' | 'edit';
  readonly busy: boolean;
  readonly onChange: React.Dispatch<React.SetStateAction<MealDraft>>;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly imagesRuntime?: MealImagesRuntime;
  readonly existingImage?: MealImageSnapshot;
  readonly additionalFields?: React.ReactNode;
}) => {
  const copy = COPY[locale];
  const prefix = mode === 'create' ? 'meal-create' : 'meal-edit';
  const update = <TKey extends keyof MealDraft>(
    key: TKey,
    value: MealDraft[TKey],
  ): void => onChange(current => ({...current, [key]: value}));

  return (
    <View style={styles.form} testID={`${prefix}-form`}>
      <View style={[styles.columns, locale === 'he' && styles.rowReverse]}>
        <View style={styles.flexField}>
          <JournalField
            label={copy.name}
            locale={locale}
            onChangeText={value => update('name', value)}
            testID={`${prefix}-name`}
            value={draft.name}
          />
        </View>
        <View style={styles.compactField}>
          <JournalField
            inputMode="decimal"
            label={copy.carbohydrates}
            locale={locale}
            onChangeText={value => update('mealCarbohydrates', value)}
            testID={`${prefix}-carbohydrates`}
            value={draft.mealCarbohydrates}
          />
        </View>
      </View>
      <JournalField
        label={copy.start}
        locale={locale}
        onChangeText={value => update('mealStart', value)}
        testID={`${prefix}-start`}
        value={draft.mealStart}
      />
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
      <MealImageField
        disabled={busy}
        locale={locale}
        onChange={value => update('image', value)}
        testIDPrefix={prefix}
        value={draft.image}
        {...(existingImage === undefined ? {} : {existing: existingImage})}
        {...(imagesRuntime === undefined ? {} : {runtime: imagesRuntime})}
      />
      {additionalFields}
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
  form: {width: '100%'},
  rowReverse: {flexDirection: 'row-reverse'},
  columns: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5},
  flexField: {flexGrow: 2, flexBasis: 240, paddingHorizontal: 5},
  compactField: {flexGrow: 1, flexBasis: 180, paddingHorizontal: 5},
});
