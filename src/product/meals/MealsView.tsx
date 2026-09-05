import React, {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type {
  CarbPurpose,
  MealEntryId,
  MealExternalCandidate,
  MealImageSnapshot,
  MealsWorkspace,
  SupportingTreatmentPurpose,
} from '../../modules/journal';
import type {MealImagesRuntime} from '../../modules/mealMedia';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import type {ComparableMealFacts} from '../../modules/eventOutcomes';
import {
  JournalButton,
  JournalFormActions,
  JournalNotice,
  runPresentedJournalAction,
} from '../journal';
import {formatJournalDateTime} from '../journal/formValues';
import {
  MealCreateLinkPicker,
  type PendingMealExternalLink,
} from './MealCreateLinkPicker';
import {MealDetail, presentMealFormFailure} from './MealDetail';
import {MealEditor} from './MealEditor';
import {buildMealCapture, emptyMealDraft} from './formModel';
import type {MealDraft} from './formModel';
import type {MealCardViewModel, MealsLocale} from './selectors';
import {selectMealCards} from './selectors';
import {MealImagePreview} from './MealImageField';

const COPY = {
  en: {
    title: 'Meals',
    subtitle:
      'Capture what was eaten, then explicitly connect read-only Loop context when useful.',
    add: 'Add meal',
    active: 'Meals',
    trash: 'Trash',
    empty: 'No meals yet. You can add one without a connection.',
    emptyTrash: 'Trash is empty.',
    loadMore: 'Load more',
    open: 'Open details',
    saved: 'Meal saved locally. Sync can happen later.',
    savedWithLinkFailure: (message: string) =>
      'The meal was saved locally, but at least one Loop link was not added. ' +
      message,
    createTitle: 'New meal',
    syncingHint: 'Local changes stay available while sync is pending.',
  },
  he: {
    title: 'ארוחות',
    subtitle:
      'רושמים מה נאכל, ואז מקשרים במפורש הקשר לקריאה בלבד מהלופ כשצריך.',
    add: 'הוספת ארוחה',
    active: 'ארוחות',
    trash: 'סל מחזור',
    empty: 'עדיין אין ארוחות. אפשר להוסיף גם ללא חיבור.',
    emptyTrash: 'סל המחזור ריק.',
    loadMore: 'טעינת עוד',
    open: 'פתיחת פרטים',
    saved: 'הארוחה נשמרה מקומית. הסנכרון יכול להתבצע אחר כך.',
    savedWithLinkFailure: (message: string) =>
      'הארוחה נשמרה מקומית, אבל לפחות קישור אחד ל־Loop לא נוסף. ' + message,
    createTitle: 'ארוחה חדשה',
    syncingHint: 'שינויים מקומיים נשארים זמינים גם כשהסנכרון ממתין.',
  },
} as const;

const PAGE_SIZE = 40;

export interface MealsViewProps {
  readonly workspace: MealsWorkspace;
  readonly locale: MealsLocale;
  readonly now?: () => number;
  readonly formatTime?: (timestamp: number) => string;
  /** Transient journal-entry navigation focus; never persisted by this Module. */
  readonly focusedMealId?: MealEntryId;
  readonly onOpenMeal?: (mealId: MealEntryId) => void;
  readonly imagesRuntime?: MealImagesRuntime;
  readonly outcomeDataSource?: DayGraphDataSource;
  readonly outcomeExpectedSampleIntervalMs?: number;
}

const defaultFormatTime =
  (locale: MealsLocale) =>
  (timestamp: number): string =>
    new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));

const MealCard = ({
  model,
  locale,
  openLabel,
  onOpen,
  image,
  imagesRuntime,
}: {
  readonly model: MealCardViewModel;
  readonly locale: MealsLocale;
  readonly openLabel: string;
  readonly onOpen: () => void;
  readonly image?: MealImageSnapshot;
  readonly imagesRuntime?: MealImagesRuntime;
}) => {
  const rtl = locale === 'he';
  return (
    <Pressable
      accessibilityLabel={`${model.title}. ${model.timeLabel}. ${openLabel}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({pressed}) => [styles.card, pressed && styles.pressed]}
      testID={`meal-open-${model.id}`}>
      <View style={[styles.cardHeader, rtl && styles.rowReverse]}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
            {model.title}
          </Text>
          <Text style={[styles.time, rtl && styles.rtlText]}>
            {model.timeLabel}
          </Text>
        </View>
        <View
          style={[
            styles.syncBadge,
            model.syncTone === 'attention' && styles.syncAttention,
            model.syncTone === 'warning' && styles.syncWarning,
          ]}>
          <Text style={styles.syncText}>{model.syncLabel}</Text>
        </View>
      </View>
      {image !== undefined ? (
        <MealImagePreview
          compact
          image={image}
          {...(imagesRuntime === undefined ? {} : {runtime: imagesRuntime})}
          testID={`meal-card-image-${model.id}`}
        />
      ) : null}
      {model.mealCarbohydratesLabel ? (
        <Text style={[styles.fact, rtl && styles.rtlText]}>
          {model.mealCarbohydratesLabel}
        </Text>
      ) : null}
      {model.reportedCarbohydratesLabel ? (
        <Text style={[styles.reported, rtl && styles.rtlText]}>
          {model.reportedCarbohydratesLabel}
        </Text>
      ) : null}
      {model.linkedRecordsLabel ? (
        <Text style={[styles.secondary, rtl && styles.rtlText]}>
          {model.linkedRecordsLabel}
        </Text>
      ) : null}
      {model.tags.length > 0 ? (
        <View style={[styles.tags, rtl && styles.rowReverse]}>
          {model.tags.slice(0, 4).map(tag => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[styles.openLabel, rtl && styles.rtlText]}>{openLabel}</Text>
    </Pressable>
  );
};

export const MealsView = ({
  workspace,
  locale,
  now = Date.now,
  formatTime,
  focusedMealId,
  onOpenMeal,
  imagesRuntime,
  outcomeDataSource,
  outcomeExpectedSampleIntervalMs,
}: MealsViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const {width} = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [showTrash, setShowTrash] = useState(false);
  const query = useMemo(
    () => ({limit: visibleLimit, includeTrashed: true}),
    [visibleLimit],
  );
  const page = useSyncExternalStore(
    workspace.subscribe,
    () => workspace.getListSnapshot(query),
    () => workspace.getListSnapshot(query),
  );
  const formatter = useMemo(
    () => formatTime ?? defaultFormatTime(locale),
    [formatTime, locale],
  );
  const visibleMeals = useMemo(
    () =>
      page.items.filter(meal =>
        showTrash
          ? meal.lifecycle.kind === 'trashed'
          : meal.lifecycle.kind === 'active',
      ),
    [page.items, showTrash],
  );
  const comparableMeals = useMemo<readonly ComparableMealFacts[]>(
    () =>
      page.items
        .filter(meal => meal.lifecycle.kind === 'active')
        .map(meal => ({
          id: meal.id,
          mealStartMs: meal.mealStart,
          ...(meal.name === undefined ? {} : {name: meal.name}),
          tags: meal.tags,
          ...(meal.mealCarbohydrates === undefined
            ? {}
            : {carbohydratesGrams: meal.mealCarbohydrates.grams}),
        })),
    [page.items],
  );
  const cards = useMemo(
    () => selectMealCards(visibleMeals, locale, formatter),
    [formatter, locale, visibleMeals],
  );
  const imagesById = useMemo(
    () =>
      visibleMeals.reduce<Map<MealEntryId, MealImageSnapshot>>(
        (images, meal) => {
          if (meal.image !== undefined) {
            images.set(meal.id, meal.image);
          }
          return images;
        },
        new Map(),
      ),
    [visibleMeals],
  );
  const [selectedId, setSelectedId] = useState<MealEntryId | undefined>(
    focusedMealId,
  );
  const selected =
    selectedId === undefined ? undefined : workspace.getSnapshot(selectedId);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<MealDraft>(() => emptyMealDraft(now()));
  const [pendingLinks, setPendingLinks] = useState<
    readonly PendingMealExternalLink[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<
    {readonly tone: 'error' | 'success'; readonly message: string} | undefined
  >();

  useEffect(() => {
    if (focusedMealId !== undefined) {
      setSelectedId(focusedMealId);
      const focused = workspace.getSnapshot(focusedMealId);
      if (focused?.lifecycle.kind === 'trashed') {
        setShowTrash(true);
      }
    }
  }, [focusedMealId, workspace]);

  const openCreate = (): void => {
    setDraft(emptyMealDraft(now()));
    setPendingLinks([]);
    setNotice(undefined);
    setCreating(true);
  };

  const selectPendingLink = (
    candidate: MealExternalCandidate,
    purpose: CarbPurpose | SupportingTreatmentPurpose,
  ): void => {
    const selection: PendingMealExternalLink | undefined =
      candidate.kind === 'carbohydrate' &&
      (purpose === 'meal' ||
        purpose === 'low_treatment' ||
        purpose === 'unknown')
        ? {candidate, purpose}
        : candidate.kind === 'treatment' &&
          (purpose === 'bolus' ||
            purpose === 'correction' ||
            purpose === 'other')
        ? {candidate, purpose}
        : undefined;
    if (selection === undefined) {
      return;
    }
    const alreadyHasMealReport = pendingLinks.some(
      item =>
        item.candidate.kind === 'carbohydrate' && item.purpose === 'meal',
    );
    setPendingLinks(current => {
      const withoutCurrent = current.filter(
        item =>
          item.candidate.record.recordKey !== candidate.record.recordKey,
      );
      return withoutCurrent.length >= 2
        ? current
        : [...withoutCurrent, selection];
    });
    if (
      candidate.kind === 'carbohydrate' &&
      purpose === 'meal' &&
      !alreadyHasMealReport
    ) {
      setDraft(current => ({
        ...current,
        mealStart: formatJournalDateTime(candidate.snapshot.externalCarbTime),
        ...(current.mealCarbohydrates.trim().length === 0
          ? {mealCarbohydrates: String(candidate.snapshot.carbohydratesGrams)}
          : {}),
      }));
    }
  };

  const save = async (): Promise<void> => {
    const built = buildMealCapture(draft);
    if (!built.ok) {
      setNotice({
        tone: 'error',
        message: presentMealFormFailure(built.reason, locale),
      });
      return;
    }
    setSaving(true);
    setNotice(undefined);
    try {
      const result = await runPresentedJournalAction(
        () => workspace.capture(built.value),
        locale,
      );
      if (!result.ok) {
        setNotice({tone: 'error', message: result.message});
        return;
      }
      let latest = result.value;
      let linkFailure: string | undefined;
      for (const selectedLink of pendingLinks) {
        const candidate = selectedLink.candidate;
        const linked = await runPresentedJournalAction(
          () =>
            candidate.kind === 'carbohydrate'
              ? workspace.linkExternalEvent({
                  mealId: latest.id,
                  expectedRevision: latest.revision,
                  record: candidate.record,
                  snapshot: candidate.snapshot,
                  role: {
                    kind: 'reported_carbohydrate',
                    purpose: selectedLink.purpose as CarbPurpose,
                  },
                })
              : workspace.linkExternalEvent({
                  mealId: latest.id,
                  expectedRevision: latest.revision,
                  record: candidate.record,
                  snapshot: candidate.snapshot,
                  role: {
                    kind: 'supporting_treatment',
                    purpose:
                      selectedLink.purpose as SupportingTreatmentPurpose,
                  },
                }),
          locale,
        );
        if (linked.ok) {
          latest = linked.value;
        } else {
          linkFailure ??= linked.message;
        }
      }
      setCreating(false);
      setPendingLinks([]);
      setShowTrash(false);
      setSelectedId(latest.id);
      setNotice(
        linkFailure === undefined
          ? {tone: 'success', message: copy.saved}
          : {tone: 'error', message: copy.savedWithLinkFailure(linkFailure)},
      );
    } catch {
      setNotice({
        tone: 'error',
        message:
          locale === 'he'
            ? 'לא הצלחנו לשמור במכשיר. לא בוצע שינוי.'
            : 'Could not save on this device. Nothing changed.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openMeal = (mealId: MealEntryId): void => {
    setSelectedId(mealId);
    setCreating(false);
    setNotice(undefined);
    onOpenMeal?.(mealId);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      testID="meals-view">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={styles.headingBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtlText]}>
            {copy.title}
          </Text>
          <Text style={[styles.subtitle, rtl && styles.rtlText]}>
            {copy.subtitle}
          </Text>
        </View>
        <JournalButton
          label={copy.add}
          onPress={openCreate}
          testID="meals-add-toggle"
          tone="primary"
        />
      </View>

      <Text style={[styles.offlineHint, rtl && styles.rtlText]}>
        {copy.syncingHint}
      </Text>

      {notice ? (
        <JournalNotice
          locale={locale}
          message={notice.message}
          tone={notice.tone}
          testID="meal-list-notice"
        />
      ) : null}

      {creating ? (
        <View style={styles.editorCard}>
          <Text
            accessibilityRole="header"
            style={[styles.editorTitle, rtl && styles.rtlText]}>
            {copy.createTitle}
          </Text>
          <MealEditor
            additionalFields={
              <MealCreateLinkPicker
                busy={saving}
                formatTime={formatter}
                locale={locale}
                mealStart={draft.mealStart}
                onRemove={recordKey =>
                  setPendingLinks(current =>
                    current.filter(
                      item =>
                        item.candidate.record.recordKey !== recordKey,
                    ),
                  )
                }
                onSelect={selectPendingLink}
                selected={pendingLinks}
                workspace={workspace}
              />
            }
            busy={saving}
            draft={draft}
            locale={locale}
            mode="create"
            onCancel={() => {
              setCreating(false);
              setPendingLinks([]);
              setNotice(undefined);
            }}
            onChange={setDraft}
            onSave={save}
            {...(imagesRuntime === undefined ? {} : {imagesRuntime})}
          />
        </View>
      ) : null}

      {selected ? (
        <MealDetail
          comparableMeals={comparableMeals}
          formatTime={formatter}
          locale={locale}
          meal={selected}
          onClose={() => setSelectedId(undefined)}
          workspace={workspace}
          {...(imagesRuntime === undefined ? {} : {imagesRuntime})}
          {...(outcomeDataSource === undefined
            ? {}
            : {outcomeDataSource})}
          {...(outcomeExpectedSampleIntervalMs === undefined
            ? {}
            : {outcomeExpectedSampleIntervalMs})}
        />
      ) : selectedId !== undefined ? (
        <JournalNotice
          locale={locale}
          message={
            locale === 'he'
              ? 'הארוחה המבוקשת כבר אינה זמינה.'
              : 'The requested meal is no longer available.'
          }
          testID="meal-focus-not-found"
        />
      ) : null}

      <JournalFormActions locale={locale}>
        <JournalButton
          label={copy.active}
          onPress={() => setShowTrash(false)}
          testID="meals-show-active"
          tone={showTrash ? 'secondary' : 'primary'}
        />
        <JournalButton
          label={copy.trash}
          onPress={() => setShowTrash(true)}
          testID="meals-show-trash"
          tone={showTrash ? 'primary' : 'secondary'}
        />
      </JournalFormActions>

      {cards.length === 0 ? (
        <Text style={[styles.empty, rtl && styles.rtlText]}>
          {showTrash ? copy.emptyTrash : copy.empty}
        </Text>
      ) : (
        <View style={[styles.grid, rtl && styles.rowReverse]}>
          {cards.map(card => {
            const image = imagesById.get(card.id);
            return (
              <View
                key={card.id}
                style={columns === 2 ? styles.halfColumn : styles.fullColumn}>
                <MealCard
                  {...(image === undefined ? {} : {image})}
                  {...(imagesRuntime === undefined ? {} : {imagesRuntime})}
                  locale={locale}
                  model={card}
                  onOpen={() => openMeal(card.id)}
                  openLabel={copy.open}
                />
              </View>
            );
          })}
        </View>
      )}

      {page.nextCursor ? (
        <JournalButton
          label={copy.loadMore}
          onPress={() => setVisibleLimit(current => current + PAGE_SIZE)}
          testID="meals-load-more"
          tone="quiet"
        />
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F4F7FA'},
  content: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 64,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headingBlock: {flex: 1, marginEnd: 14},
  title: {color: '#17202A', fontSize: 30, fontWeight: '800', lineHeight: 38},
  subtitle: {color: '#526170', fontSize: 15, lineHeight: 22, marginTop: 4},
  offlineHint: {
    color: '#47657A',
    backgroundColor: '#E8F2F8',
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    padding: 10,
  },
  editorCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E1E9',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
  editorTitle: {
    color: '#17202A',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  fullColumn: {width: '100%'},
  halfColumn: {width: '48.8%'},
  card: {
    minHeight: 190,
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE5EC',
    borderWidth: 1,
    borderRadius: 17,
    padding: 16,
    marginBottom: 14,
  },
  pressed: {opacity: 0.72},
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitleBlock: {flex: 1, marginEnd: 10},
  cardTitle: {
    color: '#17202A',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  time: {color: '#657381', fontSize: 13, lineHeight: 19, marginTop: 2},
  syncBadge: {
    borderRadius: 10,
    backgroundColor: '#E7F1FA',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  syncAttention: {backgroundColor: '#FFF1D6'},
  syncWarning: {backgroundColor: '#FCE9E7'},
  syncText: {color: '#4E6070', fontSize: 11, fontWeight: '700'},
  fact: {color: '#17202A', fontSize: 15, lineHeight: 22, marginBottom: 4},
  reported: {
    color: '#355268',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  secondary: {color: '#697784', fontSize: 13, lineHeight: 19, marginTop: 5},
  tags: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 10},
  tag: {
    color: '#1769AA',
    backgroundColor: '#E7F1FA',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginEnd: 6,
    marginBottom: 6,
  },
  openLabel: {
    color: '#1769AA',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 'auto',
  },
  empty: {color: '#5C6875', fontSize: 16, lineHeight: 24, paddingVertical: 30},
});
