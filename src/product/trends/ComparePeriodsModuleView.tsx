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
  TrendsOverview,
  TrendsPeriod,
  TrendsRangeThresholds,
} from '../../modules/trends';
import {
  buildMatchedPeriodComparison,
  buildTrendsEvidenceMetadata,
  previousMatchedPeriod,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import {TrendsEvidenceMetadataView} from './TrendsEvidenceMetadataView';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const PERIOD_DAYS = [7, 14, 30] as const;
type PeriodDays = (typeof PERIOD_DAYS)[number];

const COPY = {
  en: {
    title: 'Compare periods',
    subtitle:
      'Two adjacent equal periods with the same thresholds and data-quality rules.',
    period: 'Period',
    days: 'days',
    loading: 'Loading both equal periods…',
    failed: 'The period data could not be loaded.',
    retry: 'Try again',
    selected: 'Selected period',
    previous: 'Previous period',
    coverage: 'coverage',
    readings: 'readings',
    durationSufficient: 'Duration sufficient (14+ days)',
    durationShort: 'Duration below 14 days',
    coverageSufficient: 'Coverage sufficient (70%+)',
    coverageLow: 'Coverage below 70%',
    noData: 'No valid readings',
    mean: 'Mean',
    gmi: 'GMI',
    veryLow: 'Very low',
    low: 'Low',
    target: 'In range',
    high: 'High',
    veryHigh: 'Very high',
    cv: 'CV',
    targetRange: 'Target range',
    differences: 'Signed differences',
    differenceBasis: 'Selected period minus previous period',
    meanDifference: 'Mean',
    targetDifference: 'In range',
    cvDifference: 'CV',
    unavailable:
      'Signed differences are hidden until both periods have at least 14 days and 70% coverage.',
    evidence: 'Evidence details',
  },
  he: {
    title: 'השוואת תקופות',
    subtitle: 'שתי תקופות סמוכות ושוות, עם אותם ספים וכללי איכות נתונים.',
    period: 'תקופה',
    days: 'ימים',
    loading: 'טוען את שתי התקופות השוות…',
    failed: 'לא הצלחנו לטעון את נתוני התקופות.',
    retry: 'ניסיון נוסף',
    selected: 'התקופה שנבחרה',
    previous: 'התקופה הקודמת',
    coverage: 'כיסוי',
    readings: 'קריאות',
    durationSufficient: 'משך מספיק (14 ימים ומעלה)',
    durationShort: 'משך קצר מ־14 ימים',
    coverageSufficient: 'כיסוי מספיק (70% ומעלה)',
    coverageLow: 'כיסוי נמוך מ־70%',
    noData: 'אין קריאות תקינות',
    mean: 'ממוצע',
    gmi: 'GMI',
    veryLow: 'נמוך מאוד',
    low: 'נמוך',
    target: 'בטווח',
    high: 'גבוה',
    veryHigh: 'גבוה מאוד',
    cv: 'CV',
    targetRange: 'טווח יעד',
    differences: 'הפרשים עם סימן',
    differenceBasis: 'התקופה שנבחרה פחות התקופה הקודמת',
    meanDifference: 'ממוצע',
    targetDifference: 'זמן בטווח',
    cvDifference: 'CV',
    unavailable:
      'ההפרשים מוסתרים עד שלשתי התקופות יהיו לפחות 14 ימים וכיסוי של 70%.',
    evidence: 'פרטי הראיות',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'; readonly message: string}
  | {readonly kind: 'ready'; readonly comparison: MatchedPeriodComparison};

export interface ComparePeriodsModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: TrendsDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly timeZoneOffsetMinutes?: number;
}

const systemNow = (): number => Date.now();
const systemTimeZoneOffsetMinutes = (): number =>
  -new Date().getTimezoneOffset();

const signed = (value: number, suffix: string): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

const PeriodCard = ({
  label,
  locale,
  overview,
}: {
  readonly label: string;
  readonly locale: DestinationLocale;
  readonly overview: TrendsOverview;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const dateLocale = rtl ? 'he-IL' : 'en-US';
  const dateRange = `${new Date(overview.period.startMs).toLocaleDateString(
    dateLocale,
  )} – ${new Date(overview.period.endMs).toLocaleDateString(dateLocale)}`;

  return (
    <View style={styles.periodCard} testID={`compare-periods-${label}`}>
      <Text style={[styles.periodTitle, rtl && styles.rtlText]}>{label}</Text>
      <Text style={[styles.dateText, rtl && styles.rtlText]}>{dateRange}</Text>
      <Text style={[styles.coverageValue, rtl && styles.rtlText]}>
        {overview.coveragePercent}% {copy.coverage}
      </Text>
      <Text style={[styles.detailText, rtl && styles.rtlText]}>
        {overview.validSampleCount} / {overview.expectedSampleCount}{' '}
        {copy.readings}
      </Text>
      <Text style={[styles.qualityText, rtl && styles.rtlText]}>
        {overview.durationQuality === 'representative'
          ? copy.durationSufficient
          : copy.durationShort}
      </Text>
      <Text style={[styles.detailText, rtl && styles.rtlText]}>
        {overview.coverageQuality === 'adequate'
          ? copy.coverageSufficient
          : overview.coverageQuality === 'no-data'
          ? copy.noData
          : copy.coverageLow}
      </Text>
      <View style={styles.divider} />
      <Text style={[styles.metricText, rtl && styles.rtlText]}>
        {copy.mean}:{' '}
        {overview.meanGlucoseMgDl === undefined
          ? '—'
          : `${overview.meanGlucoseMgDl} mg/dL`}
      </Text>
      <Text style={[styles.metricText, rtl && styles.rtlText]}>
        {copy.gmi}:{' '}
        {overview.gmiPercent === undefined ? '—' : `${overview.gmiPercent}%`}
      </Text>
      <Text style={[styles.metricText, rtl && styles.rtlText]}>
        {copy.target}:{' '}
        {overview.ranges === undefined
          ? '—'
          : `${overview.ranges.targetPercent}%`}
      </Text>
      <Text style={[styles.metricText, rtl && styles.rtlText]}>
        {copy.cv}:{' '}
        {overview.coefficientOfVariationPercent === undefined
          ? '—'
          : `${overview.coefficientOfVariationPercent}%`}
      </Text>
    </View>
  );
};

const ComparisonDeltaRows = ({
  comparison,
  locale,
}: {
  readonly comparison: MatchedPeriodComparison;
  readonly locale: DestinationLocale;
}) => {
  const deltas = comparison.deltas;
  if (!deltas) {
    return null;
  }
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const rows = [
    {
      label: copy.meanDifference,
      testID: 'compare-periods-mean-delta',
      value: signed(deltas.meanGlucoseMgDl, ' mg/dL'),
    },
    {
      label: copy.gmi,
      testID: 'compare-periods-gmi-delta',
      value: signed(deltas.gmiPercentagePoints, ' pp'),
    },
    {
      label: copy.cvDifference,
      testID: 'compare-periods-cv-delta',
      value: signed(deltas.coefficientOfVariationPercentagePoints, ' pp'),
    },
    {
      label: copy.veryLow,
      testID: 'compare-periods-very-low-delta',
      value: signed(deltas.veryLowRangePercentagePoints, ' pp'),
    },
    {
      label: copy.low,
      testID: 'compare-periods-low-delta',
      value: signed(deltas.lowRangePercentagePoints, ' pp'),
    },
    {
      label: copy.targetDifference,
      testID: 'compare-periods-target-delta',
      value: signed(deltas.targetRangePercentagePoints, ' pp'),
    },
    {
      label: copy.high,
      testID: 'compare-periods-high-delta',
      value: signed(deltas.highRangePercentagePoints, ' pp'),
    },
    {
      label: copy.veryHigh,
      testID: 'compare-periods-very-high-delta',
      value: signed(deltas.veryHighRangePercentagePoints, ' pp'),
    },
  ] as const;

  return (
    <>
      {rows.map(row => (
        <View key={row.testID} style={[styles.deltaRow, rtl && styles.rowReverse]}>
          <Text style={[styles.deltaLabel, rtl && styles.rtlText]}>
            {row.label}
          </Text>
          <Text style={styles.deltaValue} testID={row.testID}>
            {row.value}
          </Text>
        </View>
      ))}
    </>
  );
};

export const ComparePeriodsModuleView = ({
  locale,
  dataSource,
  thresholds,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  timeZoneOffsetMinutes = systemTimeZoneOffsetMinutes(),
}: ComparePeriodsModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [periodDays, setPeriodDays] = useState<PeriodDays>(14);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const selectedPeriod = useMemo<TrendsPeriod>(() => {
    const endMs = now();
    return {startMs: endMs - periodDays * DAY_MS, endMs};
  }, [now, periodDays]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    const previousPeriod = previousMatchedPeriod(selectedPeriod);
    setState({kind: 'loading'});

    Promise.all([
      dataSource.loadGlucoseSamples(selectedPeriod),
      dataSource.loadGlucoseSamples(previousPeriod),
    ])
      .then(([selectedSamples, previousSamples]) => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          comparison: buildMatchedPeriodComparison({
            current: {
              period: selectedPeriod,
              expectedSampleIntervalMs,
              thresholds,
              samples: selectedSamples,
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
    dataSource,
    expectedSampleIntervalMs,
    reload,
    selectedPeriod,
    thresholds,
    timeZoneOffsetMinutes,
  ]);

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="compare-periods-view"
      title={copy.title}>
      <ProductSection locale={locale} title={copy.period}>
        <View style={[styles.selector, rtl && styles.rowReverse]}>
          {PERIOD_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: days === periodDays}}
              key={days}
              onPress={() => setPeriodDays(days)}
              style={({pressed}) => [
                styles.selectorButton,
                days === periodDays && styles.selectorButtonSelected,
                pressed && styles.pressed,
              ]}
              testID={`compare-periods-range-${days}`}>
              <Text
                style={[
                  styles.selectorText,
                  days === periodDays && styles.selectorTextSelected,
                ]}>
                {days} {copy.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </ProductSection>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="compare-periods-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="compare-periods-error">
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
            ]}
            testID="compare-periods-retry">
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.evidence}>
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
          </ProductSection>
          <Text style={[styles.thresholdText, rtl && styles.rtlText]}>
            {copy.targetRange}: {thresholds.targetMinMgDl}–
            {thresholds.targetMaxMgDl} mg/dL
          </Text>
          <View
            style={[styles.periodPair, rtl && styles.rowReverse]}
            testID="compare-periods-pair">
            <PeriodCard
              label={copy.selected}
              locale={locale}
              overview={state.comparison.current}
            />
            <PeriodCard
              label={copy.previous}
              locale={locale}
              overview={state.comparison.previous}
            />
          </View>

          <ProductSection locale={locale} title={copy.differences}>
            <View style={styles.deltaCard} testID="compare-periods-deltas">
              <Text style={[styles.basisText, rtl && styles.rtlText]}>
                {copy.differenceBasis}
              </Text>
              {state.comparison.deltas ? (
                <ComparisonDeltaRows
                  comparison={state.comparison}
                  locale={locale}
                />
              ) : (
                <Text
                  style={[styles.stateText, rtl && styles.rtlText]}
                  testID="compare-periods-deltas-unavailable">
                  {copy.unavailable}
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
  selector: {flexDirection: 'row', flexWrap: 'wrap'},
  selectorButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  selectorButtonSelected: {backgroundColor: productUiTokens.colors.action},
  selectorText: {color: productUiTokens.colors.text, fontWeight: '700'},
  selectorTextSelected: {color: productUiTokens.colors.actionText},
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
  thresholdText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    marginTop: productUiTokens.spacing.md,
  },
  periodPair: {
    flexDirection: 'row',
    gap: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.sm,
  },
  periodCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: productUiTokens.spacing.md,
  },
  periodTitle: {color: productUiTokens.colors.text, fontWeight: '800'},
  dateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: productUiTokens.spacing.xs,
  },
  coverageValue: {
    color: productUiTokens.colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.md,
  },
  detailText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: productUiTokens.spacing.xs,
  },
  qualityText: {
    color: productUiTokens.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: productUiTokens.spacing.sm,
  },
  divider: {
    backgroundColor: productUiTokens.colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: productUiTokens.spacing.sm,
  },
  metricText: {
    color: productUiTokens.colors.text,
    fontSize: 12,
    lineHeight: 19,
  },
  deltaCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  basisText: {color: productUiTokens.colors.textMuted, fontSize: 12},
  deltaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: productUiTokens.spacing.md,
  },
  deltaLabel: {color: productUiTokens.colors.text, flex: 1},
  deltaValue: {
    color: productUiTokens.colors.text,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
});
