import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  coreDestinationRegistry,
  createStoredDestinationTarget,
} from '../destinations';
import type {
  DestinationDefinition,
  DestinationLocale,
  StoredDestinationTarget,
} from '../destinations';
import type {StoredProductShellPreferences} from '../shell';
import {buildPersonalizationQuestionnairePreset} from './presets';
import type {
  PersonalizationLayout,
  PersonalizationQuestionnaireAnswers,
  PersonalizationQuestionnaireStage,
  QuestionnairePresentationStage,
  RelationshipToDataSubject,
  StoredProductPersonalization,
} from './types';
import {
  completePersonalizationQuestionnaire,
  customizeProductPersonalization,
  moveFavoriteDestination,
  selectLayoutProfile,
  skipPersonalizationQuestionnaire,
} from './updates';

const COPY = {
  en: {
    onboardingTitle: 'Make the app yours',
    customizeTitle: 'Customize your experience',
    step: 'Step',
    of: 'of',
    relationshipTitle: 'How do you use this data?',
    relationshipDescription:
      'This only suggests a starting layout. It never changes access or available features.',
    self: 'For myself',
    parent: 'Parent',
    caregiver: 'Caregiver',
    clinician: 'Clinician',
    'family-member': 'Family member',
    other: 'Another relationship',
    'prefer-not-to-answer': 'Prefer not to answer',
    quickTitle: 'What should be fastest to find?',
    quickDescription:
      'Choose as many favorites as you want. You can reorder them later.',
    favoriteOrder: 'Favorite order',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    modules: 'Favorite modules',
    focused: 'Focused views',
    visibilityTitle: 'Modules shown in Hub',
    visibilityDescription:
      'Hide Modules you do not use. Hidden Modules stay available in Favorites and can be shown again here.',
    presentationTitle: 'How should the app open?',
    presentationDescription:
      'These choices apply to this screen size. Phone, tablet, and desktop can differ.',
    start: 'Start screen',
    hub: 'Hub',
    snapshot: 'Show Current Snapshot',
    recents: 'Show recent modules',
    gri: 'Show advanced GRI metric',
    shortcuts: 'Bottom or side shortcuts',
    shortcutsHelp:
      'Choose up to two. Back, Hub, and Forward are always present.',
    selected: 'Selected',
    continue: 'Continue',
    back: 'Back',
    save: 'Save',
    saving: 'Saving…',
    skip: 'Skip for now',
    cancel: 'Cancel',
    resetLayout: 'Reset layout changes',
    chooseRelationship: 'Choose one option, or skip the questionnaire.',
    shortcutLimit: 'You can choose up to two shortcuts.',
    saveFailed: 'The preferences could not be saved. Please try again.',
  },
  he: {
    onboardingTitle: 'מתאימים את האפליקציה אליכם',
    customizeTitle: 'התאמה אישית',
    step: 'שלב',
    of: 'מתוך',
    relationshipTitle: 'איך אתם משתמשים בנתונים האלה?',
    relationshipDescription:
      'התשובה רק מציעה סידור התחלתי. היא לא משנה הרשאות או פיצ׳רים זמינים.',
    self: 'עבורי',
    parent: 'הורה',
    caregiver: 'מטפל או מטפלת',
    clinician: 'רופא או אשת מקצוע',
    'family-member': 'בן או בת משפחה',
    other: 'קשר אחר',
    'prefer-not-to-answer': 'מעדיפים לא לענות',
    quickTitle: 'מה חשוב למצוא הכי מהר?',
    quickDescription: 'אפשר לבחור כמה מועדפים שרוצים ולסדר אותם כאן.',
    favoriteOrder: 'סדר המועדפים',
    moveEarlier: 'העברה למעלה',
    moveLater: 'העברה למטה',
    modules: 'מודולים מועדפים',
    focused: 'תצוגות ממוקדות',
    visibilityTitle: 'מודולים שמוצגים במרכז',
    visibilityDescription:
      'אפשר להסתיר מודולים שלא בשימוש. מודול מוסתר נשאר זמין במועדפים ואפשר להציג אותו שוב כאן.',
    presentationTitle: 'איך האפליקציה צריכה להיפתח?',
    presentationDescription:
      'הבחירות חלות על גודל המסך הזה. בטלפון, בטאבלט ובמחשב אפשר לבחור סידור שונה.',
    start: 'מסך פתיחה',
    hub: 'המרכז',
    snapshot: 'הצגת תמונת מצב נוכחית',
    recents: 'הצגת מודולים אחרונים',
    gri: 'הצגת מדד GRI מתקדם',
    shortcuts: 'קיצורים בתחתית או בצד',
    shortcutsHelp: 'אפשר לבחור עד שניים. חזרה, מרכז וקדימה תמיד זמינים.',
    selected: 'נבחר',
    continue: 'המשך',
    back: 'חזרה',
    save: 'שמירה',
    saving: 'שומר…',
    skip: 'דלגו כרגע',
    cancel: 'ביטול',
    resetLayout: 'איפוס שינויי התצוגה',
    chooseRelationship: 'בחרו אפשרות אחת, או דלגו על השאלון.',
    shortcutLimit: 'אפשר לבחור עד שני קיצורים.',
    saveFailed: 'לא הצלחנו לשמור את ההעדפות. נסו שוב.',
  },
} as const;

const RELATIONSHIP_CHOICES: readonly RelationshipToDataSubject[] = [
  'self',
  'parent',
  'family-member',
  'caregiver',
  'clinician',
  'other',
  'prefer-not-to-answer',
];

export interface PersonalizationQuestionnaireViewProps {
  readonly locale: DestinationLocale;
  readonly layout: PersonalizationLayout;
  readonly mode: 'onboarding' | 'customize';
  readonly initialStage?: PersonalizationQuestionnaireStage;
  readonly value: StoredProductPersonalization;
  readonly onSave: (value: StoredProductPersonalization) => Promise<void>;
  readonly onCancel?: () => void;
}

const targetSelected = (
  targets: readonly StoredDestinationTarget[],
  destinationId: string,
): boolean => targets.some(target => target.destinationId === destinationId);

const toggleTarget = (
  targets: readonly StoredDestinationTarget[],
  destinationId: string,
): readonly StoredDestinationTarget[] =>
  targetSelected(targets, destinationId)
    ? targets.filter(target => target.destinationId !== destinationId)
    : [...targets, createStoredDestinationTarget(destinationId)];

const Option = ({
  title,
  description,
  selected,
  disabled = false,
  testID,
  selectionMode = 'multiple',
  rtl,
  onPress,
}: {
  readonly title: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
  readonly selectionMode?: 'single' | 'multiple';
  readonly rtl: boolean;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
    accessibilityState={{checked: selected, disabled}}
    disabled={disabled}
    onPress={onPress}
    style={({pressed}) => [
      styles.option,
      selected && styles.optionSelected,
      disabled && styles.optionDisabled,
      pressed && !disabled && styles.pressed,
    ]}
    {...(testID === undefined ? {} : {testID})}>
    <View style={[styles.optionRow, rtl && styles.rowReverse]}>
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, rtl && styles.rtlText]}>{title}</Text>
        {description ? (
          <Text style={[styles.optionDescription, rtl && styles.rtlText]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        <Text style={styles.checkLabel}>{selected ? '✓' : ''}</Text>
      </View>
    </View>
  </Pressable>
);

const DestinationOptions = ({
  destinations,
  selected,
  locale,
  disabledWhen,
  selectionMode,
  testIDPrefix,
  onToggle,
}: {
  readonly destinations: readonly DestinationDefinition[];
  readonly selected: readonly StoredDestinationTarget[];
  readonly locale: DestinationLocale;
  readonly disabledWhen?: (destination: DestinationDefinition) => boolean;
  readonly selectionMode?: 'single' | 'multiple';
  readonly testIDPrefix?: string;
  readonly onToggle: (destinationId: string) => void;
}) => {
  const rtl = locale === 'he';
  return (
    <View>
      {destinations.map(destination => {
        const isSelected = targetSelected(selected, destination.id);
        return (
          <Option
            description={destination.copy[locale].description}
            disabled={disabledWhen?.(destination) ?? false}
            key={destination.id}
            onPress={() => onToggle(destination.id)}
            rtl={rtl}
            {...(selectionMode === undefined ? {} : {selectionMode})}
            selected={isSelected}
            {...(testIDPrefix === undefined
              ? {}
              : {testID: `${testIDPrefix}-${destination.id}`})}
            title={destination.copy[locale].title}
          />
        );
      })}
    </View>
  );
};

const initialPresentation = (
  value: StoredProductPersonalization,
  layout: PersonalizationLayout,
): QuestionnairePresentationStage => {
  const profile = selectLayoutProfile(value, layout);
  return {
    schemaVersion: 1,
    layout,
    showCurrentSnapshot: profile.showCurrentSnapshot,
    showRecents: profile.showRecents,
    showGri: profile.showGri,
    shell: profile.shell,
    ...(profile.dayGraph === undefined ? {} : {dayGraph: profile.dayGraph}),
  };
};

const stageIndex = (stage: PersonalizationQuestionnaireStage): number => {
  switch (stage) {
    case 'relationship':
      return 0;
    case 'quick-access':
      return 1;
    case 'presentation':
      return 2;
  }
};

const initialStageIndex = (
  value: StoredProductPersonalization,
  mode: PersonalizationQuestionnaireViewProps['mode'],
  preferredStage?: PersonalizationQuestionnaireStage,
): number => {
  if (mode === 'customize') {
    return preferredStage === undefined ? 0 : stageIndex(preferredStage);
  }
  if (value.workspace.questionnaire.status === 'in-progress') {
    return stageIndex(value.workspace.questionnaire.currentStage);
  }
  return 0;
};

export const PersonalizationQuestionnaireView = ({
  locale,
  layout,
  mode,
  initialStage: preferredInitialStage,
  value,
  onSave,
  onCancel,
}: PersonalizationQuestionnaireViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const draftScope = `${mode}:${layout}:${preferredInitialStage ?? 'default'}`;
  const previousDraftScope = useRef(draftScope);
  const [stage, setStage] = useState(() =>
    initialStageIndex(value, mode, preferredInitialStage),
  );
  const [relationship, setRelationship] = useState<
    RelationshipToDataSubject | undefined
  >(value.workspace.relationship);
  const [favorites, setFavorites] = useState(value.account.favorites);
  const [hiddenModules, setHiddenModules] = useState(
    value.account.hiddenModules,
  );
  const [presentation, setPresentation] = useState(() =>
    initialPresentation(value, layout),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    const scopeChanged = previousDraftScope.current !== draftScope;
    if (!scopeChanged && dirty) {
      return;
    }
    previousDraftScope.current = draftScope;
    setStage(initialStageIndex(value, mode, preferredInitialStage));
    setRelationship(value.workspace.relationship);
    setFavorites(value.account.favorites);
    setHiddenModules(value.account.hiddenModules);
    setPresentation(initialPresentation(value, layout));
    setError(undefined);
    if (scopeChanged) {
      setDirty(false);
    }
  }, [dirty, draftScope, layout, mode, preferredInitialStage, value]);
  const favoriteDestinations = useMemo(
    () =>
      coreDestinationRegistry.destinations.filter(
        destination => destination.targetPolicy.favorite,
      ),
    [],
  );
  const favoriteModules = favoriteDestinations.filter(
    destination => destination.kind === 'module',
  );
  const focused = favoriteDestinations.filter(
    destination => destination.kind === 'module-child',
  );
  const allModules = useMemo(
    () =>
      coreDestinationRegistry.destinations.filter(
        destination => destination.kind === 'module',
      ),
    [],
  );
  const startDestinations = useMemo(
    () =>
      coreDestinationRegistry.destinations.filter(
        destination => destination.targetPolicy.start,
      ),
    [],
  );
  const shortcutDestinations = useMemo(
    () =>
      coreDestinationRegistry.destinations.filter(
        destination => destination.targetPolicy.shortcut,
      ),
    [],
  );

  const chooseRelationship = (next: RelationshipToDataSubject) => {
    setDirty(true);
    setRelationship(next);
    setError(undefined);
    if (mode === 'onboarding') {
      const preset = buildPersonalizationQuestionnairePreset(next, layout);
      setFavorites(preset.quickAccess.favorites);
      setPresentation(current => ({
        ...preset.presentation,
        ...(current.dayGraph === undefined ? {} : {dayGraph: current.dayGraph}),
      }));
    }
  };

  const updatePresentation = (
    update: (
      current: QuestionnairePresentationStage,
    ) => QuestionnairePresentationStage,
  ) => {
    setDirty(true);
    setPresentation(update);
  };

  const updateShell = (shell: StoredProductShellPreferences) =>
    updatePresentation(current => ({...current, shell}));

  const toggleFavorite = (destinationId: string) => {
    setDirty(true);
    setFavorites(current => toggleTarget(current, destinationId));
  };

  const moveFavorite = (
    destinationId: string,
    direction: 'earlier' | 'later',
  ) => {
    setDirty(true);
    setFavorites(current =>
      moveFavoriteDestination(current, destinationId, direction),
    );
  };

  const toggleModuleVisibility = (destinationId: string) => {
    setDirty(true);
    setHiddenModules(current => toggleTarget(current, destinationId));
  };

  const visibleModules = allModules
    .filter(module => !targetSelected(hiddenModules, module.id))
    .map(module => createStoredDestinationTarget(module.id));

  const setHubStart = () => {
    const withoutStart = {...presentation.shell};
    delete withoutStart.startDestination;
    updateShell(withoutStart);
  };

  const runSave = async (next: StoredProductPersonalization) => {
    if (saveInFlight.current) {
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(next);
    } catch {
      setError(copy.saveFailed);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const save = async () => {
    if (mode === 'onboarding' && !relationship) {
      setError(copy.chooseRelationship);
      setStage(0);
      return;
    }
    if (mode === 'customize') {
      await runSave(
        customizeProductPersonalization(value, {
          ...(relationship === undefined ? {} : {relationship}),
          favorites,
          hiddenModules,
          presentation,
        }),
      );
      return;
    }
    if (!relationship) {
      return;
    }
    const answers: PersonalizationQuestionnaireAnswers = {
      schemaVersion: 1,
      relationship: {schemaVersion: 1, relationship},
      quickAccess: {schemaVersion: 1, favorites},
      presentation,
    };
    await runSave(completePersonalizationQuestionnaire(value, answers));
  };

  const skip = async () => {
    await runSave(skipPersonalizationQuestionnaire(value));
  };

  const next = () => {
    if (stage === 0 && !relationship && mode === 'onboarding') {
      setError(copy.chooseRelationship);
      return;
    }
    setError(undefined);
    setStage(current => Math.min(2, current + 1));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      testID="personalization-questionnaire">
      <View style={[styles.headerRow, rtl && styles.rowReverse]}>
        <View style={styles.headerCopy}>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtlText]}>
            {mode === 'onboarding' ? copy.onboardingTitle : copy.customizeTitle}
          </Text>
          <Text style={[styles.step, rtl && styles.rtlText]}>
            {copy.step} {stage + 1} {copy.of} 3
          </Text>
        </View>
        {mode === 'customize' && onCancel ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({pressed}) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.cancelLabel}>{copy.cancel}</Text>
          </Pressable>
        ) : null}
      </View>

      {stage === 0 ? (
        <View>
          <Text style={[styles.stageTitle, rtl && styles.rtlText]}>
            {copy.relationshipTitle}
          </Text>
          <Text style={[styles.stageDescription, rtl && styles.rtlText]}>
            {copy.relationshipDescription}
          </Text>
          {RELATIONSHIP_CHOICES.map(choice => (
            <Option
              key={choice}
              onPress={() => chooseRelationship(choice)}
              rtl={rtl}
              selectionMode="single"
              selected={relationship === choice}
              testID={`personalization-relationship-${choice}`}
              title={copy[choice]}
            />
          ))}
        </View>
      ) : null}

      {stage === 1 ? (
        <View>
          <Text style={[styles.stageTitle, rtl && styles.rtlText]}>
            {copy.quickTitle}
          </Text>
          <Text style={[styles.stageDescription, rtl && styles.rtlText]}>
            {copy.quickDescription}
          </Text>
          {favorites.length > 0 ? (
            <>
              <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
                {copy.favoriteOrder}
              </Text>
              <View testID="personalization-favorite-order">
                {favorites.map((favorite, index) => {
                  const destination = coreDestinationRegistry.get(
                    favorite.destinationId,
                  );
                  const title =
                    destination?.copy[locale].title ?? favorite.destinationId;
                  return (
                    <View
                      accessibilityLabel={`${index + 1}. ${title}`}
                      key={favorite.destinationId}
                      style={[styles.orderRow, rtl && styles.rowReverse]}
                      testID={`personalization-favorite-order-${favorite.destinationId}`}>
                      <Text style={styles.orderNumber}>{index + 1}</Text>
                      <Text
                        numberOfLines={2}
                        style={[styles.orderTitle, rtl && styles.rtlText]}>
                        {title}
                      </Text>
                      <Pressable
                        accessibilityLabel={`${copy.moveEarlier}: ${title}`}
                        accessibilityRole="button"
                        accessibilityState={{disabled: index === 0}}
                        disabled={index === 0}
                        hitSlop={5}
                        onPress={() =>
                          moveFavorite(favorite.destinationId, 'earlier')
                        }
                        style={({pressed}) => [
                          styles.orderButton,
                          index === 0 && styles.optionDisabled,
                          pressed && index !== 0 && styles.pressed,
                        ]}
                        testID={`personalization-favorite-order-${favorite.destinationId}-earlier`}>
                        <Text style={styles.orderButtonLabel}>↑</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`${copy.moveLater}: ${title}`}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: index === favorites.length - 1,
                        }}
                        disabled={index === favorites.length - 1}
                        hitSlop={5}
                        onPress={() =>
                          moveFavorite(favorite.destinationId, 'later')
                        }
                        style={({pressed}) => [
                          styles.orderButton,
                          index === favorites.length - 1 &&
                            styles.optionDisabled,
                          pressed &&
                            index !== favorites.length - 1 &&
                            styles.pressed,
                        ]}
                        testID={`personalization-favorite-order-${favorite.destinationId}-later`}>
                        <Text style={styles.orderButtonLabel}>↓</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
          <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
            {copy.modules}
          </Text>
          <DestinationOptions
            destinations={favoriteModules}
            locale={locale}
            onToggle={toggleFavorite}
            selected={favorites}
            testIDPrefix="personalization-favorite"
          />
          <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
            {copy.focused}
          </Text>
          <DestinationOptions
            destinations={focused}
            locale={locale}
            onToggle={toggleFavorite}
            selected={favorites}
            testIDPrefix="personalization-favorite"
          />
          {mode === 'customize' ? (
            <>
              <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
                {copy.visibilityTitle}
              </Text>
              <Text style={[styles.helper, rtl && styles.rtlText]}>
                {copy.visibilityDescription}
              </Text>
              <DestinationOptions
                destinations={allModules}
                locale={locale}
                onToggle={toggleModuleVisibility}
                selected={visibleModules}
                testIDPrefix="personalization-module-visible"
              />
            </>
          ) : null}
        </View>
      ) : null}

      {stage === 2 ? (
        <View>
          <Text style={[styles.stageTitle, rtl && styles.rtlText]}>
            {copy.presentationTitle}
          </Text>
          <Text style={[styles.stageDescription, rtl && styles.rtlText]}>
            {copy.presentationDescription}
          </Text>

          <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
            {copy.start}
          </Text>
          <Option
            onPress={setHubStart}
            rtl={rtl}
            selectionMode="single"
            selected={presentation.shell.startDestination === undefined}
            testID="personalization-start-hub"
            title={copy.hub}
          />
          <DestinationOptions
            destinations={startDestinations}
            locale={locale}
            onToggle={destinationId =>
              updateShell({
                ...presentation.shell,
                startDestination: createStoredDestinationTarget(destinationId),
              })
            }
            selectionMode="single"
            selected={
              presentation.shell.startDestination
                ? [presentation.shell.startDestination]
                : []
            }
            testIDPrefix="personalization-start"
          />

          <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
            {copy.shortcuts}
          </Text>
          <Text style={[styles.helper, rtl && styles.rtlText]}>
            {copy.shortcutsHelp}
          </Text>
          <DestinationOptions
            destinations={shortcutDestinations}
            disabledWhen={destination =>
              presentation.shell.shortcuts.length >= 2 &&
              !targetSelected(presentation.shell.shortcuts, destination.id)
            }
            locale={locale}
            onToggle={destinationId => {
              const selected = targetSelected(
                presentation.shell.shortcuts,
                destinationId,
              );
              if (!selected && presentation.shell.shortcuts.length >= 2) {
                setError(copy.shortcutLimit);
                return;
              }
              setError(undefined);
              updateShell({
                ...presentation.shell,
                shortcuts: toggleTarget(
                  presentation.shell.shortcuts,
                  destinationId,
                ),
              });
            }}
            selected={presentation.shell.shortcuts}
            testIDPrefix="personalization-shortcut"
          />

          <Text style={[styles.groupTitle, rtl && styles.rtlText]}>
            {copy.selected}
          </Text>
          <Option
            onPress={() =>
              updatePresentation(current => ({
                ...current,
                showCurrentSnapshot: !current.showCurrentSnapshot,
              }))
            }
            rtl={rtl}
            selected={presentation.showCurrentSnapshot}
            testID="personalization-current-snapshot"
            title={copy.snapshot}
          />
          <Option
            onPress={() =>
              updatePresentation(current => ({
                ...current,
                showRecents: !current.showRecents,
              }))
            }
            rtl={rtl}
            selected={presentation.showRecents}
            title={copy.recents}
          />
          <Option
            onPress={() =>
              updatePresentation(current => ({
                ...current,
                showGri: !current.showGri,
              }))
            }
            rtl={rtl}
            selected={presentation.showGri}
            testID="personalization-show-gri"
            title={copy.gri}
          />
          {mode === 'customize' ? (
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                setDirty(true);
                setError(undefined);
                setPresentation(initialPresentation(value, layout));
              }}
              style={({pressed}) => [
                styles.resetButton,
                pressed && styles.pressed,
              ]}
              testID="personalization-reset-layout">
              <Text style={styles.resetLabel}>{copy.resetLayout}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, rtl && styles.rtlText]}>
          {error}
        </Text>
      ) : null}

      <View style={[styles.actions, rtl && styles.rowReverse]}>
        {stage > 0 ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => setStage(current => Math.max(0, current - 1))}
            style={({pressed}) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.secondaryLabel}>{copy.back}</Text>
          </Pressable>
        ) : mode === 'onboarding' ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={skip}
            style={({pressed}) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.secondaryLabel}>{copy.skip}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={stage === 2 ? save : next}
          style={({pressed}) => [
            styles.primaryButton,
            saving && styles.optionDisabled,
            pressed && !saving && styles.pressed,
          ]}
          testID="personalization-primary-action">
          <Text style={styles.primaryLabel}>
            {saving ? copy.saving : stage === 2 ? copy.save : copy.continue}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F5F7FA'},
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 54,
  },
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerCopy: {flex: 1},
  title: {color: '#17202A', fontSize: 28, fontWeight: '700', lineHeight: 36},
  step: {color: '#5C6875', fontSize: 14, lineHeight: 20, marginTop: 4},
  cancelButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelLabel: {color: '#1769AA', fontSize: 15, fontWeight: '700'},
  stageTitle: {
    color: '#17202A',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 29,
    marginTop: 28,
  },
  stageDescription: {
    color: '#5C6875',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 16,
  },
  groupTitle: {
    color: '#17202A',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 20,
    marginBottom: 8,
  },
  helper: {color: '#5C6875', fontSize: 14, lineHeight: 20, marginBottom: 8},
  option: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE2E8',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
  },
  optionSelected: {borderColor: '#1769AA', backgroundColor: '#E7F1FA'},
  optionDisabled: {opacity: 0.5},
  optionRow: {flexDirection: 'row', alignItems: 'center'},
  optionCopy: {flex: 1},
  optionTitle: {
    color: '#17202A',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  optionDescription: {
    color: '#5C6875',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  orderRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE2E8',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 7,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  orderNumber: {
    color: '#1769AA',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  orderTitle: {
    color: '#17202A',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginHorizontal: 7,
  },
  orderButton: {
    alignItems: 'center',
    backgroundColor: '#E7F1FA',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginHorizontal: 3,
    width: 36,
  },
  orderButtonLabel: {color: '#1769AA', fontSize: 20, fontWeight: '700'},
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#AAB4BF',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  checkSelected: {backgroundColor: '#1769AA', borderColor: '#1769AA'},
  checkLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
  error: {color: '#9F2D27', fontSize: 14, lineHeight: 20, marginTop: 16},
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1769AA',
    borderRadius: 24,
    paddingHorizontal: 24,
  },
  primaryLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '700'},
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryLabel: {color: '#1769AA', fontSize: 15, fontWeight: '700'},
  resetButton: {
    minHeight: 44,
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  resetLabel: {color: '#1769AA', fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.72},
});
