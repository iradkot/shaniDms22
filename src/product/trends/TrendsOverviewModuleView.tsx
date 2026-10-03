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
import {buildDailyTrends, type TrendsDaySummary} from './buildDailyTrends';
import {
  TrendsComparisonCard,
  TrendsDailyCard,
  TrendsRangeCard,
  formatTrendValue,
  trendsDateLabel,
} from './TrendsOverviewCards';
import {TRENDS_OVERVIEW_COPY} from './trendsOverviewCopy';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const RANGE_DAYS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_DAYS)[number];

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'; readonly message: string}
  | {
      readonly kind: 'ready';
      readonly comparison: MatchedPeriodComparison;
      readonly days: readonly TrendsDaySummary[];
    };

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
  const copy = TRENDS_OVERVIEW_COPY[locale];
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
          days: buildDailyTrends({
            period: currentPeriod,
            expectedSampleIntervalMs,
            thresholds,
            samples: currentSamples,
            timeZoneOffsetMinutes,
          }),
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

  const current = state.kind === 'ready' ? state.comparison.current : undefined;
  const qualityMessage =
    current?.coverageQuality === 'no-data'
      ? copy.noData
      : current?.interpretationQuality === 'representative'
      ? copy.adequateCoverage
      : current?.durationQuality === 'short'
      ? copy.shortPeriod
      : copy.lowCoverage;

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="trends-overview-view"
      title={copy.title}>
      <View style={styles.periodCard}>
        <View style={[styles.rangeSelector, rtl && styles.rowReverse]}>
          {RANGE_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              aria-selected={days === rangeDays}
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
        <Text style={[styles.periodDates, rtl && styles.rtlText]}>
          {trendsDateLabel(
            currentPeriod.startMs,
            locale,
            timeZoneOffsetMinutes,
          )}{' '}
          –{' '}
          {trendsDateLabel(currentPeriod.endMs, locale, timeZoneOffsetMinutes)}
        </Text>
      </View>

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
          <View style={styles.coverageCard}>
            <View style={[styles.row, rtl && styles.rowReverse]}>
              <Text style={[styles.coverageTitle, rtl && styles.rtlText]}>
                {copy.coverage}
              </Text>
              <Text
                style={[
                  styles.coverageValue,
                  state.comparison.current.coverageQuality !== 'adequate' &&
                    styles.warningText,
                ]}
                testID="trends-overview-coverage">
                {state.comparison.current.coveragePercent}%
              </Text>
            </View>
            <View
              style={styles.coverageTrack}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <View
                style={[
                  styles.coverageFill,
                  {width: `${state.comparison.current.coveragePercent}%`},
                  state.comparison.current.coverageQuality !== 'adequate' &&
                    styles.warningFill,
                ]}
              />
            </View>
            <View style={[styles.row, rtl && styles.rowReverse]}>
              <Text style={[styles.coverageDetail, rtl && styles.rtlText]}>
                {copy.samples}
              </Text>
              <Text style={[styles.coverageDetail, styles.ltrText]}>
                {state.comparison.current.validSampleCount} /{' '}
                {state.comparison.current.expectedSampleCount}
              </Text>
            </View>
            <Text
              style={[
                styles.coverageMessage,
                state.comparison.current.interpretationQuality !==
                  'representative' && styles.warningText,
                rtl && styles.rtlText,
              ]}>
              {qualityMessage}
            </Text>
          </View>

          {state.comparison.current.ranges ? (
            <View style={styles.cardSpacing}>
              <TrendsRangeCard
                ranges={state.comparison.current.ranges}
                thresholds={thresholds}
                locale={locale}
              />
            </View>
          ) : null}

          {state.comparison.current.meanGlucoseMgDl !== undefined &&
          state.comparison.current.coefficientOfVariationPercent !==
            undefined ? (
            <ProductSection locale={locale} title={copy.metrics}>
              <View testID="trends-overview-metrics">
                <View style={styles.meanCard}>
                  <Text style={[styles.metricLabel, rtl && styles.rtlText]}>
                    {copy.mean}
                  </Text>
                  <Text style={styles.meanValue} testID="trends-overview-mean">
                    {formatTrendValue(state.comparison.current.meanGlucoseMgDl)}{' '}
                    mg/dL
                  </Text>
                  <Text style={[styles.metricNote, rtl && styles.rtlText]}>
                    {copy.basedOnReadings}
                  </Text>
                </View>
                <View style={[styles.metricsRow, rtl && styles.rowReverse]}>
                  {state.comparison.current.gmiPercent !== undefined ? (
                    <View style={styles.metricCard}>
                      <Text
                        style={[styles.metricLabel, rtl && styles.alignRight]}>
                        {copy.gmi}
                      </Text>
                      <Text
                        style={styles.metricValue}
                        testID="trends-overview-gmi">
                        {formatTrendValue(state.comparison.current.gmiPercent)}%
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.metricCard}>
                    <Text
                      style={[styles.metricLabel, rtl && styles.alignRight]}>
                      {copy.cv}
                    </Text>
                    <Text
                      style={styles.metricValue}
                      testID="trends-overview-cv">
                      {formatTrendValue(
                        state.comparison.current.coefficientOfVariationPercent,
                      )}
                      %
                    </Text>
                    <Text style={[styles.metricNote, rtl && styles.rtlText]}>
                      {copy.cvNote}
                    </Text>
                  </View>
                </View>
              </View>
              {state.comparison.current.gmiPercent !== undefined ? (
                <Text style={[styles.metricNote, rtl && styles.rtlText]}>
                  {copy.gmiNote}
                </Text>
              ) : null}
            </ProductSection>
          ) : null}

          {state.comparison.current.ranges ? (
            <View style={styles.cardSpacing}>
              <TrendsDailyCard
                key={`${currentPeriod.startMs}-${currentPeriod.endMs}`}
                days={state.days}
                locale={locale}
                thresholds={thresholds}
              />
            </View>
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
              <Text style={[styles.hypoButtonText, rtl && styles.rtlText]}>
                {copy.investigateLow}
              </Text>
              <Text style={styles.hypoArrow}>{rtl ? '‹' : '›'}</Text>
            </Pressable>
          ) : null}

          <ProductSection locale={locale} title={copy.comparison}>
            <TrendsComparisonCard
              comparison={state.comparison}
              locale={locale}
            />
          </ProductSection>

          {showGri && state.comparison.current.gri ? (
            <ProductSection locale={locale} title={copy.gri}>
              <View style={styles.griCard} testID="trends-overview-gri">
                <Text
                  style={styles.griScore}
                  testID="trends-overview-gri-score">
                  {state.comparison.current.gri.score}
                </Text>
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.griHypo}:{' '}
                  {state.comparison.current.gri.hypoglycemiaComponent}
                </Text>
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.griHyper}:{' '}
                  {state.comparison.current.gri.hyperglycemiaComponent}
                </Text>
              </View>
            </ProductSection>
          ) : null}

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
            {state.comparison.current.excludedSampleCount > 0 ||
            state.comparison.current.duplicateSampleCount > 0 ? (
              <Text style={[styles.metricNote, rtl && styles.rtlText]}>
                {state.comparison.current.excludedSampleCount} {copy.excluded} ·{' '}
                {state.comparison.current.duplicateSampleCount}{' '}
                {copy.duplicates}
              </Text>
            ) : null}
          </ProductSection>
        </>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  alignRight: {textAlign: 'right'},
  ltrText: {writingDirection: 'ltr'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  periodCard: {marginTop: 22},
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#EAF0F4',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  rangeButton: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
  },
  rangeButtonSelected: {backgroundColor: '#255E7F'},
  rangeButtonText: {color: '#536C7D', fontWeight: '700', fontSize: 14},
  rangeButtonTextSelected: {color: '#FFFFFF'},
  periodDates: {color: '#536C7D', fontSize: 12, marginTop: 12},
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginTop: 16,
    padding: 24,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  coverageCard: {
    backgroundColor: '#F2F7F5',
    borderColor: '#DFEAE4',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 15,
  },
  coverageTitle: {flex: 1, fontSize: 13, color: '#496859', fontWeight: '700'},
  coverageValue: {
    color: '#426C5D',
    fontSize: 23,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  coverageTrack: {
    height: 5,
    backgroundColor: '#DAE6DF',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 10,
  },
  coverageFill: {height: '100%', backgroundColor: '#448A78', borderRadius: 3},
  warningFill: {backgroundColor: '#A96B25'},
  coverageDetail: {color: '#647785', fontSize: 11},
  coverageMessage: {
    color: '#426C5D',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  warningText: {color: '#925615'},
  cardSpacing: {marginTop: 16},
  meanCard: {
    backgroundColor: '#EEF5FC',
    borderColor: '#D8E7F5',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  metricLabel: {color: '#536C7D', fontSize: 13, fontWeight: '600'},
  meanValue: {
    color: '#225F8C',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 9,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E9EE',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  metricValue: {
    color: '#344F62',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 8,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  metricNote: {color: '#647785', fontSize: 12, lineHeight: 18, marginTop: 8},
  griCard: {
    backgroundColor: '#F6F3FA',
    borderColor: '#E2D9F0',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  griScore: {
    color: '#685388',
    fontSize: 32,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  hypoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderColor: '#F4DEC0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hypoButtonText: {
    flex: 1,
    color: '#986227',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 20,
  },
  hypoArrow: {color: '#986227', fontSize: 24},
});
