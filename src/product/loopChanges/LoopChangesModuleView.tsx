import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  buildLoopChangeObservation,
  prepareLoopChangeHistory,
  type LoopChangeKind,
  type LoopChangeObservation,
  type LoopSettingChange,
  type LoopSettingValue,
} from '../../modules/loopChanges';
import type {TrendsPeriod} from '../../modules/trends';
import type {TrendsOverview} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {ProductPage, productUiTokens} from '../ui';
import type {LoopChangesModuleRuntime} from './runtime';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 90;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const HISTORY_DAY_OPTIONS = [30, 90, 180] as const;
type HistoryDays = (typeof HISTORY_DAY_OPTIONS)[number];
const OBSERVATION_DAY_OPTIONS = [7, 14, 30] as const;
type ObservationDays = (typeof OBSERVATION_DAY_OPTIONS)[number];

const COPY = {
  en: {
    title: 'Loop changes and impact',
    subtitle:
      'Review setting history and observed glucose before and after a change.',
    loading: 'Loading setting changes…',
    failed: 'Setting changes could not be loaded.',
    retry: 'Try again',
    empty: 'No setting changes were found in this period.',
    back: 'Back to change history',
    previous: 'Previous value',
    next: 'New value',
    unverified:
      'This source records that a change happened, but does not verify old or new values.',
    openGraph: 'Open the day graph',
    askAi: 'Ask the Loop advisor',
    advisoryBoundary:
      'The advisor may suggest what to review. It cannot change Loop settings.',
    scheduleSegments: 'schedule segments',
    setting: 'Setting',
    carbRatio: 'Carbohydrate ratio',
    isf: 'Insulin sensitivity',
    target: 'Glucose target',
    basal: 'Basal rate',
    dia: 'Insulin duration',
    other: 'Other setting',
    historyPeriod: 'Change history',
    days: 'days',
    compare: 'Compare observed periods',
    before: 'Before',
    after: 'After',
    coverage: 'coverage',
    readings: 'readings',
    observedDifferences: 'Observed differences',
    mean: 'Mean glucose',
    timeInRange: 'Time in range',
    inRange: 'in range',
    cv: 'CV',
    association:
      'This is an association in the available data, not proof that the setting change caused it.',
    comparisonUnavailable:
      'Differences are hidden until both windows have at least 14 days and 70% coverage.',
    observationWindow: 'Before and after window',
    observationFailed: 'The glucose periods could not be loaded.',
    observationLoading: 'Loading both glucose windows…',
    targetRange: 'Target range',
  },
  he: {
    title: 'שינויי Loop וההשפעה שנצפתה',
    subtitle: 'סקירת היסטוריית הגדרות והסוכר שנצפה לפני ואחרי שינוי.',
    loading: 'טוען שינויי הגדרות…',
    failed: 'לא הצלחנו לטעון את שינויי ההגדרות.',
    retry: 'ניסיון נוסף',
    empty: 'לא נמצאו שינויי הגדרות בתקופה הזו.',
    back: 'חזרה להיסטוריית השינויים',
    previous: 'ערך קודם',
    next: 'ערך חדש',
    unverified:
      'המקור מתעד שהיה שינוי, אך אינו מאמת את הערכים הקודמים או החדשים.',
    openGraph: 'פתיחת הגרף היומי',
    askAi: 'שאלה ליועץ ה־Loop',
    advisoryBoundary:
      'היועץ יכול להציע מה לבדוק. הוא אינו יכול לשנות הגדרות Loop.',
    scheduleSegments: 'מקטעי לוח זמנים',
    setting: 'הגדרה',
    carbRatio: 'יחס פחמימה',
    isf: 'רגישות לאינסולין',
    target: 'יעד סוכר',
    basal: 'קצב בזאלי',
    dia: 'משך פעילות אינסולין',
    other: 'הגדרה אחרת',
    historyPeriod: 'היסטוריית שינויים',
    days: 'ימים',
    compare: 'השוואת התקופות שנצפו',
    before: 'לפני',
    after: 'אחרי',
    coverage: 'כיסוי',
    readings: 'קריאות',
    observedDifferences: 'הבדלים שנצפו',
    mean: 'ממוצע סוכר',
    timeInRange: 'זמן בטווח',
    inRange: 'בטווח',
    cv: 'CV',
    association:
      'זהו קשר שנצפה בנתונים הזמינים, ולא הוכחה ששינוי ההגדרה גרם לו.',
    comparisonUnavailable:
      'ההבדלים מוסתרים עד שלשני החלונות יהיו לפחות 14 ימים וכיסוי של 70%.',
    observationWindow: 'חלון לפני ואחרי',
    observationFailed: 'לא הצלחנו לטעון את תקופות הסוכר.',
    observationLoading: 'טוען את שני חלונות הסוכר…',
    targetRange: 'טווח יעד',
  },
} as const;

type HistoryState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly changes: readonly LoopSettingChange[]};

type ObservationState =
  | {readonly kind: 'idle'}
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly result: LoopChangeObservation};

export interface LoopChangesModuleViewProps {
  readonly locale: DestinationLocale;
  readonly runtime: LoopChangesModuleRuntime;
  readonly focus?: DestinationFocus;
  readonly now?: () => number;
}

const systemNow = (): number => Date.now();

const startOfLocalDay = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const formatDateTime = (
  timestampMs: number,
  locale: DestinationLocale,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));

const formatValue = (
  value: LoopSettingValue,
  locale: DestinationLocale,
): string => {
  if (value.kind === 'text') {
    return value.value;
  }
  const unit = value.unit === 'other' ? value.customUnit ?? '' : value.unit;
  if (value.kind === 'scalar') {
    return `${value.value}${unit ? ` ${unit}` : ''}`;
  }
  return `${value.segments.length} ${COPY[locale].scheduleSegments}`;
};

const signed = (value: number, unit: string): string =>
  `${value > 0 ? '+' : ''}${value}${unit}`;

const changeKindLabel = (
  kind: LoopChangeKind,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  switch (kind) {
    case 'carb_ratio':
      return copy.carbRatio;
    case 'isf':
      return copy.isf;
    case 'target':
      return copy.target;
    case 'basal':
      return copy.basal;
    case 'dia':
      return copy.dia;
    case 'other':
      return copy.other;
  }
};

const periodMetricSummary = (
  overview: TrendsOverview,
  inRangeLabel: string,
): string => {
  if (
    overview.meanGlucoseMgDl === undefined ||
    overview.ranges === undefined ||
    overview.coefficientOfVariationPercent === undefined
  ) {
    return '—';
  }
  return `${overview.meanGlucoseMgDl} mg/dL · ${overview.ranges.targetPercent}% ${inRangeLabel} · ${overview.coefficientOfVariationPercent}% CV`;
};

const ChangeDetail = ({
  change,
  locale,
  runtime,
  onBack,
}: {
  readonly change: LoopSettingChange;
  readonly locale: DestinationLocale;
  readonly runtime: LoopChangesModuleRuntime;
  readonly onBack: () => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [observation, setObservation] = useState<ObservationState>({
    kind: 'idle',
  });
  const [windowDays, setWindowDays] = useState<ObservationDays>(14);
  const requestSequence = useRef(0);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const runObservation = (requestedDays = windowDays): void => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    const windowMs = requestedDays * DAY_MS;
    const before = {
      startMs: change.changedAtMs - windowMs,
      endMs: change.changedAtMs,
    };
    const after = {
      startMs: change.changedAtMs,
      endMs: change.changedAtMs + windowMs,
    };
    setObservation({kind: 'loading'});
    Promise.all([
      runtime.dataSource.loadGlucoseSamples(before),
      runtime.dataSource.loadGlucoseSamples(after),
    ])
      .then(([samplesBefore, samplesAfter]) => {
        if (requestSequence.current !== request) {
          return;
        }
        setObservation({
          kind: 'ready',
          result: buildLoopChangeObservation({
            change,
            expectedSampleIntervalMs:
              runtime.expectedSampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS,
            samplesAfter,
            samplesBefore,
            thresholds: runtime.thresholds,
            windowDays: requestedDays,
          }),
        });
      })
      .catch(() => {
        if (requestSequence.current === request) {
          setObservation({kind: 'error'});
        }
      });
  };

  return (
    <View style={styles.detail} testID="loop-changes-detail">
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
        testID="loop-changes-back-to-list">
        <Text style={styles.backText}>{copy.back}</Text>
      </Pressable>
      <Text style={[styles.detailTitle, rtl && styles.rtlText]}>
        {change.summary}
      </Text>
      <Text style={[styles.detailMeta, rtl && styles.rtlText]}>
        {formatDateTime(change.changedAtMs, locale)} · {change.source.label}
      </Text>
      <Text style={[styles.kindText, rtl && styles.rtlText]}>
        {copy.setting}: {changeKindLabel(change.kind, locale)}
      </Text>
      {change.source.authority === 'authoritative' ? (
        <View style={[styles.valuePair, rtl && styles.rowReverse]}>
          <View style={styles.valueCard}>
            <Text style={[styles.valueLabel, rtl && styles.rtlText]}>
              {copy.previous}
            </Text>
            <Text style={[styles.value, rtl && styles.rtlText]}>
              {change.previousValue
                ? formatValue(change.previousValue, locale)
                : '—'}
            </Text>
          </View>
          <View style={styles.valueCard}>
            <Text style={[styles.valueLabel, rtl && styles.rtlText]}>
              {copy.next}
            </Text>
            <Text style={[styles.value, rtl && styles.rtlText]}>
              {change.nextValue ? formatValue(change.nextValue, locale) : '—'}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.notice, rtl && styles.rtlText]}>
          {copy.unverified}
        </Text>
      )}
      <Text style={[styles.filterLabel, rtl && styles.rtlText]}>
        {copy.observationWindow}
      </Text>
      <View style={[styles.filters, rtl && styles.rowReverse]}>
        {OBSERVATION_DAY_OPTIONS.map(days => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected: days === windowDays}}
            key={days}
            onPress={() => {
              setWindowDays(days);
              if (observation.kind !== 'idle') {
                runObservation(days);
              }
            }}
            style={({pressed}) => [
              styles.filterButton,
              days === windowDays && styles.filterButtonSelected,
              pressed && styles.pressed,
            ]}
            testID={`loop-changes-window-days-${days}`}>
            <Text
              style={[
                styles.filterText,
                days === windowDays && styles.filterTextSelected,
              ]}>
              {days} {copy.days}
            </Text>
          </Pressable>
        ))}
      </View>
      {observation.kind === 'idle' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => runObservation()}
          style={({pressed}) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
          testID="loop-changes-run-observation">
          <Text style={styles.primaryText}>{copy.compare}</Text>
        </Pressable>
      ) : observation.kind === 'loading' ? (
        <View style={styles.stateCard} testID="loop-changes-observation-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.observationLoading}
          </Text>
        </View>
      ) : observation.kind === 'error' ? (
        <View style={styles.stateCard} testID="loop-changes-observation-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.observationFailed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => runObservation()}
            style={({pressed}) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            testID="loop-changes-observation-retry">
            <Text style={styles.primaryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.observation} testID="loop-changes-observation">
          <Text style={[styles.thresholdText, rtl && styles.rtlText]}>
            {copy.targetRange}: {runtime.thresholds.targetMinMgDl}–
            {runtime.thresholds.targetMaxMgDl} mg/dL
          </Text>
          <View style={[styles.valuePair, rtl && styles.rowReverse]}>
            <View style={styles.periodCard}>
              <Text style={[styles.valueLabel, rtl && styles.rtlText]}>
                {copy.before}
              </Text>
              <Text style={[styles.coverage, rtl && styles.rtlText]}>
                {observation.result.before.coveragePercent}% {copy.coverage}
              </Text>
              <Text style={[styles.sampleCount, rtl && styles.rtlText]}>
                {observation.result.before.validSampleCount} /{' '}
                {observation.result.before.expectedSampleCount} {copy.readings}
              </Text>
            </View>
            <View style={styles.periodCard}>
              <Text style={[styles.valueLabel, rtl && styles.rtlText]}>
                {copy.after}
              </Text>
              <Text style={[styles.coverage, rtl && styles.rtlText]}>
                {observation.result.after.coveragePercent}% {copy.coverage}
              </Text>
              <Text style={[styles.sampleCount, rtl && styles.rtlText]}>
                {observation.result.after.validSampleCount} /{' '}
                {observation.result.after.expectedSampleCount} {copy.readings}
              </Text>
            </View>
          </View>
          {observation.result.observedDeltas ? (
            <View style={styles.deltaCard}>
              <Text style={[styles.sectionTitle, rtl && styles.rtlText]}>
                {copy.observedDifferences}
              </Text>
              <Text
                style={[styles.deltaText, rtl && styles.rtlText]}
                testID="loop-changes-before-metrics">
                {periodMetricSummary(observation.result.before, copy.inRange)}
              </Text>
              <Text
                style={[styles.deltaText, rtl && styles.rtlText]}
                testID="loop-changes-after-metrics">
                {periodMetricSummary(observation.result.after, copy.inRange)}
              </Text>
              <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                {copy.mean}:{' '}
                {signed(
                  observation.result.observedDeltas.meanGlucoseMgDl,
                  ' mg/dL',
                )}
              </Text>
              <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                {copy.timeInRange}:{' '}
                {signed(
                  observation.result.observedDeltas
                    .targetRangePercentagePoints,
                  ' pp',
                )}
              </Text>
              <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                {copy.cv}:{' '}
                {signed(
                  observation.result.observedDeltas
                    .coefficientOfVariationPercentagePoints,
                  ' pp',
                )}
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.notice, rtl && styles.rtlText]}
              testID="loop-changes-comparison-unavailable">
              {copy.comparisonUnavailable}
            </Text>
          )}
          <Text style={[styles.notice, rtl && styles.rtlText]}>
            {copy.association}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          runtime.onOpenDayGraph({
            changeId: change.id,
            dayStartMs: startOfLocalDay(change.changedAtMs),
          })
        }
        style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}
        testID="loop-changes-open-graph">
        <Text style={styles.primaryText}>{copy.openGraph}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => runtime.onAskAiAdvisor({changeId: change.id})}
        style={({pressed}) => [
          styles.secondaryButton,
          pressed && styles.pressed,
        ]}
        testID="loop-changes-ask-ai">
        <Text style={styles.secondaryText}>{copy.askAi}</Text>
      </Pressable>
      <Text style={[styles.actionNote, rtl && styles.rtlText]}>
        {copy.advisoryBoundary}
      </Text>
    </View>
  );
};

export const LoopChangesModuleView = ({
  locale,
  runtime,
  focus,
  now = systemNow,
}: LoopChangesModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const anchorMs = useRef(now()).current;
  const [historyDays, setHistoryDays] = useState<HistoryDays>(
    DEFAULT_HISTORY_DAYS,
  );
  const historyPeriod = useMemo<TrendsPeriod>(
    () => ({
      startMs: anchorMs - historyDays * DAY_MS,
      endMs: anchorMs,
    }),
    [anchorMs, historyDays],
  );
  const focusedId = focus?.kind === 'loop-change' ? focus.changeId : undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(focusedId);
  const [state, setState] = useState<HistoryState>({kind: 'loading'});
  const [retrySequence, setRetrySequence] = useState(0);

  useEffect(() => {
    setSelectedId(focusedId);
  }, [focusedId]);

  useEffect(() => {
    let active = true;
    setState({kind: 'loading'});
    runtime.dataSource
      .loadChanges(historyPeriod)
      .then(changes => {
        if (!active) {
          return;
        }
        setState({
          kind: 'ready',
          changes: prepareLoopChangeHistory({
            changes,
            period: historyPeriod,
          }).changes,
        });
      })
      .catch(() => {
        if (active) {
          setState({kind: 'error'});
        }
      });
    return () => {
      active = false;
    };
  }, [historyPeriod, retrySequence, runtime.dataSource]);

  const selected =
    state.kind === 'ready'
      ? state.changes.find(change => change.id === selectedId)
      : undefined;

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="loop-changes-module-view"
      title={copy.title}>
      <Text style={[styles.filterLabel, rtl && styles.rtlText]}>
        {copy.historyPeriod}
      </Text>
      <View
        style={[styles.filters, rtl && styles.rowReverse]}
        testID="loop-changes-history-filters">
        {HISTORY_DAY_OPTIONS.map(days => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected: days === historyDays}}
            key={days}
            onPress={() => setHistoryDays(days)}
            style={({pressed}) => [
              styles.filterButton,
              days === historyDays && styles.filterButtonSelected,
              pressed && styles.pressed,
            ]}
            testID={`loop-changes-history-days-${days}`}>
            <Text
              style={[
                styles.filterText,
                days === historyDays && styles.filterTextSelected,
              ]}>
              {days} {copy.days}
            </Text>
          </Pressable>
        ))}
      </View>
      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="loop-changes-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="loop-changes-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetrySequence(value => value + 1)}
            style={({pressed}) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            testID="loop-changes-retry">
            <Text style={styles.primaryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : selected ? (
        <ChangeDetail
          change={selected}
          locale={locale}
          onBack={() => setSelectedId(undefined)}
          runtime={runtime}
        />
      ) : state.changes.length === 0 ? (
        <View style={styles.stateCard} testID="loop-changes-empty">
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.empty}
          </Text>
        </View>
      ) : (
        <View testID="loop-changes-list">
          {state.changes.map(change => (
            <Pressable
              accessibilityRole="button"
              key={change.id}
              onPress={() => setSelectedId(change.id)}
              style={({pressed}) => [
                styles.changeCard,
                pressed && styles.pressed,
              ]}
              testID={`loop-change-${change.id}`}>
              <Text style={[styles.changeTitle, rtl && styles.rtlText]}>
                {change.summary}
              </Text>
              <Text style={[styles.detailMeta, rtl && styles.rtlText]}>
                {formatDateTime(change.changedAtMs, locale)} ·{' '}
                {change.source.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  filterLabel: {
    color: productUiTokens.colors.text,
    fontWeight: '700',
    marginTop: productUiTokens.spacing.lg,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: productUiTokens.spacing.sm,
  },
  filterButton: {
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 40,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.sm,
  },
  filterButtonSelected: {backgroundColor: productUiTokens.colors.action},
  filterText: {color: productUiTokens.colors.text, fontWeight: '700'},
  filterTextSelected: {color: productUiTokens.colors.actionText},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  changeCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  changeTitle: {color: productUiTokens.colors.text, fontWeight: '800'},
  detail: {marginTop: productUiTokens.spacing.lg},
  backButton: {alignSelf: 'flex-start', paddingVertical: productUiTokens.spacing.sm},
  backText: {color: productUiTokens.colors.action, fontWeight: '700'},
  detailTitle: {
    color: productUiTokens.colors.text,
    fontSize: 21,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.md,
  },
  detailMeta: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.sm,
  },
  kindText: {
    color: productUiTokens.colors.action,
    fontSize: 13,
    fontWeight: '700',
    marginTop: productUiTokens.spacing.sm,
  },
  valuePair: {
    flexDirection: 'row',
    gap: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.lg,
  },
  valueCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    flex: 1,
    padding: productUiTokens.spacing.lg,
  },
  valueLabel: {color: productUiTokens.colors.textMuted, fontSize: 12},
  value: {
    color: productUiTokens.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.xs,
  },
  notice: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    color: productUiTokens.colors.textMuted,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.lg,
  },
  observation: {marginTop: productUiTokens.spacing.lg},
  thresholdText: {color: productUiTokens.colors.textMuted, fontSize: 12},
  periodCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flex: 1,
    padding: productUiTokens.spacing.lg,
  },
  coverage: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.xs,
  },
  sampleCount: {
    color: productUiTokens.colors.textMuted,
    fontSize: 11,
    marginTop: productUiTokens.spacing.xs,
  },
  deltaCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  sectionTitle: {color: productUiTokens.colors.text, fontWeight: '800'},
  deltaText: {
    color: productUiTokens.colors.text,
    marginTop: productUiTokens.spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.lg,
    minHeight: 44,
    padding: productUiTokens.spacing.md,
  },
  primaryText: {color: productUiTokens.colors.actionText, fontWeight: '800'},
  secondaryButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.sm,
    minHeight: 44,
    padding: productUiTokens.spacing.md,
  },
  secondaryText: {color: productUiTokens.colors.action, fontWeight: '800'},
  actionNote: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.sm,
  },
});
