import React, {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type {ActivitiesWorkspace, ActivityEntryId} from '../../modules/journal';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import {
  JournalButton,
  JournalFormActions,
  JournalNotice,
  runPresentedJournalAction,
} from '../journal';
import {useRefreshingNow} from '../time';
import {ActivityDetail, presentActivityFormFailure} from './ActivityDetail';
import {ActivityEditor} from './ActivityEditor';
import {buildActivityCapture, emptyActivityDraft} from './formModel';
import type {ActivityDraft} from './formModel';
import type {ActivitiesLocale, ActivityCardViewModel} from './selectors';
import {selectActivityCards} from './selectors';

const COPY = {
  en: {
    title: 'Activity',
    subtitle:
      'Record activity locally, including ongoing sessions, then add explicit read-only context.',
    add: 'Add activity',
    active: 'Activities',
    trash: 'Trash',
    empty: 'No activities yet. You can start one without a connection.',
    emptyTrash: 'Trash is empty.',
    loadMore: 'Load more',
    open: 'Open details',
    finish: 'Finish now',
    finishing: 'Finishing…',
    saved: 'Activity saved locally. Sync can happen later.',
    finished: 'Activity finished.',
    createTitle: 'New activity',
    syncingHint: 'Local changes stay available while sync is pending.',
    concurrentTitle: 'More than one activity is in progress',
    concurrentHelp:
      'This can happen when devices were offline. Choose the activity that should remain ongoing; the others will end now.',
    keep: (title: string) => `Keep ${title} ongoing`,
    resolved: 'Ongoing activities resolved.',
  },
  he: {
    title: 'פעילות',
    subtitle:
      'רושמים פעילות מקומית, גם כשהיא עדיין בתהליך, ואז מוסיפים הקשר מפורש לקריאה בלבד.',
    add: 'הוספת פעילות',
    active: 'פעילויות',
    trash: 'סל מחזור',
    empty: 'עדיין אין פעילויות. אפשר להתחיל גם ללא חיבור.',
    emptyTrash: 'סל המחזור ריק.',
    loadMore: 'טעינת עוד',
    open: 'פתיחת פרטים',
    finish: 'סיום עכשיו',
    finishing: 'מסיים…',
    saved: 'הפעילות נשמרה מקומית. הסנכרון יכול להתבצע אחר כך.',
    finished: 'הפעילות הסתיימה.',
    createTitle: 'פעילות חדשה',
    syncingHint: 'שינויים מקומיים נשארים זמינים גם כשהסנכרון ממתין.',
    concurrentTitle: 'יש יותר מפעילות אחת בתהליך',
    concurrentHelp:
      'זה יכול לקרות כשמכשירים היו ללא חיבור. בוחרים איזו פעילות תישאר בתהליך, והאחרות יסתיימו עכשיו.',
    keep: (title: string) => `להשאיר את ${title} בתהליך`,
    resolved: 'הפעילויות שבתהליך הוסדרו.',
  },
} as const;

const PAGE_SIZE = 40;

export interface ActivitiesViewProps {
  readonly workspace: ActivitiesWorkspace;
  readonly locale: ActivitiesLocale;
  readonly now?: () => number;
  readonly formatTime?: (timestamp: number) => string;
  /** Transient journal-entry navigation focus; never persisted by this Module. */
  readonly focusedActivityId?: ActivityEntryId;
  readonly onOpenActivity?: (activityId: ActivityEntryId) => void;
  readonly outcomeDataSource?: DayGraphDataSource;
  readonly outcomeExpectedSampleIntervalMs?: number;
}

const defaultFormatTime =
  (locale: ActivitiesLocale) =>
  (timestamp: number): string =>
    new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));

const ActivityCard = ({
  model,
  locale,
  openLabel,
  finishLabel,
  finishingLabel,
  finishing,
  onOpen,
  onFinish,
}: {
  readonly model: ActivityCardViewModel;
  readonly locale: ActivitiesLocale;
  readonly openLabel: string;
  readonly finishLabel: string;
  readonly finishingLabel: string;
  readonly finishing: boolean;
  readonly onOpen: () => void;
  readonly onFinish: () => void;
}) => {
  const rtl = locale === 'he';
  return (
    <View style={styles.card} testID={`activity-card-${model.id}`}>
      <View style={[styles.cardHeader, rtl && styles.rowReverse]}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
            {model.title}
          </Text>
          <Text style={[styles.time, rtl && styles.rtlText]}>
            {model.timeLabel} · {model.stateLabel}
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
      {model.durationLabel ? (
        <Text style={[styles.fact, rtl && styles.rtlText]}>
          {model.durationLabel}
        </Text>
      ) : null}
      {model.intensityLabel ? (
        <Text style={[styles.secondary, rtl && styles.rtlText]}>
          {model.intensityLabel}
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
      <JournalFormActions locale={locale}>
        {model.ongoing ? (
          <JournalButton
            disabled={finishing}
            label={finishing ? finishingLabel : finishLabel}
            onPress={onFinish}
            testID={`activity-finish-card-${model.id}`}
            tone="primary"
          />
        ) : null}
        <JournalButton
          label={openLabel}
          onPress={onOpen}
          testID={`activity-open-${model.id}`}
          tone="quiet"
        />
      </JournalFormActions>
    </View>
  );
};

export const ActivitiesView = ({
  workspace,
  locale,
  now = Date.now,
  formatTime,
  focusedActivityId,
  onOpenActivity,
  outcomeDataSource,
  outcomeExpectedSampleIntervalMs,
}: ActivitiesViewProps) => {
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
  const hasOngoing = page.items.some(
    activity =>
      activity.lifecycle.kind === 'active' && activity.endedAt === undefined,
  );
  const displayNow = useRefreshingNow({active: hasOngoing, now});
  const visibleActivities = useMemo(
    () =>
      page.items.filter(activity =>
        showTrash
          ? activity.lifecycle.kind === 'trashed'
          : activity.lifecycle.kind === 'active',
      ),
    [page.items, showTrash],
  );
  const cards = useMemo(
    () => selectActivityCards(visibleActivities, locale, formatter, displayNow),
    [displayNow, formatter, locale, visibleActivities],
  );
  const ongoing = useMemo(
    () =>
      page.items.filter(
        activity =>
          activity.lifecycle.kind === 'active' &&
          activity.endedAt === undefined,
      ),
    [page.items],
  );
  const [selectedId, setSelectedId] = useState<ActivityEntryId | undefined>(
    focusedActivityId,
  );
  const selected =
    selectedId === undefined ? undefined : workspace.getSnapshot(selectedId);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    emptyActivityDraft(now()),
  );
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<
    {readonly tone: 'error' | 'success'; readonly message: string} | undefined
  >();

  useEffect(() => {
    if (focusedActivityId !== undefined) {
      setSelectedId(focusedActivityId);
      const focused = workspace.getSnapshot(focusedActivityId);
      if (focused?.lifecycle.kind === 'trashed') {
        setShowTrash(true);
      }
    }
  }, [focusedActivityId, workspace]);

  const openCreate = (): void => {
    setDraft(emptyActivityDraft(now()));
    setNotice(undefined);
    setCreating(true);
  };

  const save = async (): Promise<void> => {
    const built = buildActivityCapture(draft);
    if (!built.ok) {
      setNotice({
        tone: 'error',
        message: presentActivityFormFailure(built.reason, locale),
      });
      return;
    }
    setBusy('save');
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
      setCreating(false);
      setShowTrash(false);
      setSelectedId(result.value.id);
      setNotice({tone: 'success', message: copy.saved});
    } finally {
      setBusy(undefined);
    }
  };

  const finish = async (model: ActivityCardViewModel): Promise<void> => {
    setBusy(`finish-${model.id}`);
    setNotice(undefined);
    const current = workspace.getSnapshot(model.id) ?? model.source;
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

  const resolveOngoing = async (
    keepOngoing: ActivityEntryId,
  ): Promise<void> => {
    const others = ongoing.filter(activity => activity.id !== keepOngoing);
    setBusy('resolve-ongoing');
    const result = await runPresentedJournalAction(
      () =>
        workspace.resolveOngoingActivities({
          keepOngoing,
          finish: others.map(activity => ({
            activityId: activity.id,
            expectedRevision: activity.revision,
            endedAt: Math.max(now(), activity.startedAt),
          })),
        }),
      locale,
    );
    setBusy(undefined);
    if (!result.ok) {
      setNotice({tone: 'error', message: result.message});
      return;
    }
    setNotice({tone: 'success', message: copy.resolved});
  };

  const openActivity = (activityId: ActivityEntryId): void => {
    setSelectedId(activityId);
    setCreating(false);
    setNotice(undefined);
    onOpenActivity?.(activityId);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      testID="activities-view">
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
          testID="activities-add-toggle"
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
          testID="activity-list-notice"
        />
      ) : null}

      {ongoing.length > 1 ? (
        <View style={styles.concurrent} testID="activity-ongoing-conflict">
          <Text
            accessibilityRole="header"
            style={[styles.concurrentTitle, rtl && styles.rtlText]}>
            {copy.concurrentTitle}
          </Text>
          <Text style={[styles.concurrentBody, rtl && styles.rtlText]}>
            {copy.concurrentHelp}
          </Text>
          <JournalFormActions locale={locale}>
            {ongoing.map(activity => {
              const title =
                selectActivityCards(
                  [activity],
                  locale,
                  formatter,
                  displayNow,
                )[0]?.title ?? activity.id;
              return (
                <JournalButton
                  disabled={busy !== undefined}
                  key={activity.id}
                  label={copy.keep(title)}
                  onPress={() => resolveOngoing(activity.id)}
                  testID={`activity-keep-ongoing-${activity.id}`}
                />
              );
            })}
          </JournalFormActions>
        </View>
      ) : null}

      {creating ? (
        <View style={styles.editorCard}>
          <Text
            accessibilityRole="header"
            style={[styles.editorTitle, rtl && styles.rtlText]}>
            {copy.createTitle}
          </Text>
          <ActivityEditor
            busy={busy === 'save'}
            draft={draft}
            locale={locale}
            mode="create"
            onCancel={() => {
              setCreating(false);
              setNotice(undefined);
            }}
            onChange={setDraft}
            onSave={save}
          />
        </View>
      ) : null}

      {selected ? (
        <ActivityDetail
          activity={selected}
          formatTime={formatter}
          locale={locale}
          now={now}
          onClose={() => setSelectedId(undefined)}
          workspace={workspace}
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
              ? 'הפעילות המבוקשת כבר אינה זמינה.'
              : 'The requested activity is no longer available.'
          }
          testID="activity-focus-not-found"
        />
      ) : null}

      <JournalFormActions locale={locale}>
        <JournalButton
          label={copy.active}
          onPress={() => setShowTrash(false)}
          testID="activities-show-active"
          tone={showTrash ? 'secondary' : 'primary'}
        />
        <JournalButton
          label={copy.trash}
          onPress={() => setShowTrash(true)}
          testID="activities-show-trash"
          tone={showTrash ? 'primary' : 'secondary'}
        />
      </JournalFormActions>

      {cards.length === 0 ? (
        <Text style={[styles.empty, rtl && styles.rtlText]}>
          {showTrash ? copy.emptyTrash : copy.empty}
        </Text>
      ) : (
        <View style={[styles.grid, rtl && styles.rowReverse]}>
          {cards.map(card => (
            <View
              key={card.id}
              style={columns === 2 ? styles.halfColumn : styles.fullColumn}>
              <ActivityCard
                finishLabel={copy.finish}
                finishing={busy === `finish-${card.id}`}
                finishingLabel={copy.finishing}
                locale={locale}
                model={card}
                onFinish={() => finish(card)}
                onOpen={() => openActivity(card.id)}
                openLabel={copy.open}
              />
            </View>
          ))}
        </View>
      )}

      {page.nextCursor ? (
        <JournalButton
          label={copy.loadMore}
          onPress={() => setVisibleLimit(current => current + PAGE_SIZE)}
          testID="activities-load-more"
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
    color: '#35665B',
    backgroundColor: '#E7F4EF',
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    padding: 10,
  },
  concurrent: {
    backgroundColor: '#FFF3E1',
    borderColor: '#E6B35A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  concurrentTitle: {color: '#633C00', fontSize: 17, fontWeight: '800'},
  concurrentBody: {
    color: '#6A512D',
    fontSize: 14,
    lineHeight: 21,
    marginVertical: 6,
  },
  editorCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E5DF',
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
    minHeight: 205,
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE5EC',
    borderWidth: 1,
    borderRadius: 17,
    padding: 16,
    marginBottom: 14,
  },
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
  secondary: {color: '#556675', fontSize: 14, lineHeight: 20, marginTop: 3},
  tags: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 10},
  tag: {
    color: '#28715F',
    backgroundColor: '#E7F4EF',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginEnd: 6,
    marginBottom: 6,
  },
  empty: {color: '#5C6875', fontSize: 16, lineHeight: 24, paddingVertical: 30},
});
