import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  CarbPurpose,
  MealExternalCandidate,
  MealsWorkspace,
  SupportingTreatmentPurpose,
} from '../../modules/journal';
import {
  JournalButton,
  JournalFormActions,
  JournalNotice,
  runPresentedJournalAction,
} from '../journal';
import {parseJournalDateTime} from '../journal/formValues';
import type {MealsLocale} from './selectors';

const MAX_SELECTED_LINKS = 2;

const COPY = {
  en: {
    title: 'Connect Loop context',
    help:
      'Optional. Find nearby read-only records, then choose each record and its purpose. Nothing is linked automatically.',
    find: 'Find nearby Loop records',
    finding: 'Looking in Nightscout…',
    invalidTime: 'Enter a valid meal time before searching.',
    empty: 'No linkable records were found near this time.',
    selectedTitle: 'Selected for linking after the meal is saved',
    selectedHelp:
      'A meal-report selection fills the Loop time and fills meal carbs only when that field is empty. You can edit both before saving.',
    remove: 'Remove selection',
    limit: 'Up to two distinct Loop records can be connected in this version.',
    carb: (grams: number) => grams + ' g carbohydrate record',
    treatment: (units: number | undefined) =>
      units === undefined ? 'Treatment record' : units + ' U treatment record',
    purposes: {
      meal: 'Use as meal report + prefill',
      low_treatment: 'Use as low treatment',
      unknown: 'Use with unknown purpose',
      bolus: 'Use as bolus context',
      correction: 'Use as correction context',
      other: 'Use as other treatment',
    },
  },
  he: {
    title: 'קישור הקשר מ־Loop',
    help:
      'לא חובה. מחפשים רשומות קרובות לקריאה בלבד, ואז בוחרים במפורש כל רשומה ואת מטרת הקישור. אין קישור אוטומטי.',
    find: 'חיפוש רשומות Loop קרובות',
    finding: 'מחפש ב־Nightscout…',
    invalidTime: 'צריך להזין זמן ארוחה תקין לפני החיפוש.',
    empty: 'לא נמצאו רשומות שאפשר לקשר ליד הזמן הזה.',
    selectedTitle: 'ייבחרו לקישור לאחר שמירת הארוחה',
    selectedHelp:
      'בחירה כדיווח ארוחה ממלאת את זמן ה־Loop, ואת הפחמימות רק אם השדה ריק. אפשר לערוך את שניהם לפני השמירה.',
    remove: 'הסרת הבחירה',
    limit: 'בגרסה הזו אפשר לקשר עד שתי רשומות Loop נפרדות.',
    carb: (grams: number) => 'רשומת פחמימות של ' + grams + ' גר׳',
    treatment: (units: number | undefined) =>
      units === undefined ? 'רשומת טיפול' : 'רשומת טיפול של ' + units + ' יח׳',
    purposes: {
      meal: 'דיווח ארוחה + מילוי שדות',
      low_treatment: 'קישור כטיפול בהיפו',
      unknown: 'קישור ללא סיווג',
      bolus: 'קישור כבולוס תומך',
      correction: 'קישור כתיקון תומך',
      other: 'קישור כטיפול אחר',
    },
  },
} as const;

export type PendingMealExternalLink =
  | {
      readonly candidate: Extract<
        MealExternalCandidate,
        {readonly kind: 'carbohydrate'}
      >;
      readonly purpose: CarbPurpose;
    }
  | {
      readonly candidate: Extract<
        MealExternalCandidate,
        {readonly kind: 'treatment'}
      >;
      readonly purpose: SupportingTreatmentPurpose;
    };

const identity = (candidate: MealExternalCandidate): string =>
  (
    candidate.record.identifiers._id ??
    candidate.record.identifiers.identifier ??
    candidate.record.identifiers.syncIdentifier ??
    'record'
  ).replace(/[^A-Za-z0-9_-]/g, '-');

const labelFor = (
  candidate: MealExternalCandidate,
  copy: (typeof COPY)[MealsLocale],
): string =>
  candidate.kind === 'carbohydrate'
    ? copy.carb(candidate.snapshot.carbohydratesGrams)
    : copy.treatment(candidate.snapshot.insulinUnits);

export const MealCreateLinkPicker = ({
  workspace,
  locale,
  mealStart,
  busy,
  selected,
  formatTime,
  onSelect,
  onRemove,
}: {
  readonly workspace: MealsWorkspace;
  readonly locale: MealsLocale;
  readonly mealStart: string;
  readonly busy: boolean;
  readonly selected: readonly PendingMealExternalLink[];
  readonly formatTime: (timestamp: number) => string;
  readonly onSelect: (
    candidate: MealExternalCandidate,
    purpose: CarbPurpose | SupportingTreatmentPurpose,
  ) => void;
  readonly onRemove: (recordKey: string) => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<
    readonly MealExternalCandidate[] | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const selectedKeys = new Set(
    selected.map(item => item.candidate.record.recordKey),
  );

  const find = async (): Promise<void> => {
    const nearMealStart = parseJournalDateTime(mealStart);
    if (nearMealStart === undefined) {
      setError(copy.invalidTime);
      return;
    }
    setFinding(true);
    setError(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.findLinkCandidates({
          nearMealStart,
          beforeMs: 3 * 60 * 60_000,
          afterMs: 6 * 60 * 60_000,
        }),
      locale,
    );
    setFinding(false);
    if (!result.ok) {
      setCandidates(undefined);
      setError(result.message);
      return;
    }
    setCandidates(result.value);
  };

  const candidateTime = (candidate: MealExternalCandidate): number =>
    candidate.kind === 'carbohydrate'
      ? candidate.snapshot.externalCarbTime
      : candidate.snapshot.treatmentTime;

  return (
    <View style={styles.section} testID="meal-create-link-picker">
      <Text style={[styles.title, rtl && styles.rtl]}>{copy.title}</Text>
      <Text style={[styles.help, rtl && styles.rtl]}>{copy.help}</Text>
      {error ? <JournalNotice locale={locale} message={error} /> : null}
      <JournalButton
        disabled={busy || finding}
        label={finding ? copy.finding : copy.find}
        onPress={find}
        testID="meal-create-find-links"
      />
      {candidates !== undefined && candidates.length === 0 ? (
        <Text style={[styles.meta, rtl && styles.rtl]}>{copy.empty}</Text>
      ) : null}
      {candidates
        ?.filter(candidate => !selectedKeys.has(candidate.record.recordKey))
        .map(candidate => {
          const id = identity(candidate);
          const selectionDisabled =
            busy || finding || selected.length >= MAX_SELECTED_LINKS;
          return (
            <View key={candidate.record.recordKey} style={styles.candidate}>
              <Text style={[styles.strong, rtl && styles.rtl]}>
                {labelFor(candidate, copy)}
              </Text>
              <Text style={[styles.meta, rtl && styles.rtl]}>
                {formatTime(candidateTime(candidate))} · {candidate.reason}
              </Text>
              <JournalFormActions locale={locale}>
                {candidate.kind === 'carbohydrate'
                  ? (['meal', 'low_treatment', 'unknown'] as const).map(
                      purpose => (
                        <JournalButton
                          disabled={selectionDisabled}
                          key={purpose}
                          label={copy.purposes[purpose]}
                          onPress={() => onSelect(candidate, purpose)}
                          testID={
                            'meal-create-link-' +
                            id +
                            '-' +
                            (purpose === 'low_treatment' ? 'low' : purpose)
                          }
                          tone={purpose === 'meal' ? 'primary' : 'secondary'}
                        />
                      ),
                    )
                  : (['bolus', 'correction', 'other'] as const).map(purpose => (
                      <JournalButton
                        disabled={selectionDisabled}
                        key={purpose}
                        label={copy.purposes[purpose]}
                        onPress={() => onSelect(candidate, purpose)}
                        testID={'meal-create-link-' + id + '-' + purpose}
                      />
                    ))}
              </JournalFormActions>
            </View>
          );
        })}
      {selected.length > 0 ? (
        <View style={styles.selected} testID="meal-create-selected-links">
          <Text style={[styles.strong, rtl && styles.rtl]}>
            {copy.selectedTitle}
          </Text>
          <Text style={[styles.help, rtl && styles.rtl]}>
            {copy.selectedHelp}
          </Text>
          {selected.map(item => (
            <View
              key={item.candidate.record.recordKey}
              style={styles.selectedItem}>
              <Text style={[styles.meta, rtl && styles.rtl]}>
                {labelFor(item.candidate, copy)} · {copy.purposes[item.purpose]}
              </Text>
              <JournalButton
                disabled={busy}
                label={copy.remove}
                onPress={() => onRemove(item.candidate.record.recordKey)}
                testID={'meal-create-unselect-' + identity(item.candidate)}
                tone="quiet"
              />
            </View>
          ))}
          {selected.length >= MAX_SELECTED_LINKS ? (
            <Text style={[styles.meta, rtl && styles.rtl]}>{copy.limit}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    borderColor: '#D6E5EF',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 14,
    padding: 12,
  },
  title: {color: '#243B53', fontSize: 15, fontWeight: '800', marginBottom: 5},
  help: {color: '#52697A', fontSize: 13, lineHeight: 19, marginBottom: 9},
  strong: {color: '#243B53', fontSize: 14, fontWeight: '700'},
  meta: {color: '#627D98', fontSize: 12, lineHeight: 18, marginTop: 4},
  candidate: {
    borderTopColor: '#DCE8F0',
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  selected: {
    backgroundColor: '#EEF8F3',
    borderRadius: 12,
    marginTop: 12,
    padding: 10,
  },
  selectedItem: {marginTop: 8},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
});
