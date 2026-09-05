import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  analyzeSimilarGlucoseEvents,
  createSimilarEventsLoadPlan,
  type ObservedGlucoseEvent,
  type SimilarEventMatch,
  type SimilarEventsAnalysis,
} from '../../modules/similarEvents';
import type {TrendsGlucoseSample, TrendsPeriod} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import type {SimilarEventsModuleRuntime} from './runtime';

const MINUTE_MS = 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * MINUTE_MS;

const COPY = {
  en: {
    title: 'Similar events',
    subtitle: 'Compare one observed glucose event with earlier events.',
    focusRequired: 'Open Similar events from a selected low or high event.',
    focusedWindow: 'Selected event window',
    loading: 'Looking through earlier glucose events…',
    progress: 'data windows loaded',
    cancel: 'Cancel',
    canceled: 'The comparison was canceled. The selected event is unchanged.',
    resume: 'Resume comparison',
    failed: 'The earlier events could not be loaded.',
    retry: 'Try again',
    quality: 'Data quality',
    focusedCoverage: 'Selected window coverage',
    historyCoverage: 'History coverage',
    warning:
      'Coverage is below 70%. Missing readings may hide events or change the matches below.',
    readings: 'readings',
    focusedLow: 'Focused low event',
    focusedHigh: 'Focused high event',
    noFocusedEvent:
      'No low or high event was observed inside the selected window.',
    matches: 'Earlier matches',
    noMatches: 'No earlier event of the same observed type was found.',
    low: 'Low',
    high: 'High',
    nadir: 'Nadir',
    peak: 'Peak',
    observedSpan: 'Observed sample span',
    samples: 'samples',
    minutes: 'min',
    descriptiveSimilarity: 'Descriptive similarity',
    notMedicalScore: 'This percentage is not a medical score.',
    sameType: 'Same observed type',
    clockDifference: 'Start-time difference',
    extremeDifference: 'Nadir/peak difference',
    spanDifference: 'Observed-span difference',
    openGraph: 'Open this event in the graph',
    askAi: 'Ask AI about this event',
    formula: 'How matching works',
    formulaNote:
      'Only event type, local start time, observed nadir or peak, and observed sample span are used. No cause is inferred.',
    weights: 'Weights: time 40%, nadir/peak 40%, observed span 20%.',
    fullDifference:
      'A 12-hour, 100 mg/dL, or 180-minute difference reduces its component to zero.',
  },
  he: {
    title: 'אירועים דומים',
    subtitle: 'השוואת אירוע סוכר שנצפה לאירועים קודמים.',
    focusRequired: 'יש לפתוח אירועים דומים מתוך אירוע סוכר נמוך או גבוה שנבחר.',
    focusedWindow: 'חלון האירוע שנבחר',
    loading: 'מחפש אירועי סוכר קודמים…',
    progress: 'חלונות נתונים נטענו',
    cancel: 'ביטול',
    canceled: 'ההשוואה בוטלה. האירוע שנבחר לא השתנה.',
    resume: 'המשך ההשוואה',
    failed: 'לא הצלחנו לטעון את האירועים הקודמים.',
    retry: 'ניסיון נוסף',
    quality: 'איכות נתונים',
    focusedCoverage: 'כיסוי החלון שנבחר',
    historyCoverage: 'כיסוי ההיסטוריה',
    warning:
      'הכיסוי נמוך מ־70%. קריאות חסרות עלולות להסתיר אירועים או לשנות את ההתאמות שמוצגות.',
    readings: 'קריאות',
    focusedLow: 'אירוע סוכר נמוך שנבחר',
    focusedHigh: 'אירוע סוכר גבוה שנבחר',
    noFocusedEvent: 'לא נצפה אירוע סוכר נמוך או גבוה בחלון שנבחר.',
    matches: 'התאמות קודמות',
    noMatches: 'לא נמצא אירוע קודם מאותו סוג שנצפה.',
    low: 'נמוך',
    high: 'גבוה',
    nadir: 'שפל',
    peak: 'שיא',
    observedSpan: 'טווח הדגימות שנצפה',
    samples: 'דגימות',
    minutes: 'דק׳',
    descriptiveSimilarity: 'דמיון תיאורי',
    notMedicalScore: 'האחוז הזה אינו ציון רפואי.',
    sameType: 'אותו סוג אירוע שנצפה',
    clockDifference: 'הפרש בשעת ההתחלה',
    extremeDifference: 'הפרש בשפל או בשיא',
    spanDifference: 'הפרש בטווח הדגימות שנצפה',
    openGraph: 'פתיחת האירוע הזה בגרף',
    askAi: 'שאלה ל־AI על האירוע הזה',
    formula: 'איך ההתאמה עובדת',
    formulaNote:
      'נעשה שימוש רק בסוג האירוע, שעת ההתחלה המקומית, השפל או השיא שנצפו וטווח הדגימות שנצפה. לא מוסקת סיבה.',
    weights: 'משקלים: שעה 40%, שפל או שיא 40%, טווח דגימות 20%.',
    fullDifference:
      'הפרש של 12 שעות, 100 mg/dL או 180 דקות מוריד את הרכיב המתאים לאפס.',
  },
} as const;

type LoadState =
  | {readonly kind: 'idle'}
  | {readonly kind: 'loading'; readonly completed: number; readonly total: number}
  | {readonly kind: 'canceled'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly analysis: SimilarEventsAnalysis};

export interface SimilarEventsModuleViewProps {
  readonly locale: DestinationLocale;
  readonly runtime: SimilarEventsModuleRuntime;
  readonly focus?: DestinationFocus;
}

const focusedPeriod = (
  focus: DestinationFocus | undefined,
): TrendsPeriod | undefined =>
  focus?.kind === 'period' &&
  Number.isFinite(focus.startMs) &&
  Number.isFinite(focus.endMs) &&
  focus.endMs > focus.startMs
    ? {startMs: focus.startMs, endMs: focus.endMs}
    : undefined;

const formatDateTime = (
  timestampMs: number,
  locale: DestinationLocale,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));

const eventTitle = (
  event: ObservedGlucoseEvent,
  copy: (typeof COPY)[DestinationLocale],
): string => (event.type === 'low' ? copy.focusedLow : copy.focusedHigh);

const EventFacts = ({
  event,
  locale,
}: {
  readonly event: ObservedGlucoseEvent;
  readonly locale: DestinationLocale;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  return (
    <>
      <Text style={[styles.eventDate, rtl && styles.rtlText]}>
        {formatDateTime(event.startMs, locale)}
      </Text>
      <Text style={[styles.eventDetail, rtl && styles.rtlText]}>
        {event.type === 'low' ? copy.nadir : copy.peak}: {event.extremeMgDl}{' '}
        mg/dL · {copy.observedSpan}: {event.observedSpanMinutes} {copy.minutes}
      </Text>
      <Text style={[styles.eventDetail, rtl && styles.rtlText]}>
        {event.sampleCount} {copy.samples}
      </Text>
    </>
  );
};

const QualityCard = ({
  coveragePercent,
  label,
  locale,
  readings,
  expected,
}: {
  readonly coveragePercent: number;
  readonly label: string;
  readonly locale: DestinationLocale;
  readonly readings: number;
  readonly expected: number;
}) => {
  const rtl = locale === 'he';
  return (
    <View style={styles.qualityCard}>
      <Text style={[styles.qualityLabel, rtl && styles.rtlText]}>{label}</Text>
      <Text style={[styles.qualityValue, rtl && styles.rtlText]}>
        {coveragePercent}%
      </Text>
      <Text style={[styles.qualityDetail, rtl && styles.rtlText]}>
        {readings}/{expected} {COPY[locale].readings}
      </Text>
    </View>
  );
};

const MatchCard = ({
  locale,
  match,
  selected,
  onSelect,
  onOpenDayGraph,
  onAskAi,
  index,
}: {
  readonly locale: DestinationLocale;
  readonly match: SimilarEventMatch;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onOpenDayGraph: () => void;
  readonly onAskAi: () => void;
  readonly index: number;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  return (
    <Pressable
      accessibilityLabel={`${copy.descriptiveSimilarity}: ${match.scorePercent}%`}
      accessibilityRole="button"
      accessibilityState={{expanded: selected}}
      onPress={onSelect}
      style={({pressed}) => [
        styles.matchCard,
        selected && styles.matchCardSelected,
        pressed && styles.pressed,
      ]}
      testID={`similar-events-match-${index}`}>
      <View style={[styles.matchHeader, rtl && styles.rowReverse]}>
        <Text style={[styles.matchType, rtl && styles.rtlText]}>
          {match.event.type === 'low' ? copy.low : copy.high}
        </Text>
        <Text style={styles.matchScore}>{match.scorePercent}%</Text>
      </View>
      <Text style={[styles.scoreLabel, rtl && styles.rtlText]}>
        {copy.descriptiveSimilarity}
      </Text>
      <Text style={[styles.scoreWarning, rtl && styles.rtlText]}>
        {copy.notMedicalScore}
      </Text>
      <EventFacts event={match.event} locale={locale} />
      <Text style={[styles.reason, rtl && styles.rtlText]}>
        {copy.sameType} · {copy.clockDifference}:{' '}
        {match.similarity.timeOfDayDifferenceMinutes} {copy.minutes}
      </Text>
      <Text style={[styles.reason, rtl && styles.rtlText]}>
        {copy.extremeDifference}: {match.similarity.extremeDifferenceMgDl}{' '}
        mg/dL · {copy.spanDifference}:{' '}
        {match.similarity.observedSpanDifferenceMinutes} {copy.minutes}
      </Text>
      {selected ? (
        <View style={styles.actions} testID="similar-events-match-actions">
          <Pressable
            accessibilityRole="button"
            onPress={event => {
              event?.stopPropagation();
              onOpenDayGraph();
            }}
            style={styles.primaryButton}
            testID="similar-events-open-graph">
            <Text style={styles.primaryButtonText}>{copy.openGraph}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={event => {
              event?.stopPropagation();
              onAskAi();
            }}
            style={styles.secondaryButton}
            testID="similar-events-ask-ai">
            <Text style={styles.secondaryButtonText}>{copy.askAi}</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
};

export const SimilarEventsModuleView = ({
  locale,
  runtime,
  focus,
}: SimilarEventsModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const period = useMemo(() => focusedPeriod(focus), [focus]);
  const plan = useMemo(
    () =>
      period
        ? createSimilarEventsLoadPlan({
            focusPeriod: period,
            ...(runtime.historyDurationMs === undefined
              ? {}
              : {historyDurationMs: runtime.historyDurationMs}),
            ...(runtime.historyChunkDurationMs === undefined
              ? {}
              : {historyChunkDurationMs: runtime.historyChunkDurationMs}),
          })
        : undefined,
    [period, runtime.historyChunkDurationMs, runtime.historyDurationMs],
  );
  const [state, setState] = useState<LoadState>({kind: 'idle'});
  const [reloadSequence, setReloadSequence] = useState(0);
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (!plan) {
      controllerRef.current?.abort();
      controllerRef.current = undefined;
      setSelectedMatchId(undefined);
      setState({kind: 'idle'});
      return;
    }

    const request = requestSequence.current + 1;
    requestSequence.current = request;
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;
    const periods = [plan.focusPeriod, ...plan.historyChunks];
    setSelectedMatchId(undefined);
    setState({kind: 'loading', completed: 0, total: periods.length});

    const load = (readPeriod: TrendsPeriod) =>
      runtime.dataSource
        .loadGlucoseSamples(readPeriod, controller.signal)
        .then(samples => {
          if (
            active &&
            !controller.signal.aborted &&
            requestSequence.current === request
          ) {
            setState(current =>
              current.kind === 'loading'
                ? {...current, completed: current.completed + 1}
                : current,
            );
          }
          return samples;
        });

    Promise.all(periods.map(readPeriod => load(readPeriod)))
      .then(([focalSamples = [], ...historyChunks]) => {
        if (
          !active ||
          controller.signal.aborted ||
          requestSequence.current !== request
        ) {
          return;
        }
        const historySamples: TrendsGlucoseSample[] = [];
        historyChunks.forEach(samples => historySamples.push(...samples));
        setState({
          kind: 'ready',
          analysis: analyzeSimilarGlucoseEvents({
            focusPeriod: plan.focusPeriod,
            historyPeriod: plan.historyPeriod,
            focalSamples,
            historySamples,
            expectedSampleIntervalMs:
              runtime.expectedSampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS,
            thresholds: runtime.thresholds,
            timeZoneOffsetMinutes:
              runtime.timeZoneOffsetMinutes ??
              -new Date(plan.focusPeriod.startMs).getTimezoneOffset(),
            ...(runtime.eventGapMs === undefined
              ? {}
              : {eventGapMs: runtime.eventGapMs}),
          }),
        });
      })
      .catch(() => {
        if (
          !active ||
          controller.signal.aborted ||
          requestSequence.current !== request
        ) {
          return;
        }
        setState({kind: 'error'});
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [plan, reloadSequence, runtime]);

  const cancel = (): void => {
    requestSequence.current += 1;
    controllerRef.current?.abort();
    setState({kind: 'canceled'});
  };

  const focused = state.kind === 'ready' ? state.analysis.focusedEvent : undefined;

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="similar-events-view"
      title={copy.title}>
      {!plan ? (
        <View style={styles.stateCard} testID="similar-events-focus-required">
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.focusRequired}
          </Text>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.focusedWindow}>
            <View style={styles.focusWindowCard} testID="similar-events-focus-window">
              <Text style={[styles.focusWindowText, rtl && styles.rtlText]}>
                {formatDateTime(plan.focusPeriod.startMs, locale)} –{' '}
                {formatDateTime(plan.focusPeriod.endMs, locale)}
              </Text>
            </View>
          </ProductSection>

          {state.kind === 'loading' ? (
            <View style={styles.stateCard} testID="similar-events-loading">
              <ActivityIndicator color={productUiTokens.colors.action} />
              <Text style={[styles.stateText, rtl && styles.rtlText]}>
                {copy.loading}
              </Text>
              <Text style={[styles.progressText, rtl && styles.rtlText]}>
                {state.completed}/{state.total} {copy.progress}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={cancel}
                style={styles.secondaryButton}
                testID="similar-events-cancel">
                <Text style={styles.secondaryButtonText}>{copy.cancel}</Text>
              </Pressable>
            </View>
          ) : state.kind === 'canceled' ? (
            <View style={styles.stateCard} testID="similar-events-canceled">
              <Text style={[styles.stateText, rtl && styles.rtlText]}>
                {copy.canceled}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReloadSequence(value => value + 1)}
                style={styles.primaryButton}
                testID="similar-events-resume">
                <Text style={styles.primaryButtonText}>{copy.resume}</Text>
              </Pressable>
            </View>
          ) : state.kind === 'error' ? (
            <View style={styles.stateCard} testID="similar-events-error">
              <Text style={[styles.errorText, rtl && styles.rtlText]}>
                {copy.failed}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReloadSequence(value => value + 1)}
                style={styles.primaryButton}
                testID="similar-events-retry">
                <Text style={styles.primaryButtonText}>{copy.retry}</Text>
              </Pressable>
            </View>
          ) : state.kind === 'ready' ? (
            <>
              <ProductSection locale={locale} title={copy.quality}>
                <View style={[styles.qualityRow, rtl && styles.rowReverse]}>
                  <QualityCard
                    coveragePercent={state.analysis.dataQuality.focus.coveragePercent}
                    expected={state.analysis.dataQuality.focus.expectedSampleCount}
                    label={copy.focusedCoverage}
                    locale={locale}
                    readings={state.analysis.dataQuality.focus.validSampleCount}
                  />
                  <QualityCard
                    coveragePercent={state.analysis.dataQuality.history.coveragePercent}
                    expected={state.analysis.dataQuality.history.expectedSampleCount}
                    label={copy.historyCoverage}
                    locale={locale}
                    readings={state.analysis.dataQuality.history.validSampleCount}
                  />
                </View>
                {state.analysis.dataQuality.requiresWarning ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={styles.warningCard}
                    testID="similar-events-coverage-warning">
                    <Text style={[styles.warningText, rtl && styles.rtlText]}>
                      {copy.warning}
                    </Text>
                  </View>
                ) : null}
              </ProductSection>

              {!focused ? (
                <View style={styles.stateCard} testID="similar-events-no-focus-event">
                  <Text style={[styles.stateText, rtl && styles.rtlText]}>
                    {copy.noFocusedEvent}
                  </Text>
                </View>
              ) : (
                <>
                  <ProductSection locale={locale} title={eventTitle(focused, copy)}>
                    <View style={styles.focusedEventCard}>
                      <EventFacts event={focused} locale={locale} />
                    </View>
                  </ProductSection>

                  <ProductSection locale={locale} title={copy.matches}>
                    {state.analysis.matches.length === 0 ? (
                      <View style={styles.emptyCard} testID="similar-events-empty">
                        <Text style={[styles.stateText, rtl && styles.rtlText]}>
                          {copy.noMatches}
                        </Text>
                      </View>
                    ) : (
                      state.analysis.matches.map((match, index) => (
                        <MatchCard
                          index={index}
                          key={match.event.id}
                          locale={locale}
                          match={match}
                          onAskAi={() => runtime.onAskAi(match.event)}
                          onOpenDayGraph={() =>
                            runtime.onOpenDayGraph(match.event)
                          }
                          onSelect={() =>
                            setSelectedMatchId(current =>
                              current === match.event.id
                                ? undefined
                                : match.event.id,
                            )
                          }
                          selected={selectedMatchId === match.event.id}
                        />
                      ))
                    )}
                  </ProductSection>

                  <ProductSection locale={locale} title={copy.formula}>
                    <View style={styles.formulaCard} testID="similar-events-formula">
                      <Text style={[styles.formulaVersion, rtl && styles.rtlText]}>
                        {state.analysis.formula.version}
                      </Text>
                      <Text style={[styles.formulaText, rtl && styles.rtlText]}>
                        {copy.formulaNote}
                      </Text>
                      <Text style={[styles.formulaText, rtl && styles.rtlText]}>
                        {copy.weights}
                      </Text>
                      <Text style={[styles.formulaText, rtl && styles.rtlText]}>
                        {copy.fullDifference}
                      </Text>
                      <Text style={[styles.nonMedicalText, rtl && styles.rtlText]}>
                        {copy.notMedicalScore}
                      </Text>
                    </View>
                  </ProductSection>
                </>
              )}
            </>
          ) : null}
        </>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {color: productUiTokens.colors.textMuted, lineHeight: 20},
  progressText: {
    color: productUiTokens.colors.action,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '800'},
  focusWindowCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.md,
  },
  focusWindowText: {color: '#3730A3', fontWeight: '800'},
  qualityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: productUiTokens.spacing.md,
  },
  qualityCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: productUiTokens.spacing.md,
  },
  qualityLabel: {color: productUiTokens.colors.textMuted, fontSize: 12},
  qualityValue: {color: '#1D4ED8', fontSize: 24, fontWeight: '900'},
  qualityDetail: {color: productUiTokens.colors.textMuted, fontSize: 12},
  warningCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  warningText: {color: '#9A3412', fontWeight: '700', lineHeight: 20},
  focusedEventCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  emptyCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  eventDate: {color: productUiTokens.colors.text, fontWeight: '900'},
  eventDetail: {color: productUiTokens.colors.textMuted, marginTop: 5},
  matchCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  matchCardSelected: {
    borderColor: productUiTokens.colors.action,
    borderWidth: 2,
  },
  matchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchType: {
    color: productUiTokens.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  matchScore: {
    color: productUiTokens.colors.action,
    fontSize: 22,
    fontWeight: '900',
  },
  scoreLabel: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
  },
  scoreWarning: {color: '#7C2D12', fontSize: 12, marginBottom: 8},
  reason: {color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 5},
  actions: {marginTop: productUiTokens.spacing.md},
  primaryButton: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.sm,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  primaryButtonText: {
    color: productUiTokens.colors.actionText,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.sm,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  secondaryButtonText: {
    color: productUiTokens.colors.action,
    fontWeight: '800',
  },
  formulaCard: {
    backgroundColor: '#F8FAFC',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  formulaVersion: {
    color: '#475569',
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  formulaText: {
    color: productUiTokens.colors.textMuted,
    lineHeight: 20,
    marginTop: 6,
  },
  nonMedicalText: {color: '#7C2D12', fontWeight: '800', marginTop: 8},
});
