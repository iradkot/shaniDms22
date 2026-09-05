import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  MatchedPeriodComparison,
  TrendsDataSource,
  TrendsPeriod,
  TrendsRangeDistribution,
  TrendsRangeThresholds,
} from '../../modules/trends';
import {
  buildMatchedPeriodComparison,
  buildTrendsEvidenceMetadata,
  previousMatchedPeriod,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../ui';
import {TrendsEvidenceMetadataView} from './TrendsEvidenceMetadataView';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const RANGE_DAYS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_DAYS)[number];

const COPY = {
  en: {
    title: 'Trends overview',
    subtitle: 'A factual multi-day view with visible data quality.',
    range: 'Period',
    days: 'days',
    loading: 'Loading the selected period and its matched comparison…',
    failed: 'The Trends data could not be loaded.',
    retry: 'Try again',
    coverage: 'Data coverage',
    adequateCoverage: 'Duration and coverage support this comparison',
    lowCoverage: 'Low data coverage — interpret with care',
    shortPeriod:
      'Short view — representative GMI, GRI, and comparisons need at least 14 days.',
    samples: 'readings',
    excluded: 'excluded',
    duplicates: 'duplicates removed',
    localTime: 'Local time',
    glucoseRanges: 'Glucose ranges',
    veryLow: 'Very low',
    low: 'Low',
    target: 'In range',
    high: 'High',
    veryHigh: 'Very high',
    metrics: 'Key metrics',
    mean: 'Mean glucose',
    gmi: 'GMI',
    cv: 'CV',
    gri: 'GRI',
    griHypo: 'Low-glucose component',
    griHyper: 'High-glucose component',
    gmiNote: 'GMI comes from CGM data and is not a laboratory A1C.',
    comparison: 'Matched previous period',
    comparisonUnavailable:
      'Deltas are withheld until both equal periods have adequate coverage.',
    meanDelta: 'Mean difference',
    targetDelta: 'In-range difference',
    cvDelta: 'CV difference',
    investigateLow: 'Investigate low-glucose events in this period',
  },
  he: {
    title: 'סקירת מגמות',
    subtitle: 'מבט עובדתי על כמה ימים, עם איכות נתונים גלויה.',
    range: 'תקופה',
    days: 'ימים',
    loading: 'טוען את התקופה שנבחרה ואת תקופת ההשוואה…',
    failed: 'לא הצלחנו לטעון את נתוני המגמות.',
    retry: 'ניסיון נוסף',
    coverage: 'כיסוי נתונים',
    adequateCoverage: 'המשך והכיסוי מספיקים להשוואה הזו',
    lowCoverage: 'כיסוי נתונים נמוך — יש לפרש בזהירות',
    shortPeriod:
      'זהו מבט קצר — GMI, GRI והשוואה מייצגת דורשים לפחות 14 ימים.',
    samples: 'קריאות',
    excluded: 'הוחרגו',
    duplicates: 'כפילויות הוסרו',
    localTime: 'זמן מקומי',
    glucoseRanges: 'טווחי סוכר',
    veryLow: 'נמוך מאוד',
    low: 'נמוך',
    target: 'בטווח',
    high: 'גבוה',
    veryHigh: 'גבוה מאוד',
    metrics: 'מדדים מרכזיים',
    mean: 'סוכר ממוצע',
    gmi: 'GMI',
    cv: 'CV',
    gri: 'GRI',
    griHypo: 'רכיב סוכר נמוך',
    griHyper: 'רכיב סוכר גבוה',
    gmiNote: 'GMI מחושב מנתוני CGM ואינו בדיקת A1C במעבדה.',
    comparison: 'התקופה הקודמת התואמת',
    comparisonUnavailable:
      'ההפרשים מוסתרים עד שלשתי התקופות השוות יהיה כיסוי מספיק.',
    meanDelta: 'הפרש בממוצע',
    targetDelta: 'הפרש בזמן בטווח',
    cvDelta: 'הפרש ב־CV',
    investigateLow: 'חקירת אירועי סוכר נמוך בתקופה הזו',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'; readonly message: string}
  | {readonly kind: 'ready'; readonly comparison: MatchedPeriodComparison};

export interface TrendsOverviewModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: TrendsDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly onOpenHypoInvestigation: (period: TrendsPeriod) => void;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly showGri?: boolean;
  readonly timeZoneOffsetMinutes?: number;
}

const systemNow = (): number => Date.now();
const systemTimeZoneOffsetMinutes = (): number =>
  -new Date().getTimezoneOffset();
const signed = (value: number, suffix: string): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

const MetricCard = ({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue} testID={testID}>
      {value}
    </Text>
  </View>
);

const RANGE_PRESENTATION: readonly {
  readonly key: keyof TrendsRangeDistribution;
  readonly copyKey: 'veryLow' | 'low' | 'target' | 'high' | 'veryHigh';
  readonly color: string;
}[] = [
  {key: 'veryLowPercent', copyKey: 'veryLow', color: '#B91C1C'},
  {key: 'lowPercent', copyKey: 'low', color: '#F97316'},
  {key: 'targetPercent', copyKey: 'target', color: '#16A34A'},
  {key: 'highPercent', copyKey: 'high', color: '#EAB308'},
  {key: 'veryHighPercent', copyKey: 'veryHigh', color: '#7C3AED'},
];

export const TrendsOverviewModuleView = ({
  locale,
  dataSource,
  thresholds,
  onOpenHypoInvestigation,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  showGri = false,
  timeZoneOffsetMinutes = systemTimeZoneOffsetMinutes(),
}: TrendsOverviewModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const currentPeriod = useMemo<TrendsPeriod>(() => {
    const endMs = now();
    return {startMs: endMs - rangeDays * DAY_MS, endMs};
  }, [now, rangeDays]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    const previousPeriod = previousMatchedPeriod(currentPeriod);
    setState({kind: 'loading'});
    Promise.all([
      dataSource.loadGlucoseSamples(currentPeriod),
      dataSource.loadGlucoseSamples(previousPeriod),
    ])
      .then(([currentSamples, previousSamples]) => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          comparison: buildMatchedPeriodComparison({
            current: {
              period: currentPeriod,
              expectedSampleIntervalMs,
              thresholds,
              samples: currentSamples,
              timeZoneOffsetMinutes,
            },
            previous: {
              period: previousPeriod,
              expectedSampleIntervalMs,
              thresholds,
              samples: previousSamples,
              timeZoneOffsetMinutes,
            },
          }),
        });
      })
      .catch(error => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'error',
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : copy.failed,
        });
      });
    return () => {
      active = false;
    };
  }, [
    copy.failed,
    currentPeriod,
    dataSource,
    expectedSampleIntervalMs,
    reload,
    thresholds,
    timeZoneOffsetMinutes,
  ]);

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="trends-overview-view"
      title={copy.title}>
      <ProductSection locale={locale} title={copy.range}>
        <View style={[styles.rangeSelector, rtl && styles.rowReverse]}>
          {RANGE_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: days === rangeDays}}
              key={days}
              onPress={() => setRangeDays(days)}
              style={({pressed}) => [
                styles.rangeButton,
                days === rangeDays && styles.rangeButtonSelected,
                pressed && styles.pressed,
              ]}
              testID={`trends-range-${days}`}>
              <Text
                style={[
                  styles.rangeButtonText,
                  days === rangeDays && styles.rangeButtonTextSelected,
                ]}>
                {days} {copy.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </ProductSection>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="trends-overview-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="trends-overview-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {state.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReload(value => value + 1)}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.coverage}>
            <TrendsEvidenceMetadataView
              locale={locale}
              metadata={buildTrendsEvidenceMetadata({
                period: state.comparison.current.period,
                coveragePercent: state.comparison.current.coveragePercent,
                coverageQuality: state.comparison.current.coverageQuality,
                daysWithData: state.comparison.current.daysWithData,
                expectedSampleIntervalMs,
                lastReadingTimestampMs:
                  state.comparison.current.lastReadingTimestampMs,
                targetRange: {
                  minMgDl: thresholds.targetMinMgDl,
                  maxMgDl: thresholds.targetMaxMgDl,
                },
                timeZoneOffsetMinutes:
                  state.comparison.current.timeZoneOffsetMinutes,
              })}
            />
            <View style={styles.coverageCard}>
              <Text style={styles.coverageValue}>
                {state.comparison.current.coveragePercent}%
              </Text>
              <Text style={[styles.coverageDetail, rtl && styles.rtlText]}>
                {state.comparison.current.validSampleCount} /{' '}
                {state.comparison.current.expectedSampleCount} {copy.samples}
              </Text>
              <Text style={[styles.coverageDetail, rtl && styles.rtlText]}>
                {new Date(currentPeriod.startMs).toLocaleDateString(
                  locale === 'he' ? 'he-IL' : 'en-US',
                )}{' '}
                –{' '}
                {new Date(currentPeriod.endMs).toLocaleDateString(
                  locale === 'he' ? 'he-IL' : 'en-US',
                )}{' '}
                · {copy.localTime}
              </Text>
              {state.comparison.current.excludedSampleCount > 0 ||
              state.comparison.current.duplicateSampleCount > 0 ? (
                <Text style={[styles.coverageDetail, rtl && styles.rtlText]}>
                  {state.comparison.current.excludedSampleCount} {copy.excluded}
                  {' · '}
                  {state.comparison.current.duplicateSampleCount}{' '}
                  {copy.duplicates}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.coverageMessage,
                  state.comparison.current.coverageQuality !== 'adequate' &&
                    styles.warningText,
                  rtl && styles.rtlText,
                ]}>
                {state.comparison.current.interpretationQuality ===
                'representative'
                  ? copy.adequateCoverage
                  : state.comparison.current.durationQuality === 'short'
                  ? copy.shortPeriod
                  : copy.lowCoverage}
              </Text>
            </View>
          </ProductSection>

          {state.comparison.current.ranges ? (
            <ProductSection locale={locale} title={copy.glucoseRanges}>
              <View style={styles.rangeCard} testID="trends-overview-ranges">
                {RANGE_PRESENTATION.map(item => (
                  <View
                    key={item.key}
                    style={[styles.rangeRow, rtl && styles.rowReverse]}>
                    <View
                      style={[styles.rangeDot, {backgroundColor: item.color}]}
                    />
                    <Text style={[styles.rangeLabel, rtl && styles.rtlText]}>
                      {copy[item.copyKey]}
                    </Text>
                    <Text style={styles.rangeValue}>
                      {state.comparison.current.ranges?.[item.key]}%
                    </Text>
                  </View>
                ))}
              </View>
            </ProductSection>
          ) : null}

          {state.comparison.current.meanGlucoseMgDl !== undefined &&
          state.comparison.current.coefficientOfVariationPercent !== undefined ? (
            <ProductSection locale={locale} title={copy.metrics}>
              <ResponsiveGrid locale={locale} testID="trends-overview-metrics">
                <MetricCard
                  label={copy.mean}
                  testID="trends-overview-mean"
                  value={`${state.comparison.current.meanGlucoseMgDl} mg/dL`}
                />
                {state.comparison.current.gmiPercent !== undefined ? (
                  <MetricCard
                    label={copy.gmi}
                    testID="trends-overview-gmi"
                    value={`${state.comparison.current.gmiPercent}%`}
                  />
                ) : null}
                <MetricCard
                  label={copy.cv}
                  testID="trends-overview-cv"
                  value={`${state.comparison.current.coefficientOfVariationPercent}%`}
                />
              </ResponsiveGrid>
              {state.comparison.current.gmiPercent !== undefined ? (
                <Text style={[styles.metricNote, rtl && styles.rtlText]}>
                  {copy.gmiNote}
                </Text>
              ) : null}
            </ProductSection>
          ) : null}

          {showGri && state.comparison.current.gri ? (
            <ProductSection locale={locale} title={copy.gri}>
              <View style={styles.griCard} testID="trends-overview-gri">
                <Text style={styles.griScore} testID="trends-overview-gri-score">
                  {state.comparison.current.gri.score}
                </Text>
                <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                  {copy.griHypo}:{' '}
                  {state.comparison.current.gri.hypoglycemiaComponent}
                </Text>
                <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                  {copy.griHyper}:{' '}
                  {state.comparison.current.gri.hyperglycemiaComponent}
                </Text>
              </View>
            </ProductSection>
          ) : null}

          {(state.comparison.current.ranges?.veryLowPercent ?? 0) +
            (state.comparison.current.ranges?.lowPercent ?? 0) >
          0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenHypoInvestigation(currentPeriod)}
              style={({pressed}) => [
                styles.hypoButton,
                pressed && styles.pressed,
              ]}
              testID="trends-open-hypo-investigation">
              <Text style={styles.hypoButtonText}>{copy.investigateLow}</Text>
            </Pressable>
          ) : null}

          <ProductSection locale={locale} title={copy.comparison}>
            <View style={styles.comparisonCard}>
              <Text style={[styles.comparisonCoverage, rtl && styles.rtlText]}>
                {copy.coverage}: {state.comparison.previous.coveragePercent}%
              </Text>
              {state.comparison.deltas ? (
                <>
                  <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                    {copy.meanDelta}:{' '}
                    {signed(state.comparison.deltas.meanGlucoseMgDl, ' mg/dL')}
                  </Text>
                  <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                    {copy.targetDelta}:{' '}
                    {signed(
                      state.comparison.deltas.targetRangePercentagePoints,
                      ' pp',
                    )}
                  </Text>
                  <Text style={[styles.deltaText, rtl && styles.rtlText]}>
                    {copy.cvDelta}:{' '}
                    {signed(
                      state.comparison.deltas
                        .coefficientOfVariationPercentagePoints,
                      ' pp',
                    )}
                  </Text>
                </>
              ) : (
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.comparisonUnavailable}
                </Text>
              )}
            </View>
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
  rangeSelector: {flexDirection: 'row', flexWrap: 'wrap'},
  rangeButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.sm,
    marginBottom: productUiTokens.spacing.sm,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  rangeButtonSelected: {backgroundColor: productUiTokens.colors.action},
  rangeButtonText: {color: productUiTokens.colors.text, fontWeight: '700'},
  rangeButtonTextSelected: {color: productUiTokens.colors.actionText},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  coverageCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  coverageValue: {color: '#047857', fontSize: 30, fontWeight: '800'},
  coverageDetail: {color: productUiTokens.colors.textMuted, marginTop: 2},
  coverageMessage: {color: '#047857', fontWeight: '700', marginTop: 8},
  warningText: {color: '#9A3412'},
  rangeCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.md,
  },
  rangeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 36,
    paddingVertical: 4,
  },
  rangeDot: {borderRadius: 6, height: 12, marginHorizontal: 8, width: 12},
  rangeLabel: {color: productUiTokens.colors.text, flex: 1, fontSize: 14},
  rangeValue: {color: productUiTokens.colors.text, fontWeight: '800'},
  metricCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    minHeight: 92,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  metricLabel: {color: productUiTokens.colors.textMuted, fontSize: 13},
  metricValue: {
    color: productUiTokens.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  metricNote: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.sm,
  },
  griCard: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  griScore: {color: '#6D28D9', fontSize: 32, fontWeight: '800'},
  hypoButton: {
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.lg,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  hypoButtonText: {color: '#9A3412', fontWeight: '800', textAlign: 'center'},
  comparisonCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  comparisonCoverage: {color: productUiTokens.colors.text, fontWeight: '800'},
  deltaText: {color: productUiTokens.colors.text, marginTop: 8},
});
