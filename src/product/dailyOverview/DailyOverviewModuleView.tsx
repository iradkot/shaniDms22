import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  DailyOverview,
  DailyOverviewDataSource,
  DailyOverviewPeriod,
} from '../../modules/dailyOverview';
import {
  buildDailyOverview,
  getLocalDayPeriod,
  localDayStart,
  moveLocalDay,
} from '../../modules/dailyOverview';
import type {
  TrendsRangeDistribution,
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

const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

const COPY = {
  en: {
    title: 'Daily overview',
    subtitle: 'A compact factual view of one local day.',
    previous: 'Previous',
    next: 'Next',
    today: 'Today',
    loading: 'Loading this day…',
    failed: 'This day could not be loaded.',
    retry: 'Try again',
    coverage: 'Data coverage',
    readings: 'readings',
    excluded: 'excluded',
    duplicates: 'duplicates removed',
    coverageAdequate: 'Coverage is at least 70% for this day.',
    coverageLow: 'Coverage is below 70% for this day.',
    noGlucose: 'No valid glucose readings are available for this day.',
    ranges: 'Glucose ranges',
    veryLow: 'Very low',
    low: 'Low',
    target: 'In range',
    high: 'High',
    veryHigh: 'Very high',
    metrics: 'Daily glucose',
    mean: 'Mean',
    minimum: 'Minimum',
    maximum: 'Maximum',
    cv: 'CV',
    insulin: 'Insulin',
    total: 'Total',
    basal: 'Basal',
    bolus: 'Bolus',
    insulinUnavailable: 'Insulin data is unavailable for this day.',
  },
  he: {
    title: 'מבט יומי',
    subtitle: 'תצוגה עובדתית ותמציתית של יום מקומי אחד.',
    previous: 'הקודם',
    next: 'הבא',
    today: 'היום',
    loading: 'טוען את היום…',
    failed: 'לא הצלחנו לטעון את היום הזה.',
    retry: 'ניסיון נוסף',
    coverage: 'כיסוי נתונים',
    readings: 'קריאות',
    excluded: 'הוחרגו',
    duplicates: 'כפילויות הוסרו',
    coverageAdequate: 'הכיסוי ביום הזה הוא לפחות 70%.',
    coverageLow: 'הכיסוי ביום הזה נמוך מ־70%.',
    noGlucose: 'אין קריאות סוכר תקינות זמינות ליום הזה.',
    ranges: 'טווחי סוכר',
    veryLow: 'נמוך מאוד',
    low: 'נמוך',
    target: 'בטווח',
    high: 'גבוה',
    veryHigh: 'גבוה מאוד',
    metrics: 'סוכר יומי',
    mean: 'ממוצע',
    minimum: 'מינימום',
    maximum: 'מקסימום',
    cv: 'CV',
    insulin: 'אינסולין',
    total: 'סה״כ',
    basal: 'בזאל',
    bolus: 'בולוס',
    insulinUnavailable: 'נתוני אינסולין אינם זמינים ליום זה.',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly overview: DailyOverview};

export interface DailyOverviewModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: DailyOverviewDataSource;
  readonly thresholds: TrendsRangeThresholds;
  /** A transient Shell focus. Non-day focus kinds are safely ignored. */
  readonly focus?: DestinationFocus;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
}

const systemNow = (): number => Date.now();

const RANGE_PRESENTATION: readonly {
  readonly key: keyof TrendsRangeDistribution;
  readonly copyKey: 'veryLow' | 'low' | 'target' | 'high' | 'veryHigh';
  readonly color: string;
}[] = [
  {key: 'veryLowPercent', copyKey: 'veryLow', color: '#B42318'},
  {key: 'lowPercent', copyKey: 'low', color: '#F97316'},
  {key: 'targetPercent', copyKey: 'target', color: '#159A67'},
  {key: 'highPercent', copyKey: 'high', color: '#D59A00'},
  {key: 'veryHighPercent', copyKey: 'veryHigh', color: '#7C3AED'},
];

const formatUnits = (value: number): string => `${value} U`;

const MetricCard = ({
  accent,
  label,
  testID,
  value,
}: {
  readonly accent: string;
  readonly label: string;
  readonly testID: string;
  readonly value: string;
}) => (
  <View style={[styles.metricCard, {borderTopColor: accent}]}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue} testID={testID}>
      {value}
    </Text>
  </View>
);

const initialDay = (
  focus: DestinationFocus | undefined,
  now: () => number,
): number =>
  localDayStart(focus?.kind === 'day' ? focus.dayStartMs : now());

export const DailyOverviewModuleView = ({
  locale,
  dataSource,
  thresholds,
  focus,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
}: DailyOverviewModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const focusedDayStartMs =
    focus?.kind === 'day' ? localDayStart(focus.dayStartMs) : undefined;
  const [selectedDayStartMs, setSelectedDayStartMs] = useState(() =>
    initialDay(focus, now),
  );
  const [reloadSequence, setReloadSequence] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const todayStartMs = localDayStart(now());
  const selectedPeriod = useMemo<DailyOverviewPeriod>(
    () => getLocalDayPeriod(selectedDayStartMs),
    [selectedDayStartMs],
  );
  const isToday = selectedDayStartMs >= todayStartMs;

  useEffect(() => {
    if (focusedDayStartMs !== undefined) {
      setSelectedDayStartMs(focusedDayStartMs);
    }
  }, [focusedDayStartMs]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    setState({kind: 'loading'});
    dataSource
      .loadDailyOverview(selectedPeriod)
      .then(source => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          overview: buildDailyOverview({
            period: selectedPeriod,
            expectedSampleIntervalMs,
            thresholds,
            source,
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
  }, [
    dataSource,
    expectedSampleIntervalMs,
    reloadSequence,
    selectedPeriod,
    thresholds,
  ]);

  const moveSelection = (delta: -1 | 1): void => {
    if (delta === 1 && isToday) {
      return;
    }
    const moved = moveLocalDay(selectedDayStartMs, delta);
    setSelectedDayStartMs(Math.min(moved, todayStartMs));
  };

  const formattedDay = new Date(selectedDayStartMs).toLocaleDateString(
    locale === 'he' ? 'he-IL' : 'en-US',
    {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'},
  );

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="daily-overview-view"
      title={copy.title}>
      <View
        style={[styles.dayControls, rtl && styles.rowReverse]}
        testID="daily-overview-day-controls">
        <Pressable
          accessibilityLabel={copy.previous}
          accessibilityRole="button"
          onPress={() => moveSelection(-1)}
          style={({pressed}) => [
            styles.dayButton,
            pressed && styles.pressed,
          ]}
          testID="daily-overview-previous">
          <Text style={styles.dayButtonText}>{copy.previous}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: isToday}}
          onPress={() => setSelectedDayStartMs(todayStartMs)}
          style={({pressed}) => [
            styles.todayButton,
            isToday && styles.todayButtonSelected,
            pressed && styles.pressed,
          ]}
          testID="daily-overview-today">
          <Text
            style={[
              styles.todayButtonText,
              isToday && styles.todayButtonTextSelected,
            ]}>
            {copy.today}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={copy.next}
          accessibilityRole="button"
          accessibilityState={{disabled: isToday}}
          disabled={isToday}
          onPress={() => moveSelection(1)}
          style={({pressed}) => [
            styles.dayButton,
            isToday && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="daily-overview-next">
          <Text style={styles.dayButtonText}>{copy.next}</Text>
        </Pressable>
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.dayTitle, rtl && styles.rtlText]}
        testID="daily-overview-selected-day">
        {formattedDay}
      </Text>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="daily-overview-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="daily-overview-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReloadSequence(value => value + 1)}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
            testID="daily-overview-retry">
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <View testID="daily-overview-content">
          <ProductSection locale={locale} title={copy.coverage}>
            <View style={styles.coverageCard}>
              <Text
                style={styles.coverageValue}
                testID="daily-overview-coverage">
                {`${state.overview.coveragePercent}%`}
              </Text>
              <Text style={[styles.detailText, rtl && styles.rtlText]}>
                {state.overview.validSampleCount} /{' '}
                {state.overview.expectedSampleCount} {copy.readings}
              </Text>
              {state.overview.excludedSampleCount > 0 ||
              state.overview.duplicateSampleCount > 0 ? (
                <Text style={[styles.detailText, rtl && styles.rtlText]}>
                  {state.overview.excludedSampleCount} {copy.excluded}
                  {' · '}
                  {state.overview.duplicateSampleCount} {copy.duplicates}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.coverageMessage,
                  state.overview.coverageQuality !== 'adequate' &&
                    styles.coverageWarning,
                  rtl && styles.rtlText,
                ]}>
                {state.overview.coverageQuality === 'no-data'
                  ? copy.noGlucose
                  : state.overview.coverageQuality === 'adequate'
                  ? copy.coverageAdequate
                  : copy.coverageLow}
              </Text>
            </View>
          </ProductSection>

          {state.overview.ranges ? (
            <ProductSection locale={locale} title={copy.ranges}>
              <View style={styles.rangeCard} testID="daily-overview-ranges">
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
                      {`${state.overview.ranges?.[item.key]}%`}
                    </Text>
                  </View>
                ))}
              </View>
            </ProductSection>
          ) : null}

          {state.overview.meanGlucoseMgDl !== undefined &&
          state.overview.minimumGlucoseMgDl !== undefined &&
          state.overview.maximumGlucoseMgDl !== undefined &&
          state.overview.coefficientOfVariationPercent !== undefined ? (
            <ProductSection locale={locale} title={copy.metrics}>
              <ResponsiveGrid
                locale={locale}
                testID="daily-overview-glucose-metrics">
                <MetricCard
                  accent="#1769AA"
                  label={copy.mean}
                  testID="daily-overview-mean"
                  value={`${state.overview.meanGlucoseMgDl} mg/dL`}
                />
                <MetricCard
                  accent="#159A67"
                  label={copy.minimum}
                  testID="daily-overview-minimum"
                  value={`${state.overview.minimumGlucoseMgDl} mg/dL`}
                />
                <MetricCard
                  accent="#D97706"
                  label={copy.maximum}
                  testID="daily-overview-maximum"
                  value={`${state.overview.maximumGlucoseMgDl} mg/dL`}
                />
                <MetricCard
                  accent="#7C3AED"
                  label={copy.cv}
                  testID="daily-overview-cv"
                  value={`${state.overview.coefficientOfVariationPercent}%`}
                />
              </ResponsiveGrid>
            </ProductSection>
          ) : null}

          <ProductSection locale={locale} title={copy.insulin}>
            {state.overview.insulinSummary.quality === 'available' ? (
              <ResponsiveGrid
                locale={locale}
                testID="daily-overview-insulin-metrics">
                <MetricCard
                  accent="#0F766E"
                  label={copy.total}
                  testID="daily-overview-insulin-total"
                  value={formatUnits(
                    state.overview.insulinSummary.totalUnits,
                  )}
                />
                <MetricCard
                  accent="#2563EB"
                  label={copy.basal}
                  testID="daily-overview-insulin-basal"
                  value={formatUnits(
                    state.overview.insulinSummary.basalUnits,
                  )}
                />
                <MetricCard
                  accent="#C2410C"
                  label={copy.bolus}
                  testID="daily-overview-insulin-bolus"
                  value={formatUnits(
                    state.overview.insulinSummary.bolusUnits,
                  )}
                />
              </ResponsiveGrid>
            ) : (
              <View style={styles.unavailableCard}>
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.insulinUnavailable}
                </Text>
              </View>
            )}
          </ProductSection>
        </View>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  dayControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: productUiTokens.spacing.lg,
  },
  dayButton: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  dayButtonText: {color: productUiTokens.colors.text, fontWeight: '700'},
  todayButton: {
    alignItems: 'center',
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  todayButtonSelected: {backgroundColor: productUiTokens.colors.action},
  todayButtonText: {color: productUiTokens.colors.action},
  todayButtonTextSelected: {
    color: productUiTokens.colors.actionText,
    fontWeight: '800',
  },
  dayTitle: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.md,
    textAlign: 'center',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.xl,
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
    padding: productUiTokens.spacing.lg,
  },
  coverageValue: {color: '#047857', fontSize: 30, fontWeight: '800'},
  detailText: {color: productUiTokens.colors.textMuted, marginTop: 3},
  coverageMessage: {color: '#047857', fontWeight: '700', marginTop: 8},
  coverageWarning: {color: '#9A3412'},
  rangeCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.md,
  },
  rangeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 36,
    paddingVertical: productUiTokens.spacing.xs,
  },
  rangeDot: {borderRadius: 6, height: 12, marginHorizontal: 8, width: 12},
  rangeLabel: {color: productUiTokens.colors.text, flex: 1, fontSize: 14},
  rangeValue: {color: productUiTokens.colors.text, fontWeight: '800'},
  metricCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderTopWidth: 4,
    borderWidth: 1,
    minHeight: 88,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  metricLabel: {color: productUiTokens.colors.textMuted, fontSize: 13},
  metricValue: {
    color: productUiTokens.colors.text,
    fontSize: 19,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.sm,
  },
  unavailableCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
});
