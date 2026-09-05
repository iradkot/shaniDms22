import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  CarbPurpose,
  JournalConflictDecision,
  MealConflictInspection,
  MealExternalCandidate,
  MealExternalTransferUndoReceipt,
  MealSnapshot,
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
import {buildMealRevision, mealDraftFromSnapshot} from './formModel';
import type {MealDraft, MealFormFailure} from './formModel';
import {MealEditor} from './MealEditor';
import type {MealsLocale} from './selectors';
import {MealImagePreview} from './MealImageField';
import {EventOutcomeCard} from '../eventOutcomes';

const COPY = {
  en: {
    details: 'Meal details',
    edit: 'Edit',
    close: 'Close details',
    trash: 'Move to Trash',
    restore: 'Restore',
    saved: 'Meal saved on this device.',
    trashed: 'Meal moved to Trash. It can be restored for 30 days.',
    restored: 'Meal restored.',
    mealCarbs: (grams: number) => `Meal carbohydrates: ${grams} g`,
    noMealCarbs: 'Meal carbohydrates: not recorded',
    reportedCarbs: (grams: number | null, count: number) =>
      grams === null
        ? `Reported carbohydrates: incomplete (${count} records)`
        : `Reported to Loop: ${grams} g across ${count} distinct records`,
    noReportedCarbs: 'Reported carbohydrates: no linked records',
    notes: 'Notes',
    noNotes: 'No notes',
    tags: 'Tags',
    noTags: 'No tags',
    image: 'Meal photo',
    linksTitle: 'Nightscout links',
    linksReadOnly:
      'Links are read-only. ShaniDms never edits Nightscout, and nearby records are never linked automatically.',
    findLinks: 'Find records near this meal',
    findingLinks: 'Looking in Nightscout…',
    noCandidates: 'No linkable records were found in this time window.',
    linked: 'Record linked locally.',
    unlinked: 'Record unlinked locally. Nightscout was not changed.',
    unlink: 'Unlink',
    refresh: 'Refresh link',
    refreshed: 'Linked facts refreshed from Nightscout.',
    moveAs: (purpose: string) => `Move here · ${purpose}`,
    confirmMove: (source: string) =>
      `Move this read-only link from “${source}” to this meal?`,
    confirm: 'Confirm move',
    cancel: 'Cancel',
    moved: 'Link moved between meals. Nightscout was not changed.',
    undo: 'Undo link move',
    undone: 'Link move undone.',
    unavailable: 'Last known record; Nightscout is unavailable.',
    candidateCarb: (grams: number) => `${grams} g carbohydrate record`,
    candidateTreatment: (units: number | undefined) =>
      units === undefined ? 'Treatment record' : `${units} U treatment record`,
    purposes: {
      meal: 'Link as meal report',
      low_treatment: 'Link as low treatment',
      unknown: 'Link, purpose unknown',
      bolus: 'Link as bolus context',
      correction: 'Link as correction context',
      other: 'Link as other treatment',
    },
    conflicts: 'Concurrent edit needs a decision',
    conflictHelp:
      'Both versions are preserved. Choose the current version or apply the saved proposal.',
    conflictFields: (fields: readonly string[]) =>
      `Conflicting fields: ${fields.join(', ')}`,
    keepCurrent: 'Keep current',
    applyProposed: 'Apply other edit',
    conflictResolved: 'Conflict resolved.',
    invalid_time: 'Use a valid date and time in YYYY-MM-DD HH:mm format.',
    invalid_carbohydrates: 'Carbohydrates must be a positive number.',
    meal_required: 'Add a name or Meal Carbohydrates.',
    no_changes: 'Nothing changed.',
  },
  he: {
    details: 'פרטי הארוחה',
    edit: 'עריכה',
    close: 'סגירת הפרטים',
    trash: 'העברה לסל המחזור',
    restore: 'שחזור',
    saved: 'הארוחה נשמרה במכשיר.',
    trashed: 'הארוחה הועברה לסל המחזור. אפשר לשחזר אותה במשך 30 יום.',
    restored: 'הארוחה שוחזרה.',
    mealCarbs: (grams: number) => `פחמימות בארוחה: ${grams} גר׳`,
    noMealCarbs: 'פחמימות בארוחה: לא נרשמו',
    reportedCarbs: (grams: number | null, count: number) =>
      grams === null
        ? `פחמימות שדווחו: מידע חלקי (${count} רשומות)`
        : `דווח ללופ: ${grams} גר׳ ב־${count} רשומות נפרדות`,
    noReportedCarbs: 'פחמימות שדווחו: אין רשומות מקושרות',
    notes: 'הערות',
    noNotes: 'אין הערות',
    tags: 'תגיות',
    noTags: 'אין תגיות',
    image: 'תמונת הארוחה',
    linksTitle: 'קישורים ל־Nightscout',
    linksReadOnly:
      'הקישורים הם לקריאה בלבד. ShaniDms לא משנה את Nightscout ולעולם לא מקשר רשומות קרובות אוטומטית.',
    findLinks: 'חיפוש רשומות ליד הארוחה',
    findingLinks: 'מחפש ב־Nightscout…',
    noCandidates: 'לא נמצאו רשומות שאפשר לקשר בחלון הזמן הזה.',
    linked: 'הרשומה קושרה מקומית.',
    unlinked: 'הקישור המקומי הוסר. Nightscout לא השתנה.',
    unlink: 'הסרת קישור',
    refresh: 'רענון הקישור',
    refreshed: 'פרטי הקישור רועננו מ־Nightscout.',
    moveAs: (purpose: string) => `העברה לכאן · ${purpose}`,
    confirmMove: (source: string) =>
      `להעביר את הקישור לקריאה בלבד מ״${source}״ לארוחה הזו?`,
    confirm: 'אישור העברה',
    cancel: 'ביטול',
    moved: 'הקישור הועבר בין הארוחות. Nightscout לא השתנה.',
    undo: 'ביטול העברת הקישור',
    undone: 'העברת הקישור בוטלה.',
    unavailable: 'הרשומה האחרונה הידועה; Nightscout לא זמין.',
    candidateCarb: (grams: number) => `רשומת פחמימות של ${grams} גר׳`,
    candidateTreatment: (units: number | undefined) =>
      units === undefined ? 'רשומת טיפול' : `רשומת טיפול של ${units} יח׳`,
    purposes: {
      meal: 'קישור כדיווח ארוחה',
      low_treatment: 'קישור כטיפול בהיפו',
      unknown: 'קישור ללא סיווג',
      bolus: 'קישור כבולוס תומך',
      correction: 'קישור כתיקון תומך',
      other: 'קישור כטיפול אחר',
    },
    conflicts: 'עריכה מקבילה דורשת החלטה',
    conflictHelp:
      'שתי הגרסאות נשמרו. אפשר להשאיר את הגרסה הנוכחית או להחיל את ההצעה השמורה.',
    conflictFields: (fields: readonly string[]) =>
      `שדות מתנגשים: ${fields.join(', ')}`,
    keepCurrent: 'השארת הנוכחי',
    applyProposed: 'החלת העריכה השנייה',
    conflictResolved: 'ההתנגשות נפתרה.',
    invalid_time: 'צריך תאריך ושעה תקינים בפורמט YYYY-MM-DD HH:mm.',
    invalid_carbohydrates: 'כמות הפחמימות צריכה להיות מספר חיובי.',
    meal_required: 'צריך להוסיף שם או פחמימות בארוחה.',
    no_changes: 'לא השתנה דבר.',
  },
} as const;

type Notice = {readonly tone: 'error' | 'success'; readonly message: string};

type PendingMealTransfer = {
  readonly candidate: MealExternalCandidate;
  readonly purpose: CarbPurpose | SupportingTreatmentPurpose;
  readonly source: MealSnapshot;
};

const recordIdentity = (record: {
  readonly identifiers: {
    readonly _id?: string;
    readonly identifier?: string;
    readonly syncIdentifier?: string;
  };
}): string =>
  record.identifiers._id ??
  record.identifiers.identifier ??
  record.identifiers.syncIdentifier ??
  'record';

const testIdentity = (candidate: MealExternalCandidate): string =>
  recordIdentity(candidate.record).replace(/[^A-Za-z0-9_-]/g, '-');

export interface MealDetailProps {
  readonly meal: MealSnapshot;
  readonly workspace: MealsWorkspace;
  readonly locale: MealsLocale;
  readonly formatTime: (timestamp: number) => string;
  readonly onClose: () => void;
  readonly imagesRuntime?: MealImagesRuntime;
  readonly outcomeDataSource?: DayGraphDataSource;
  readonly outcomeExpectedSampleIntervalMs?: number;
  readonly comparableMeals?: readonly ComparableMealFacts[];
}

export const MealDetail = ({
  meal,
  workspace,
  locale,
  formatTime,
  onClose,
  imagesRuntime,
  outcomeDataSource,
  outcomeExpectedSampleIntervalMs,
  comparableMeals,
}: MealDetailProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [editing, setEditing] = useState(false);
  const [editSource, setEditSource] = useState(meal);
  const [draft, setDraft] = useState<MealDraft>(() =>
    mealDraftFromSnapshot(meal),
  );
  const [expectedRevision, setExpectedRevision] = useState(meal.revision);
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [candidates, setCandidates] = useState<
    readonly MealExternalCandidate[] | undefined
  >();
  const [candidateError, setCandidateError] = useState<string | undefined>();
  const [pendingTransfer, setPendingTransfer] =
    useState<PendingMealTransfer>();
  const [undoTransfer, setUndoTransfer] =
    useState<MealExternalTransferUndoReceipt>();
  const [conflicts, setConflicts] = useState<readonly MealConflictInspection[]>(
    [],
  );

  const activeMeal = (): MealSnapshot => workspace.getSnapshot(meal.id) ?? meal;

  const loadConflicts = async (): Promise<void> => {
    const result = await runPresentedJournalAction(
      () => workspace.inspectConflicts(meal.id),
      locale,
    );
    if (result.ok) {
      setConflicts(result.value);
    } else {
      setNotice({tone: 'error', message: result.message});
    }
  };

  useEffect(() => {
    if (meal.syncState.kind === 'conflict') {
      loadConflicts().catch(() =>
        setNotice({
          tone: 'error',
          message:
            locale === 'he'
              ? 'לא הצלחנו לטעון את פרטי ההתנגשות.'
              : 'Could not load conflict details.',
        }),
      );
    } else {
      setConflicts([]);
    }
    // The revision is the stable notification that conflict state changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal.id, meal.revision, meal.syncState.kind]);

  const beginEditing = (): void => {
    const current = activeMeal();
    setEditSource(current);
    setDraft(mealDraftFromSnapshot(current));
    setExpectedRevision(current.revision);
    setNotice(undefined);
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    const built = buildMealRevision(editSource, expectedRevision, draft);
    if (!built.ok) {
      setNotice({tone: 'error', message: copy[built.reason]});
      return;
    }
    setBusy('save');
    setNotice(undefined);
    try {
      const result = await runPresentedJournalAction(
        () => workspace.revise(built.value),
        locale,
      );
      if (!result.ok) {
        setNotice({tone: 'error', message: result.message});
        if (result.error?.code === 'journal.revision_conflict') {
          await loadConflicts();
        }
        return;
      }
      setEditing(false);
      setEditSource(result.value);
      setDraft(mealDraftFromSnapshot(result.value));
      setExpectedRevision(result.value.revision);
      setNotice({tone: 'success', message: copy.saved});
    } finally {
      setBusy(undefined);
    }
  };

  const changeLifecycle = async (
    action: 'trash' | 'restore',
  ): Promise<void> => {
    const current = activeMeal();
    setBusy(action);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        action === 'trash'
          ? workspace.trash({
              mealId: current.id,
              expectedRevision: current.revision,
            })
          : workspace.restore({
              mealId: current.id,
              expectedRevision: current.revision,
            }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      if (result.error?.code === 'journal.revision_conflict') {
        await loadConflicts();
      }
      return;
    }
    setNotice({
      tone: 'success',
      message: action === 'trash' ? copy.trashed : copy.restored,
    });
  };

  const findCandidates = async (): Promise<void> => {
    setBusy('find');
    setCandidateError(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.findLinkCandidates({
          nearMealStart: activeMeal().mealStart,
          beforeMs: 3 * 60 * 60_000,
          afterMs: 6 * 60 * 60_000,
        }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setCandidates(undefined);
      setCandidateError(result.message);
      return;
    }
    setCandidates(result.value);
  };

  const linkCandidate = async (
    candidate: MealExternalCandidate,
    purpose: CarbPurpose | SupportingTreatmentPurpose,
  ): Promise<void> => {
    const current = activeMeal();
    const id = testIdentity(candidate);
    setBusy(`link-${id}`);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        candidate.kind === 'carbohydrate'
          ? workspace.linkExternalEvent({
              mealId: current.id,
              expectedRevision: current.revision,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'reported_carbohydrate',
                purpose: purpose as CarbPurpose,
              },
            })
          : workspace.linkExternalEvent({
              mealId: current.id,
              expectedRevision: current.revision,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'supporting_treatment',
                purpose: purpose as SupportingTreatmentPurpose,
              },
            }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      if (result.error?.code === 'journal.revision_conflict') {
        await loadConflicts();
      }
      return;
    }
    setNotice({tone: 'success', message: copy.linked});
  };

  const unlink = async (
    record: MealSnapshot['externalLinks'][number]['record'],
  ) => {
    const current = activeMeal();
    const id = recordIdentity(record).replace(/[^A-Za-z0-9_-]/g, '-');
    setBusy(`unlink-${id}`);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.unlinkExternalEvent({
          mealId: current.id,
          expectedRevision: current.revision,
          record,
        }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setNotice({tone: 'success', message: copy.unlinked});
  };

  const refreshLink = async (
    record: MealSnapshot['externalLinks'][number]['record'],
  ): Promise<void> => {
    const current = activeMeal();
    const id = recordIdentity(record).replace(/[^A-Za-z0-9_-]/g, '-');
    setBusy(`refresh-${id}`);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.refreshExternalEvent({
          mealId: current.id,
          expectedRevision: current.revision,
          record,
        }),
      locale,
    );
    setBusy(undefined);
    setNotice(
      result.ok
        ? {tone: 'success', message: copy.refreshed}
        : {tone: 'error', message: result.message},
    );
  };

  const linkedOwner = (
    candidate: MealExternalCandidate,
  ): MealSnapshot | undefined =>
    workspace
      .getListSnapshot({includeTrashed: false, limit: 500})
      .items.find(
        item =>
          item.id !== meal.id &&
          item.externalLinks.some(
            link => link.record.recordKey === candidate.record.recordKey,
          ),
      );

  const chooseLinkAction = (
    candidate: MealExternalCandidate,
    purpose: CarbPurpose | SupportingTreatmentPurpose,
  ): void => {
    const source = linkedOwner(candidate);
    if (source === undefined) {
      linkCandidate(candidate, purpose).catch(() => undefined);
      return;
    }
    setPendingTransfer({candidate, purpose, source});
    setNotice(undefined);
  };

  const confirmTransfer = async (): Promise<void> => {
    if (pendingTransfer === undefined) {
      return;
    }
    const destination = activeMeal();
    const source =
      workspace.getSnapshot(pendingTransfer.source.id) ??
      pendingTransfer.source;
    const {candidate, purpose} = pendingTransfer;
    const id = testIdentity(candidate);
    setBusy(`transfer-${id}`);
    const result = await runPresentedJournalAction(
      () =>
        candidate.kind === 'carbohydrate'
          ? workspace.transferExternalEvent({
              mealId: destination.id,
              expectedRevision: destination.revision,
              sourceMealId: source.id,
              sourceExpectedRevision: source.revision,
              confirmed: true,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'reported_carbohydrate',
                purpose: purpose as CarbPurpose,
              },
            })
          : workspace.transferExternalEvent({
              mealId: destination.id,
              expectedRevision: destination.revision,
              sourceMealId: source.id,
              sourceExpectedRevision: source.revision,
              confirmed: true,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'supporting_treatment',
                purpose: purpose as SupportingTreatmentPurpose,
              },
            }),
      locale,
    );
    setBusy(undefined);
    setPendingTransfer(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setUndoTransfer(result.value.undo);
    setNotice({tone: 'success', message: copy.moved});
  };

  const undoLastTransfer = async (): Promise<void> => {
    if (undoTransfer === undefined) {
      return;
    }
    setBusy('undo-transfer');
    const result = await runPresentedJournalAction(
      () => workspace.undoExternalEventTransfer(undoTransfer),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setUndoTransfer(undefined);
    setNotice({tone: 'success', message: copy.undone});
  };

  const resolve = async (
    conflict: MealConflictInspection,
    decision: JournalConflictDecision,
  ): Promise<void> => {
    const current = activeMeal();
    setBusy(`conflict-${conflict.conflictId}`);
    const result = await runPresentedJournalAction(
      () =>
        workspace.resolveConflict({
          mealId: current.id,
          conflictId: conflict.conflictId,
          expectedRevision: current.revision,
          decision,
        }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      await loadConflicts();
      return;
    }
    setEditing(false);
    setEditSource(result.value);
    setDraft(mealDraftFromSnapshot(result.value));
    setExpectedRevision(result.value.revision);
    setNotice({tone: 'success', message: copy.conflictResolved});
    await loadConflicts();
  };

  const linkedKeys = useMemo(
    () => new Set(meal.externalLinks.map(link => link.record.recordKey)),
    [meal.externalLinks],
  );

  return (
    <View style={styles.detail} testID="meal-detail">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtlText]}>
            {meal.name ?? copy.details}
          </Text>
          <Text style={[styles.time, rtl && styles.rtlText]}>
            {formatTime(meal.mealStart)}
          </Text>
        </View>
        <JournalButton
          label={copy.close}
          onPress={onClose}
          testID="meal-close-detail"
          tone="quiet"
        />
      </View>

      {notice ? (
        <JournalNotice
          locale={locale}
          message={notice.message}
          tone={notice.tone}
          testID="meal-action-notice"
        />
      ) : null}
      {undoTransfer === undefined ? null : (
        <JournalButton
          disabled={busy !== undefined}
          label={copy.undo}
          onPress={undoLastTransfer}
          testID="meal-undo-transfer"
          tone="secondary"
        />
      )}

      {conflicts.length > 0 ? (
        <View style={styles.conflict} testID="meal-conflict-panel">
          <Text style={[styles.sectionTitle, rtl && styles.rtlText]}>
            {copy.conflicts}
          </Text>
          <Text style={[styles.body, rtl && styles.rtlText]}>
            {copy.conflictHelp}
          </Text>
          {conflicts.map(conflict => (
            <View key={conflict.conflictId} style={styles.conflictItem}>
              <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                {copy.conflictFields(conflict.conflictingFields)}
              </Text>
              <JournalFormActions locale={locale}>
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.keepCurrent}
                  onPress={() => resolve(conflict, 'keep_current')}
                  testID={`meal-conflict-${conflict.conflictId}-keep`}
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.applyProposed}
                  onPress={() => resolve(conflict, 'apply_proposed')}
                  testID={`meal-conflict-${conflict.conflictId}-apply`}
                  tone="primary"
                />
              </JournalFormActions>
            </View>
          ))}
        </View>
      ) : null}

      {editing ? (
        <MealEditor
          busy={busy === 'save'}
          draft={draft}
          locale={locale}
          mode="edit"
          onCancel={() => {
            setEditing(false);
            setNotice(undefined);
          }}
          onChange={setDraft}
          onSave={save}
          {...(imagesRuntime === undefined ? {} : {imagesRuntime})}
          {...(editSource.image === undefined
            ? {}
            : {existingImage: editSource.image})}
        />
      ) : (
        <>
          <View style={styles.facts}>
            {meal.image !== undefined ? (
              <View style={styles.imageBlock}>
                <Text style={[styles.label, rtl && styles.rtlText]}>
                  {copy.image}
                </Text>
                <MealImagePreview
                  image={meal.image}
                  {...(imagesRuntime === undefined
                    ? {}
                    : {runtime: imagesRuntime})}
                  testID={`meal-detail-image-${meal.id}`}
                />
              </View>
            ) : null}
            <Text style={[styles.fact, rtl && styles.rtlText]}>
              {meal.mealCarbohydrates === undefined
                ? copy.noMealCarbs
                : copy.mealCarbs(meal.mealCarbohydrates.grams)}
            </Text>
            <Text style={[styles.reportedFact, rtl && styles.rtlText]}>
              {meal.reportedCarbohydrates === undefined
                ? copy.noReportedCarbs
                : copy.reportedCarbs(
                    meal.reportedCarbohydrates.totalGrams,
                    meal.reportedCarbohydrates.componentCount,
                  )}
            </Text>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.notes}
            </Text>
            <Text style={[styles.body, rtl && styles.rtlText]}>
              {meal.notes ?? copy.noNotes}
            </Text>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.tags}
            </Text>
            <Text style={[styles.body, rtl && styles.rtlText]}>
              {meal.tags.length === 0 ? copy.noTags : meal.tags.join(' · ')}
            </Text>
          </View>
          {outcomeDataSource === undefined ? null : (
            <EventOutcomeCard
              {...(comparableMeals === undefined ? {} : {comparableMeals})}
              dataSource={outcomeDataSource}
              {...(outcomeExpectedSampleIntervalMs === undefined
                ? {}
                : {
                    expectedSampleIntervalMs:
                      outcomeExpectedSampleIntervalMs,
                  })}
              locale={locale}
              subject={{
                kind: 'meal',
                id: meal.id,
                startedAtMs: meal.mealStart,
              }}
            />
          )}
          <JournalFormActions locale={locale}>
            {meal.lifecycle.kind === 'active' ? (
              <>
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.edit}
                  onPress={beginEditing}
                  testID={`meal-edit-${meal.id}`}
                  tone="primary"
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.trash}
                  onPress={() => changeLifecycle('trash')}
                  testID={`meal-trash-${meal.id}`}
                  tone="danger"
                />
              </>
            ) : (
              <JournalButton
                disabled={busy !== undefined}
                label={copy.restore}
                onPress={() => changeLifecycle('restore')}
                testID={`meal-restore-${meal.id}`}
                tone="primary"
              />
            )}
          </JournalFormActions>
        </>
      )}

      <View style={styles.linksSection}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, rtl && styles.rtlText]}>
          {copy.linksTitle}
        </Text>
        <Text style={[styles.body, rtl && styles.rtlText]}>
          {copy.linksReadOnly}
        </Text>
        {meal.externalLinks.map(link => {
          const id = recordIdentity(link.record).replace(
            /[^A-Za-z0-9_-]/g,
            '-',
          );
          const snapshot =
            link.external.kind === 'available'
              ? link.external.snapshot
              : link.external.lastKnown;
          const label =
            link.role.kind === 'reported_carbohydrate'
              ? copy.candidateCarb(
                  snapshot?.kind === 'carbohydrate'
                    ? snapshot.carbohydratesGrams
                    : 0,
                )
              : copy.candidateTreatment(
                  snapshot?.kind === 'treatment'
                    ? snapshot.insulinUnits
                    : undefined,
                );
          return (
            <View
              key={link.record.recordKey}
              style={[styles.linkItem, rtl && styles.rowReverse]}>
              <View style={styles.linkText}>
                <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                  {label}
                </Text>
                <Text style={[styles.meta, rtl && styles.rtlText]}>
                  {recordIdentity(link.record)}
                  {link.external.kind === 'unavailable'
                    ? ` · ${copy.unavailable}`
                    : ''}
                </Text>
              </View>
              <JournalFormActions locale={locale}>
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.refresh}
                  onPress={() => refreshLink(link.record)}
                  testID={`meal-refresh-${id}`}
                  tone="secondary"
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.unlink}
                  onPress={() => unlink(link.record)}
                  testID={`meal-unlink-${id}`}
                  tone="quiet"
                />
              </JournalFormActions>
            </View>
          );
        })}
        {candidateError ? (
          <JournalNotice locale={locale} message={candidateError} />
        ) : null}
        <JournalButton
          disabled={busy !== undefined || meal.lifecycle.kind === 'trashed'}
          label={busy === 'find' ? copy.findingLinks : copy.findLinks}
          onPress={findCandidates}
          testID={`meal-find-links-${meal.id}`}
        />
        {candidates !== undefined && candidates.length === 0 ? (
          <Text style={[styles.meta, rtl && styles.rtlText]}>
            {copy.noCandidates}
          </Text>
        ) : null}
        {candidates
          ?.filter(candidate => !linkedKeys.has(candidate.record.recordKey))
          .map(candidate => {
            const id = testIdentity(candidate);
            const owner = linkedOwner(candidate);
            const transferPending =
              pendingTransfer?.candidate.record.recordKey ===
              candidate.record.recordKey;
            return (
              <View key={candidate.record.recordKey} style={styles.candidate}>
                <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                  {candidate.kind === 'carbohydrate'
                    ? copy.candidateCarb(candidate.snapshot.carbohydratesGrams)
                    : copy.candidateTreatment(candidate.snapshot.insulinUnits)}
                </Text>
                <Text style={[styles.meta, rtl && styles.rtlText]}>
                  {formatTime(
                    candidate.kind === 'carbohydrate'
                      ? candidate.snapshot.externalCarbTime
                      : candidate.snapshot.treatmentTime,
                  )}{' '}
                  · {candidate.reason}
                </Text>
                <JournalFormActions locale={locale}>
                  {candidate.kind === 'carbohydrate' ? (
                    <>
                      {(['meal', 'low_treatment', 'unknown'] as const).map(
                        purpose => (
                          <JournalButton
                            disabled={busy !== undefined}
                            key={purpose}
                            label={
                              owner === undefined
                                ? copy.purposes[purpose]
                                : copy.moveAs(copy.purposes[purpose])
                            }
                            onPress={() =>
                              chooseLinkAction(candidate, purpose)
                            }
                            testID={`meal-link-${id}-${
                              purpose === 'low_treatment' ? 'low' : purpose
                            }`}
                            tone={purpose === 'meal' ? 'primary' : 'secondary'}
                          />
                        ),
                      )}
                    </>
                  ) : (
                    <>
                      {(['bolus', 'correction', 'other'] as const).map(
                        purpose => (
                          <JournalButton
                            disabled={busy !== undefined}
                            key={purpose}
                            label={
                              owner === undefined
                                ? copy.purposes[purpose]
                                : copy.moveAs(copy.purposes[purpose])
                            }
                            onPress={() =>
                              chooseLinkAction(candidate, purpose)
                            }
                            testID={`meal-link-${id}-${purpose}`}
                          />
                        ),
                      )}
                    </>
                  )}
                </JournalFormActions>
                {transferPending && owner !== undefined ? (
                  <View
                    style={styles.transferConfirmation}
                    testID={`meal-transfer-confirmation-${id}`}>
                    <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                      {copy.confirmMove(owner.name ?? copy.details)}
                    </Text>
                    <JournalFormActions locale={locale}>
                      <JournalButton
                        disabled={busy !== undefined}
                        label={copy.confirm}
                        onPress={confirmTransfer}
                        testID={`meal-transfer-confirm-${id}`}
                        tone="primary"
                      />
                      <JournalButton
                        disabled={busy !== undefined}
                        label={copy.cancel}
                        onPress={() => setPendingTransfer(undefined)}
                        testID={`meal-transfer-cancel-${id}`}
                        tone="quiet"
                      />
                    </JournalFormActions>
                  </View>
                ) : null}
              </View>
            );
          })}
      </View>
    </View>
  );
};

export const presentMealFormFailure = (
  reason: MealFormFailure,
  locale: MealsLocale,
): string => COPY[locale][reason];

const styles = StyleSheet.create({
  detail: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD4E6',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  titleBlock: {flex: 1},
  title: {color: '#17202A', fontSize: 23, fontWeight: '800', lineHeight: 30},
  time: {color: '#5C6875', fontSize: 14, marginTop: 3},
  facts: {marginBottom: 10},
  imageBlock: {marginBottom: 10},
  fact: {color: '#17202A', fontSize: 17, fontWeight: '700', lineHeight: 24},
  reportedFact: {
    color: '#355268',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 12,
  },
  label: {color: '#526170', fontSize: 12, fontWeight: '800', marginTop: 9},
  body: {color: '#425466', fontSize: 14, lineHeight: 21},
  bodyStrong: {
    color: '#253444',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  meta: {color: '#6B7785', fontSize: 12, lineHeight: 18},
  linksSection: {
    borderTopColor: '#E1E7EC',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 16,
  },
  sectionTitle: {
    color: '#17202A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 5,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: '#E8EDF1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  linkText: {flex: 1, marginEnd: 8},
  candidate: {
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    marginTop: 10,
    padding: 12,
  },
  transferConfirmation: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  conflict: {
    backgroundColor: '#FFF3E1',
    borderColor: '#E6B35A',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 14,
    padding: 12,
  },
  conflictItem: {marginTop: 10},
});
