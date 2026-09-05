import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  ActivitiesWorkspace,
  ActivityConflictInspection,
  ActivityExternalCandidate,
  ActivityExternalTransferUndoReceipt,
  ActivitySnapshot,
  JournalConflictDecision,
  SupportingTreatmentPurpose,
} from '../../modules/journal';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import {
  JournalButton,
  JournalFormActions,
  JournalNotice,
  runPresentedJournalAction,
} from '../journal';
import {ActivityEditor} from './ActivityEditor';
import {EventOutcomeCard} from '../eventOutcomes';
import {activityDraftFromSnapshot, buildActivityRevision} from './formModel';
import type {ActivityDraft, ActivityFormFailure} from './formModel';
import {selectActivityCard} from './selectors';
import type {ActivitiesLocale} from './selectors';

const COPY = {
  en: {
    details: 'Activity details',
    edit: 'Edit',
    close: 'Close details',
    finish: 'Finish now',
    finishing: 'Finishing…',
    trash: 'Move to Trash',
    restore: 'Restore',
    saved: 'Activity saved on this device.',
    finished: 'Activity finished.',
    trashed: 'Activity moved to Trash. It can be restored for 30 days.',
    restored: 'Activity restored.',
    ongoing: 'In progress',
    completed: 'Completed',
    duration: (minutes: number) => `${minutes} minutes`,
    intensity: 'Intensity',
    noIntensity: 'Not recorded',
    notes: 'Notes',
    noNotes: 'No notes',
    tags: 'Tags',
    noTags: 'No tags',
    linksTitle: 'Nightscout links',
    linksReadOnly:
      'Links are read-only and explicit. ShaniDms never edits Nightscout or links by proximity alone.',
    findLinks: 'Find records near this activity',
    findingLinks: 'Looking in Nightscout…',
    noCandidates: 'No linkable records were found in this time window.',
    candidateActivity: 'Activity record',
    candidateTreatment: (units: number | undefined) =>
      units === undefined ? 'Treatment record' : `${units} U treatment record`,
    linkActivity: 'Link activity record',
    linkBolus: 'Link as bolus context',
    linkCorrection: 'Link as correction context',
    linkOther: 'Link as other treatment',
    unlink: 'Unlink',
    linked: 'Record linked locally.',
    unlinked: 'Record unlinked locally. Nightscout was not changed.',
    refresh: 'Refresh link',
    refreshed: 'Linked facts refreshed from Nightscout.',
    moveAs: (label: string) => `Move here · ${label}`,
    confirmMove: (source: string) =>
      `Move this read-only link from “${source}” to this activity?`,
    confirm: 'Confirm move',
    cancel: 'Cancel',
    moved: 'Link moved between activities. Nightscout was not changed.',
    undo: 'Undo link move',
    undone: 'Link move undone.',
    unavailable: 'Last known record; Nightscout is unavailable.',
    conflicts: 'Concurrent edit needs a decision',
    conflictHelp:
      'Both versions are preserved. Choose the current version or apply the saved proposal.',
    conflictFields: (fields: readonly string[]) =>
      `Conflicting fields: ${fields.join(', ')}`,
    keepCurrent: 'Keep current',
    applyProposed: 'Apply other edit',
    conflictResolved: 'Conflict resolved.',
    invalid_start: 'Use a valid start in YYYY-MM-DD HH:mm format.',
    invalid_end: 'Use a valid end in YYYY-MM-DD HH:mm format.',
    time_order: 'The activity cannot end before it starts.',
    custom_name_required: 'Add a name for the Other activity type.',
    no_changes: 'Nothing changed.',
  },
  he: {
    details: 'פרטי הפעילות',
    edit: 'עריכה',
    close: 'סגירת הפרטים',
    finish: 'סיום עכשיו',
    finishing: 'מסיים…',
    trash: 'העברה לסל המחזור',
    restore: 'שחזור',
    saved: 'הפעילות נשמרה במכשיר.',
    finished: 'הפעילות הסתיימה.',
    trashed: 'הפעילות הועברה לסל המחזור. אפשר לשחזר אותה במשך 30 יום.',
    restored: 'הפעילות שוחזרה.',
    ongoing: 'בתהליך',
    completed: 'הסתיימה',
    duration: (minutes: number) => `${minutes} דקות`,
    intensity: 'עצימות',
    noIntensity: 'לא נרשמה',
    notes: 'הערות',
    noNotes: 'אין הערות',
    tags: 'תגיות',
    noTags: 'אין תגיות',
    linksTitle: 'קישורים ל־Nightscout',
    linksReadOnly:
      'הקישורים הם לקריאה בלבד ונוצרים רק בפעולה מפורשת. ShaniDms לא משנה את Nightscout ולא מקשר לפי קרבה בלבד.',
    findLinks: 'חיפוש רשומות ליד הפעילות',
    findingLinks: 'מחפש ב־Nightscout…',
    noCandidates: 'לא נמצאו רשומות שאפשר לקשר בחלון הזמן הזה.',
    candidateActivity: 'רשומת פעילות',
    candidateTreatment: (units: number | undefined) =>
      units === undefined ? 'רשומת טיפול' : `רשומת טיפול של ${units} יח׳`,
    linkActivity: 'קישור רשומת הפעילות',
    linkBolus: 'קישור כבולוס תומך',
    linkCorrection: 'קישור כתיקון תומך',
    linkOther: 'קישור כטיפול אחר',
    unlink: 'הסרת קישור',
    linked: 'הרשומה קושרה מקומית.',
    unlinked: 'הקישור המקומי הוסר. Nightscout לא השתנה.',
    refresh: 'רענון הקישור',
    refreshed: 'פרטי הקישור רועננו מ־Nightscout.',
    moveAs: (label: string) => `העברה לכאן · ${label}`,
    confirmMove: (source: string) =>
      `להעביר את הקישור לקריאה בלבד מ״${source}״ לפעילות הזו?`,
    confirm: 'אישור העברה',
    cancel: 'ביטול',
    moved: 'הקישור הועבר בין הפעילויות. Nightscout לא השתנה.',
    undo: 'ביטול העברת הקישור',
    undone: 'העברת הקישור בוטלה.',
    unavailable: 'הרשומה האחרונה הידועה; Nightscout לא זמין.',
    conflicts: 'עריכה מקבילה דורשת החלטה',
    conflictHelp:
      'שתי הגרסאות נשמרו. אפשר להשאיר את הגרסה הנוכחית או להחיל את ההצעה השמורה.',
    conflictFields: (fields: readonly string[]) =>
      `שדות מתנגשים: ${fields.join(', ')}`,
    keepCurrent: 'השארת הנוכחי',
    applyProposed: 'החלת העריכה השנייה',
    conflictResolved: 'ההתנגשות נפתרה.',
    invalid_start: 'צריך שעת התחלה תקינה בפורמט YYYY-MM-DD HH:mm.',
    invalid_end: 'צריך שעת סיום תקינה בפורמט YYYY-MM-DD HH:mm.',
    time_order: 'הפעילות לא יכולה להסתיים לפני שהתחילה.',
    custom_name_required: 'צריך לתת שם לפעילות מסוג אחר.',
    no_changes: 'לא השתנה דבר.',
  },
} as const;

type Notice = {readonly tone: 'error' | 'success'; readonly message: string};

type PendingActivityTransfer = {
  readonly candidate: ActivityExternalCandidate;
  readonly purpose?: SupportingTreatmentPurpose;
  readonly source: ActivitySnapshot;
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

const testIdentity = (candidate: ActivityExternalCandidate): string =>
  recordIdentity(candidate.record).replace(/[^A-Za-z0-9_-]/g, '-');

const intensityLabel = (
  intensity: ActivitySnapshot['intensity'],
  locale: ActivitiesLocale,
): string => {
  if (intensity === undefined) {
    return COPY[locale].noIntensity;
  }
  const labels =
    locale === 'he'
      ? {
          very_low: 'קלילה מאוד',
          low: 'קלילה',
          medium: 'בינונית',
          high: 'גבוהה',
          very_high: 'גבוהה מאוד',
        }
      : {
          very_low: 'Very light',
          low: 'Light',
          medium: 'Medium',
          high: 'High',
          very_high: 'Very high',
        };
  return labels[intensity];
};

export interface ActivityDetailProps {
  readonly activity: ActivitySnapshot;
  readonly workspace: ActivitiesWorkspace;
  readonly locale: ActivitiesLocale;
  readonly formatTime: (timestamp: number) => string;
  readonly now: () => number;
  readonly onClose: () => void;
  readonly outcomeDataSource?: DayGraphDataSource;
  readonly outcomeExpectedSampleIntervalMs?: number;
}

export const ActivityDetail = ({
  activity,
  workspace,
  locale,
  formatTime,
  now,
  onClose,
  outcomeDataSource,
  outcomeExpectedSampleIntervalMs,
}: ActivityDetailProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [editing, setEditing] = useState(false);
  const [editSource, setEditSource] = useState(activity);
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    activityDraftFromSnapshot(activity),
  );
  const [expectedRevision, setExpectedRevision] = useState(activity.revision);
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [candidates, setCandidates] = useState<
    readonly ActivityExternalCandidate[] | undefined
  >();
  const [candidateError, setCandidateError] = useState<string | undefined>();
  const [pendingTransfer, setPendingTransfer] =
    useState<PendingActivityTransfer>();
  const [undoTransfer, setUndoTransfer] =
    useState<ActivityExternalTransferUndoReceipt>();
  const [conflicts, setConflicts] = useState<
    readonly ActivityConflictInspection[]
  >([]);

  const currentActivity = (): ActivitySnapshot =>
    workspace.getSnapshot(activity.id) ?? activity;

  const loadConflicts = async (): Promise<void> => {
    const result = await runPresentedJournalAction(
      () => workspace.inspectConflicts(activity.id),
      locale,
    );
    if (result.ok) {
      setConflicts(result.value);
    } else {
      setNotice({tone: 'error', message: result.message});
    }
  };

  useEffect(() => {
    if (activity.syncState.kind === 'conflict') {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, activity.revision, activity.syncState.kind]);

  const beginEditing = (): void => {
    const current = currentActivity();
    setEditSource(current);
    setDraft(activityDraftFromSnapshot(current));
    setExpectedRevision(current.revision);
    setNotice(undefined);
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    const built = buildActivityRevision(editSource, expectedRevision, draft);
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
      setDraft(activityDraftFromSnapshot(result.value));
      setExpectedRevision(result.value.revision);
      setNotice({tone: 'success', message: copy.saved});
    } finally {
      setBusy(undefined);
    }
  };

  const finish = async (): Promise<void> => {
    const current = currentActivity();
    setBusy('finish');
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.finish({
          activityId: current.id,
          expectedRevision: current.revision,
          endedAt: Math.max(now(), current.startedAt),
        }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setNotice({tone: 'success', message: copy.finished});
  };

  const changeLifecycle = async (
    action: 'trash' | 'restore',
  ): Promise<void> => {
    const current = currentActivity();
    setBusy(action);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        action === 'trash'
          ? workspace.trash({
              activityId: current.id,
              expectedRevision: current.revision,
            })
          : workspace.restore({
              activityId: current.id,
              expectedRevision: current.revision,
            }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
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
          nearStartedAt: currentActivity().startedAt,
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
    candidate: ActivityExternalCandidate,
    purpose?: SupportingTreatmentPurpose,
  ): Promise<void> => {
    const current = currentActivity();
    setBusy(`link-${testIdentity(candidate)}`);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        candidate.kind === 'activity'
          ? workspace.linkExternalEvent({
              activityId: current.id,
              expectedRevision: current.revision,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {kind: 'activity'},
            })
          : workspace.linkExternalEvent({
              activityId: current.id,
              expectedRevision: current.revision,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'supporting_treatment',
                purpose: purpose ?? 'other',
              },
            }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setNotice({tone: 'success', message: copy.linked});
  };

  const unlink = async (
    record: ActivitySnapshot['externalLinks'][number]['record'],
  ): Promise<void> => {
    const current = currentActivity();
    const id = recordIdentity(record).replace(/[^A-Za-z0-9_-]/g, '-');
    setBusy(`unlink-${id}`);
    const result = await runPresentedJournalAction(
      () =>
        workspace.unlinkExternalEvent({
          activityId: current.id,
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
    record: ActivitySnapshot['externalLinks'][number]['record'],
  ): Promise<void> => {
    const current = currentActivity();
    const id = recordIdentity(record).replace(/[^A-Za-z0-9_-]/g, '-');
    setBusy(`refresh-${id}`);
    setNotice(undefined);
    const result = await runPresentedJournalAction(
      () =>
        workspace.refreshExternalEvent({
          activityId: current.id,
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
    candidate: ActivityExternalCandidate,
  ): ActivitySnapshot | undefined =>
    workspace
      .getListSnapshot({includeTrashed: false, limit: 500})
      .items.find(
        item =>
          item.id !== activity.id &&
          item.externalLinks.some(
            link => link.record.recordKey === candidate.record.recordKey,
          ),
      );

  const chooseLinkAction = (
    candidate: ActivityExternalCandidate,
    purpose?: SupportingTreatmentPurpose,
  ): void => {
    const source = linkedOwner(candidate);
    if (source === undefined) {
      linkCandidate(candidate, purpose).catch(() => undefined);
      return;
    }
    setPendingTransfer({
      candidate,
      source,
      ...(purpose === undefined ? {} : {purpose}),
    });
    setNotice(undefined);
  };

  const confirmTransfer = async (): Promise<void> => {
    if (pendingTransfer === undefined) {
      return;
    }
    const destination = currentActivity();
    const source =
      workspace.getSnapshot(pendingTransfer.source.id) ??
      pendingTransfer.source;
    const {candidate} = pendingTransfer;
    const id = testIdentity(candidate);
    setBusy(`transfer-${id}`);
    const result = await runPresentedJournalAction(
      () =>
        candidate.kind === 'activity'
          ? workspace.transferExternalEvent({
              activityId: destination.id,
              expectedRevision: destination.revision,
              sourceActivityId: source.id,
              sourceExpectedRevision: source.revision,
              confirmed: true,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {kind: 'activity'},
            })
          : workspace.transferExternalEvent({
              activityId: destination.id,
              expectedRevision: destination.revision,
              sourceActivityId: source.id,
              sourceExpectedRevision: source.revision,
              confirmed: true,
              record: candidate.record,
              snapshot: candidate.snapshot,
              role: {
                kind: 'supporting_treatment',
                purpose: pendingTransfer.purpose ?? 'other',
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
    conflict: ActivityConflictInspection,
    decision: JournalConflictDecision,
  ): Promise<void> => {
    const current = currentActivity();
    setBusy(`conflict-${conflict.conflictId}`);
    const result = await runPresentedJournalAction(
      () =>
        workspace.resolveConflict({
          activityId: current.id,
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
    setDraft(activityDraftFromSnapshot(result.value));
    setExpectedRevision(result.value.revision);
    setNotice({tone: 'success', message: copy.conflictResolved});
    await loadConflicts();
  };

  const linkedKeys = useMemo(
    () => new Set(activity.externalLinks.map(link => link.record.recordKey)),
    [activity.externalLinks],
  );
  const minutes = Math.max(
    0,
    Math.round(
      ((activity.endedAt ?? Math.max(now(), activity.startedAt)) -
        activity.startedAt) /
        60_000,
    ),
  );
  const activityTitle = selectActivityCard(
    activity,
    locale,
    formatTime,
    now(),
  ).title;

  return (
    <View style={styles.detail} testID="activity-detail">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.title, rtl && styles.rtlText]}>
            {activityTitle}
          </Text>
          <Text style={[styles.time, rtl && styles.rtlText]}>
            {formatTime(activity.startedAt)} ·{' '}
            {activity.endedAt === undefined ? copy.ongoing : copy.completed}
          </Text>
        </View>
        <JournalButton
          label={copy.close}
          onPress={onClose}
          testID="activity-close-detail"
          tone="quiet"
        />
      </View>

      {notice ? (
        <JournalNotice
          locale={locale}
          message={notice.message}
          tone={notice.tone}
          testID="activity-action-notice"
        />
      ) : null}
      {undoTransfer === undefined ? null : (
        <JournalButton
          disabled={busy !== undefined}
          label={copy.undo}
          onPress={undoLastTransfer}
          testID="activity-undo-transfer"
          tone="secondary"
        />
      )}

      {conflicts.length > 0 ? (
        <View style={styles.conflict} testID="activity-conflict-panel">
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
                  testID={`activity-conflict-${conflict.conflictId}-keep`}
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.applyProposed}
                  onPress={() => resolve(conflict, 'apply_proposed')}
                  testID={`activity-conflict-${conflict.conflictId}-apply`}
                  tone="primary"
                />
              </JournalFormActions>
            </View>
          ))}
        </View>
      ) : null}

      {editing ? (
        <ActivityEditor
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
        />
      ) : (
        <>
          <View style={styles.facts}>
            <Text style={[styles.fact, rtl && styles.rtlText]}>
              {copy.duration(minutes)}
            </Text>
            <Text style={[styles.body, rtl && styles.rtlText]}>
              {copy.intensity}: {intensityLabel(activity.intensity, locale)}
            </Text>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.notes}
            </Text>
            <Text style={[styles.body, rtl && styles.rtlText]}>
              {activity.notes ?? copy.noNotes}
            </Text>
            <Text style={[styles.label, rtl && styles.rtlText]}>
              {copy.tags}
            </Text>
            <Text style={[styles.body, rtl && styles.rtlText]}>
              {activity.tags.length === 0
                ? copy.noTags
                : activity.tags.join(' · ')}
            </Text>
          </View>
          {outcomeDataSource === undefined ? null : (
            <EventOutcomeCard
              dataSource={outcomeDataSource}
              {...(outcomeExpectedSampleIntervalMs === undefined
                ? {}
                : {
                    expectedSampleIntervalMs:
                      outcomeExpectedSampleIntervalMs,
                  })}
              locale={locale}
              subject={{
                kind: 'activity',
                id: activity.id,
                startedAtMs: activity.startedAt,
                ...(activity.endedAt === undefined
                  ? {}
                  : {endedAtMs: activity.endedAt}),
              }}
            />
          )}
          <JournalFormActions locale={locale}>
            {activity.lifecycle.kind === 'active' ? (
              <>
                {activity.endedAt === undefined ? (
                  <JournalButton
                    disabled={busy !== undefined}
                    label={busy === 'finish' ? copy.finishing : copy.finish}
                    onPress={finish}
                    testID={`activity-finish-${activity.id}`}
                    tone="primary"
                  />
                ) : null}
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.edit}
                  onPress={beginEditing}
                  testID={`activity-edit-${activity.id}`}
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.trash}
                  onPress={() => changeLifecycle('trash')}
                  testID={`activity-trash-${activity.id}`}
                  tone="danger"
                />
              </>
            ) : (
              <JournalButton
                disabled={busy !== undefined}
                label={copy.restore}
                onPress={() => changeLifecycle('restore')}
                testID={`activity-restore-${activity.id}`}
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
        {activity.externalLinks.map(link => {
          const id = recordIdentity(link.record).replace(
            /[^A-Za-z0-9_-]/g,
            '-',
          );
          const snapshot =
            link.external.kind === 'available'
              ? link.external.snapshot
              : link.external.lastKnown;
          return (
            <View
              key={link.record.recordKey}
              style={[styles.linkItem, rtl && styles.rowReverse]}>
              <View style={styles.linkText}>
                <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                  {link.role.kind === 'activity'
                    ? copy.candidateActivity
                    : copy.candidateTreatment(
                        snapshot?.kind === 'treatment'
                          ? snapshot.insulinUnits
                          : undefined,
                      )}
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
                  testID={`activity-refresh-${id}`}
                  tone="secondary"
                />
                <JournalButton
                  disabled={busy !== undefined}
                  label={copy.unlink}
                  onPress={() => unlink(link.record)}
                  testID={`activity-unlink-${id}`}
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
          disabled={busy !== undefined || activity.lifecycle.kind === 'trashed'}
          label={busy === 'find' ? copy.findingLinks : copy.findLinks}
          onPress={findCandidates}
          testID={`activity-find-links-${activity.id}`}
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
            const eventTime =
              candidate.kind === 'activity'
                ? candidate.snapshot.startedAt
                : candidate.snapshot.treatmentTime;
            return (
              <View key={candidate.record.recordKey} style={styles.candidate}>
                <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                  {candidate.kind === 'activity'
                    ? copy.candidateActivity
                    : copy.candidateTreatment(candidate.snapshot.insulinUnits)}
                </Text>
                <Text style={[styles.meta, rtl && styles.rtlText]}>
                  {formatTime(eventTime)} · {candidate.reason}
                </Text>
                <JournalFormActions locale={locale}>
                  {candidate.kind === 'activity' ? (
                    <JournalButton
                      disabled={busy !== undefined}
                      label={
                        owner === undefined
                          ? copy.linkActivity
                          : copy.moveAs(copy.linkActivity)
                      }
                      onPress={() => chooseLinkAction(candidate)}
                      testID={`activity-link-${id}`}
                      tone="primary"
                    />
                  ) : (
                    <>
                      {(['bolus', 'correction', 'other'] as const).map(
                        purpose => (
                          <JournalButton
                            disabled={busy !== undefined}
                            key={purpose}
                            label={owner === undefined ? (
                              purpose === 'bolus'
                                ? copy.linkBolus
                                : purpose === 'correction'
                                ? copy.linkCorrection
                                : copy.linkOther
                            ) : copy.moveAs(
                              purpose === 'bolus'
                                ? copy.linkBolus
                                : purpose === 'correction'
                                ? copy.linkCorrection
                                : copy.linkOther,
                            )}
                            onPress={() => chooseLinkAction(candidate, purpose)}
                            testID={`activity-link-${id}-${purpose}`}
                          />
                        ),
                      )}
                    </>
                  )}
                </JournalFormActions>
                {transferPending && owner !== undefined ? (
                  <View
                    style={styles.transferConfirmation}
                    testID={`activity-transfer-confirmation-${id}`}>
                    <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                      {copy.confirmMove(
                        owner.customName ?? copy.candidateActivity,
                      )}
                    </Text>
                    <JournalFormActions locale={locale}>
                      <JournalButton
                        disabled={busy !== undefined}
                        label={copy.confirm}
                        onPress={confirmTransfer}
                        testID={`activity-transfer-confirm-${id}`}
                        tone="primary"
                      />
                      <JournalButton
                        disabled={busy !== undefined}
                        label={copy.cancel}
                        onPress={() => setPendingTransfer(undefined)}
                        testID={`activity-transfer-cancel-${id}`}
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

export const presentActivityFormFailure = (
  reason: ActivityFormFailure,
  locale: ActivitiesLocale,
): string => COPY[locale][reason];

const styles = StyleSheet.create({
  detail: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD9D0',
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
  fact: {color: '#17202A', fontSize: 17, fontWeight: '700', lineHeight: 24},
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
    backgroundColor: '#F5FAF8',
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
