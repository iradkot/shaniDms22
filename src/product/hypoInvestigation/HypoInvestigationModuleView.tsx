import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  buildHypoInvestigation,
  type HypoInvestigationEvent,
  type HypoInvestigationResult,
} from '../../modules/hypoInvestigation';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import type {
  TrendsDataSource,
  TrendsPeriod,
  TrendsRangeThresholds,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../ui';
import {HypoEventContextCard} from './HypoEventContextCard';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const RANGE_DAYS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_DAYS)[number];

const COPY = {
  en: {
    title: 'Low-glucose investigation',
    subtitle: 'Review observed low events and open their factual context.',
    period: 'Period',
    days: 'days',
    loading: 'Loading low-glucose events…',
    failed: 'The selected period could not be loaded.',
    retry: 'Try again',
    quality: 'Data quality',
    coverage: 'coverage',
    readings: 'valid readings',
    lowReadings: 'low readings',
    events: 'Events',
    eventCount: 'Low events',
    veryLowCount: 'Very-low events',
    none: 'No low-glucose events were found in the available readings.',
    lowCoverage: 'Coverage is below 70%. Missing readings may hide events.',
    observed: 'Observed sample span',
    minutes: 'min',
    nadir: 'Lowest reading',
    samples: 'samples',
    veryLow: 'Very low',
    low: 'Low',
    openGraph: 'Open this day in the graph',
    similar: 'Find similar events',
    askAi: 'Ask the AI specialist',
    factualNote:
      'No cause is inferred here. Nearby insulin, meals, activity, and missing data need separate review.',
  },
  he: {
    title: 'חקירת סוכר נמוך',
    subtitle: 'סקירת אירועי סוכר נמוך שנצפו ופתיחת ההקשר העובדתי שלהם.',
    period: 'תקופה',
    days: 'ימים',
    loading: 'טוען אירועי סוכר נמוך…',
    failed: 'לא הצלחנו לטעון את התקופה שנבחרה.',
    retry: 'ניסיון נוסף',
    quality: 'איכות נתונים',
    coverage: 'כיסוי',
    readings: 'קריאות תקינות',
    lowReadings: 'קריאות נמוכות',
    events: 'אירועים',
    eventCount: 'אירועי סוכר נמוך',
    veryLowCount: 'אירועים נמוכים מאוד',
    none: 'לא נמצאו אירועי סוכר נמוך בקריאות הזמינות.',
    lowCoverage: 'הכיסוי נמוך מ־70%. קריאות חסרות עלולות להסתיר אירועים.',
    observed: 'טווח דגימות שנצפה',
    minutes: 'דק׳',
    nadir: 'הקריאה הנמוכה ביותר',
    samples: 'דגימות',
    veryLow: 'נמוך מאוד',
    low: 'נמוך',
    openGraph: 'פתיחת היום הזה בגרף',
    similar: 'מציאת אירועים דומים',
    askAi: 'שאלה למומחה ה־AI',
    factualNote:
      'לא מוסקת כאן סיבה. יש לבדוק בנפרד אינסולין, ארוחות, פעילות ונתונים חסרים בסביבה.',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly result: HypoInvestigationResult};

export interface HypoInvestigationModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: TrendsDataSource;
  readonly contextDataSource?: DayGraphDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly focus?: DestinationFocus;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly onOpenDayGraph: (event: HypoInvestigationEvent) => void;
  readonly onFindSimilar: (event: HypoInvestigationEvent) => void;
  readonly onAskAi: (event: HypoInvestigationEvent) => void;
}

const systemNow = (): number => Date.now();

const validFocusedPeriod = (
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

const Metric = ({label, value}: {readonly label: string; readonly value: string}) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

export const HypoInvestigationModuleView = ({
  locale,
  dataSource,
  contextDataSource,
  thresholds,
  focus,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  onOpenDayGraph,
  onFindSimilar,
  onAskAi,
}: HypoInvestigationModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const focusedPeriod = useMemo(() => validFocusedPeriod(focus), [focus]);
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [useFocus, setUseFocus] = useState(focusedPeriod !== undefined);
  const [reload, setReload] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const period = useMemo<TrendsPeriod>(() => {
    if (useFocus && focusedPeriod) {
      return focusedPeriod;
    }
    const endMs = now();
    return {startMs: endMs - rangeDays * DAY_MS, endMs};
  }, [focusedPeriod, now, rangeDays, useFocus]);

  useEffect(() => {
    if (focusedPeriod) {
      setUseFocus(true);
    }
  }, [focusedPeriod]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    setSelectedEventId(undefined);
    setState({kind: 'loading'});
    dataSource
      .loadGlucoseSamples(period)
      .then(samples => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          result: buildHypoInvestigation({
            period,
            samples,
            expectedSampleIntervalMs,
            veryLowThresholdMgDl: thresholds.veryLowMaxMgDl,
            lowThresholdMgDl: thresholds.targetMinMgDl,
          }),
        });
      })
      .catch(() => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({kind: 'error'});
      });
    return () => {
      active = false;
    };
  }, [dataSource, expectedSampleIntervalMs, period, reload, thresholds]);

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="hypo-investigation-view"
      title={copy.title}>
      <ProductSection locale={locale} title={copy.period}>
        <View style={[styles.rangeRow, rtl && styles.rowReverse]}>
          {RANGE_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: !useFocus && rangeDays === days}}
              key={days}
              onPress={() => {
                setUseFocus(false);
                setRangeDays(days);
              }}
              style={({pressed}) => [
                styles.rangeButton,
                !useFocus && rangeDays === days && styles.rangeButtonSelected,
                pressed && styles.pressed,
              ]}
              testID={`hypo-range-${days}`}>
              <Text
                style={[
                  styles.rangeText,
                  !useFocus && rangeDays === days && styles.rangeTextSelected,
                ]}>
                {days} {copy.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </ProductSection>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="hypo-investigation-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>{copy.loading}</Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="hypo-investigation-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>{copy.failed}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReload(value => value + 1)}
            style={styles.primaryButton}
            testID="hypo-investigation-retry">
            <Text style={styles.primaryButtonText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.quality}>
            <View style={styles.qualityCard}>
              <Text style={[styles.qualityValue, rtl && styles.rtlText]}>
                {state.result.dataQuality.coveragePercent}% {copy.coverage}
              </Text>
              <Text style={[styles.stateText, rtl && styles.rtlText]}>
                {state.result.dataQuality.validSampleCount} {copy.readings} ·{' '}
                {state.result.summary.lowReadingCount} {copy.lowReadings}
              </Text>
              {state.result.dataQuality.coverageQuality !== 'adequate' ? (
                <Text style={[styles.warningText, rtl && styles.rtlText]}>
                  {copy.lowCoverage}
                </Text>
              ) : null}
            </View>
          </ProductSection>
          <ProductSection locale={locale} title={copy.events}>
            <ResponsiveGrid locale={locale}>
              <Metric
                label={copy.eventCount}
                value={String(state.result.summary.eventCount)}
              />
              <Metric
                label={copy.veryLowCount}
                value={String(state.result.summary.veryLowEventCount)}
              />
            </ResponsiveGrid>
            <Text style={[styles.factualNote, rtl && styles.rtlText]}>
              {copy.factualNote}
            </Text>
            {state.result.events.length === 0 ? (
              <View style={styles.emptyCard} testID="hypo-investigation-empty">
                <Text style={[styles.stateText, rtl && styles.rtlText]}>{copy.none}</Text>
              </View>
            ) : (
              state.result.events.map(event => {
                const selected = selectedEventId === event.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{expanded: selected}}
                    key={event.id}
                    onPress={() => setSelectedEventId(selected ? undefined : event.id)}
                    style={({pressed}) => [
                      styles.eventCard,
                      event.severity === 'very-low' && styles.veryLowCard,
                      pressed && styles.pressed,
                    ]}
                    testID={`hypo-event-${event.startMs}`}>
                    <View style={[styles.eventHeader, rtl && styles.rowReverse]}>
                      <Text style={[styles.eventTime, rtl && styles.rtlText]}>
                        {formatDateTime(event.startMs, locale)}
                      </Text>
                      <Text style={styles.severityText}>
                        {event.severity === 'very-low' ? copy.veryLow : copy.low}
                      </Text>
                    </View>
                    <Text style={[styles.eventDetail, rtl && styles.rtlText]}>
                      {copy.nadir}: {event.nadirMgDl} mg/dL · {event.sampleCount}{' '}
                      {copy.samples}
                    </Text>
                    <Text style={[styles.eventDetail, rtl && styles.rtlText]}>
                      {copy.observed}: {event.observedSpanMinutes} {copy.minutes}
                    </Text>
                    {selected ? (
                      <View style={styles.actions} testID="hypo-event-actions">
                        {contextDataSource === undefined ? null : (
                          <HypoEventContextCard
                            dataSource={contextDataSource}
                            event={event}
                            locale={locale}
                            thresholds={thresholds}
                          />
                        )}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onOpenDayGraph(event)}
                          style={styles.primaryButton}
                          testID="hypo-open-day-graph">
                          <Text style={styles.primaryButtonText}>{copy.openGraph}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onFindSimilar(event)}
                          style={styles.secondaryButton}
                          testID="hypo-find-similar">
                          <Text style={styles.secondaryButtonText}>{copy.similar}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onAskAi(event)}
                          style={styles.secondaryButton}
                          testID="hypo-ask-ai">
                          <Text style={styles.secondaryButtonText}>{copy.askAi}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ProductSection>
        </>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  rangeRow: {flexDirection: 'row', flexWrap: 'wrap'},
  rangeButton: {
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  rangeButtonSelected: {backgroundColor: productUiTokens.colors.action},
  rangeText: {color: productUiTokens.colors.text, fontWeight: '700'},
  rangeTextSelected: {color: productUiTokens.colors.actionText},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {color: productUiTokens.colors.textMuted, lineHeight: 20, marginTop: 6},
  errorText: {color: productUiTokens.colors.danger, fontWeight: '800'},
  qualityCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  qualityValue: {color: '#1D4ED8', fontSize: 22, fontWeight: '800'},
  warningText: {color: '#9A3412', fontWeight: '700', lineHeight: 20, marginTop: 8},
  metric: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  metricLabel: {color: productUiTokens.colors.textMuted, fontSize: 13},
  metricValue: {color: productUiTokens.colors.text, fontSize: 24, fontWeight: '800'},
  factualNote: {color: productUiTokens.colors.textMuted, lineHeight: 20, marginTop: 12},
  emptyCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  eventCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  veryLowCard: {backgroundColor: '#FEF2F2', borderColor: '#FCA5A5'},
  eventHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  eventTime: {color: productUiTokens.colors.text, flex: 1, fontWeight: '800'},
  severityText: {color: '#B42318', fontWeight: '800', marginHorizontal: 8},
  eventDetail: {color: productUiTokens.colors.textMuted, marginTop: 6},
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
  primaryButtonText: {color: productUiTokens.colors.actionText, fontWeight: '800'},
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
  secondaryButtonText: {color: productUiTokens.colors.action, fontWeight: '800'},
});
