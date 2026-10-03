import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import type {
  MatchedPeriodComparison,
  TrendsRangeDistribution,
  TrendsRangeThresholds,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {TrendsDaySummary} from './buildDailyTrends';
import {TRENDS_OVERVIEW_COPY} from './trendsOverviewCopy';

const BANDS = [
  {key: 'veryLowPercent', label: 'veryLow', color: '#C33E46'},
  {key: 'lowPercent', label: 'low', color: '#EE9143'},
  {key: 'targetPercent', label: 'target', color: '#169C79'},
  {key: 'highPercent', label: 'high', color: '#D7A51F'},
  {key: 'veryHighPercent', label: 'veryHigh', color: '#9266CB'},
] as const;

export const formatTrendValue = (value: number): string =>
  String(Number(value.toFixed(2)));

export const trendsDateLabel = (
  timestampMs: number,
  locale: DestinationLocale,
  offsetMinutes: number,
  short = false,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: short ? 'numeric' : 'short',
    timeZone: 'UTC',
  }).format(new Date(timestampMs + offsetMinutes * 60 * 1000));

const rangeThresholdLabels = (thresholds: TrendsRangeThresholds) => [
  `<${thresholds.veryLowMaxMgDl}`,
  `${thresholds.veryLowMaxMgDl}–<${thresholds.targetMinMgDl}`,
  `${thresholds.targetMinMgDl}–${thresholds.targetMaxMgDl}`,
  `>${thresholds.targetMaxMgDl}–${thresholds.highMaxMgDl}`,
  `>${thresholds.highMaxMgDl}`,
];

const RangeLegend = ({
  ranges,
  thresholds,
  locale,
}: {
  readonly ranges: TrendsRangeDistribution;
  readonly thresholds: TrendsRangeThresholds;
  readonly locale: DestinationLocale;
}) => {
  const copy = TRENDS_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const thresholdLabels = rangeThresholdLabels(thresholds);
  return (
    <View style={styles.legend}>
      {BANDS.map((band, index) => (
        <View key={band.key} style={[styles.legendRow, rtl && styles.reverse]}>
          <View style={[styles.dot, {backgroundColor: band.color}]} />
          <Text style={[styles.legendLabel, rtl && styles.rtlText]}>
            {copy[band.label]}
          </Text>
          <Text style={styles.threshold}>{thresholdLabels[index]}</Text>
          <Text style={styles.legendValue}>
            {formatTrendValue(ranges[band.key])}%
          </Text>
        </View>
      ))}
      <Text style={[styles.unitNote, rtl && styles.rtlText]}>mg/dL</Text>
    </View>
  );
};

export const TrendsRangeCard = ({
  ranges,
  thresholds,
  locale,
}: {
  readonly ranges: TrendsRangeDistribution;
  readonly thresholds: TrendsRangeThresholds;
  readonly locale: DestinationLocale;
}) => {
  const copy = TRENDS_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const circumference = 2 * Math.PI * 59;
  const total = BANDS.reduce((sum, band) => sum + ranges[band.key], 0);
  let offset = 0;
  return (
    <View style={styles.card} testID="trends-overview-ranges">
      <View style={[styles.row, rtl && styles.reverse]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, rtl && styles.rtlText]}>
          {copy.glucoseRanges}
        </Text>
        <Text style={styles.tag}>TIR</Text>
      </View>
      <View style={[styles.hero, rtl && styles.reverse]}>
        <View style={styles.ring} testID="trends-overview-range-ring">
          <Svg
            width={150}
            height={150}
            viewBox="0 0 150 150"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Circle
              cx={75}
              cy={75}
              r={59}
              stroke="#E5EFEB"
              strokeWidth={14}
              fill="none"
            />
            {BANDS.map(band => {
              const length =
                total > 0 ? (ranges[band.key] / total) * circumference : 0;
              const start = offset;
              offset += length;
              return length > 0 ? (
                <Circle
                  key={band.key}
                  cx={75}
                  cy={75}
                  r={59}
                  stroke={band.color}
                  strokeWidth={14}
                  fill="none"
                  strokeDasharray={`${length} ${circumference}`}
                  strokeDashoffset={-start}
                  rotation={-90}
                  origin="75, 75"
                />
              ) : null;
            })}
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.heroPercent} testID="trends-overview-tir">
              {formatTrendValue(ranges.targetPercent)}%
            </Text>
            <Text style={styles.targetLabel}>{copy.target}</Text>
          </View>
        </View>
        <View style={styles.heroDetail}>
          <Text style={[styles.small, rtl && styles.rtlText]}>
            {copy.targetRange}
          </Text>
          <Text style={[styles.targetThreshold, rtl && styles.alignRight]}>
            {thresholds.targetMinMgDl}–{thresholds.targetMaxMgDl}
          </Text>
          <Text style={[styles.small, rtl && styles.alignRight]}>mg/dL</Text>
          <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
            {copy.basedOnReadings}
          </Text>
        </View>
      </View>
      <RangeLegend ranges={ranges} thresholds={thresholds} locale={locale} />
    </View>
  );
};

export const TrendsDailyCard = ({
  days,
  locale,
  thresholds,
}: {
  readonly days: readonly TrendsDaySummary[];
  readonly locale: DestinationLocale;
  readonly thresholds: TrendsRangeThresholds;
}) => {
  const copy = TRENDS_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const {width} = useWindowDimensions();
  // Keep every day visible while retaining finger-sized controls on small phones.
  const pageSize = width < 350 ? 5 : width < 382 ? 6 : 7;
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, days.length - 1),
  );
  const [windowEnd, setWindowEnd] = useState(days.length);
  const start = Math.max(0, windowEnd - pageSize);
  const visibleDays = days.slice(start, windowEnd);
  const selectedDay = days[selectedIndex];
  if (!selectedDay) {
    return null;
  }
  const moveWindow = (direction: -1 | 1) => {
    const end = Math.max(
      Math.min(pageSize, days.length),
      Math.min(days.length, windowEnd + direction * pageSize),
    );
    setWindowEnd(end);
    setSelectedIndex(end - 1);
  };
  const periodLabel = (day: TrendsDaySummary) =>
    trendsDateLabel(
      day.localDayStartMs,
      locale,
      day.overview.timeZoneOffsetMinutes,
    );
  const selected = selectedDay.overview;
  return (
    <View style={styles.card} testID="trends-overview-daily">
      <Text
        accessibilityRole="header"
        style={[styles.title, rtl && styles.rtlText]}>
        {copy.dailyTitle}
      </Text>
      <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
        {copy.dailySubtitle}
      </Text>
      <View style={[styles.daysNavigation, rtl && styles.reverse]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.previous}
          accessibilityState={{disabled: start === 0}}
          disabled={start === 0}
          onPress={() => moveWindow(-1)}
          style={({pressed}) => [
            styles.dayNavButton,
            start === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="trends-days-previous">
          <Text style={styles.dayNavArrow}>{rtl ? '›' : '‹'}</Text>
        </Pressable>
        <Text style={styles.daysPeriod}>
          {periodLabel(visibleDays[0]!)} –{' '}
          {periodLabel(visibleDays[visibleDays.length - 1]!)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'he' ? 'הימים הבאים' : 'Next days'}
          accessibilityState={{disabled: windowEnd >= days.length}}
          disabled={windowEnd >= days.length}
          onPress={() => moveWindow(1)}
          style={({pressed}) => [
            styles.dayNavButton,
            windowEnd >= days.length && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="trends-days-next">
          <Text style={styles.dayNavArrow}>{rtl ? '‹' : '›'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.chartCaption, rtl && styles.rtlText]}>
        {copy.dayRange} · 0–100%
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartScroll}>
        <View style={[styles.dayChart, rtl && styles.reverse]}>
          {visibleDays.map((day, index) => {
            const dayIndex = start + index;
            const overview = day.overview;
            const selectedBar = selectedIndex === dayIndex;
            const percent = overview.ranges?.targetPercent;
            const label = `${periodLabel(day)} · ${
              percent === undefined
                ? copy.noDayData
                : `${copy.dayRange}: ${percent}%`
            } · ${copy.coverage}: ${overview.coveragePercent}%`;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                aria-pressed={selectedBar}
                accessibilityState={{selected: selectedBar}}
                key={day.localDayStartMs}
                onPress={() => setSelectedIndex(dayIndex)}
                style={({pressed}) => [
                  styles.dayColumn,
                  selectedBar && styles.dayColumnSelected,
                  pressed && styles.pressed,
                ]}
                testID={`trends-day-${dayIndex}`}>
                <Text
                  style={[
                    styles.dayPercent,
                    selectedBar && styles.dayPercentSelected,
                  ]}>
                  {percent === undefined ? '—' : `${Math.round(percent)}%`}
                </Text>
                <View
                  style={styles.dayTrack}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  {percent === undefined ? (
                    <Text style={styles.emptyBar}>–</Text>
                  ) : (
                    <View
                      style={[
                        styles.dayFill,
                        {height: `${percent}%`},
                        overview.coverageQuality !== 'adequate' &&
                          styles.lowCoverageFill,
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.dayLabel,
                    selectedBar && styles.dayPercentSelected,
                  ]}>
                  {trendsDateLabel(
                    day.localDayStartMs,
                    locale,
                    overview.timeZoneOffsetMinutes,
                    true,
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
        {copy.dailyCoverageNote}
      </Text>
      <View style={styles.selectedDay} testID="trends-selected-day">
        <View style={[styles.row, rtl && styles.reverse]}>
          <Text style={[styles.selectedDate, rtl && styles.rtlText]}>
            {periodLabel(selectedDay)}
          </Text>
          <Text
            style={[
              styles.coverageBadge,
              selected.coverageQuality !== 'adequate' &&
                styles.coverageBadgeLow,
            ]}>
            {copy.coverage} {selected.coveragePercent}%
          </Text>
        </View>
        {selected.meanGlucoseMgDl === undefined ? (
          <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
            {copy.noDayData}
          </Text>
        ) : (
          <View style={[styles.selectedMean, rtl && styles.reverse]}>
            <Text style={[styles.small, styles.flex, rtl && styles.rtlText]}>
              {copy.mean}
            </Text>
            <Text style={styles.selectedMeanValue}>
              {formatTrendValue(selected.meanGlucoseMgDl)} mg/dL
            </Text>
          </View>
        )}
        {selected.ranges ? (
          <RangeLegend
            ranges={selected.ranges}
            thresholds={thresholds}
            locale={locale}
          />
        ) : null}
        {selectedDay.partialDay ? (
          <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
            {copy.partialDay}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export const TrendsComparisonCard = ({
  comparison,
  locale,
}: {
  readonly comparison: MatchedPeriodComparison;
  readonly locale: DestinationLocale;
}) => {
  const copy = TRENDS_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const {current, previous, deltas} = comparison;
  const format = (value: number | undefined, suffix: string) =>
    value === undefined ? '—' : `${formatTrendValue(value)}${suffix}`;
  const metrics = deltas
    ? [
        {
          key: 'target',
          label: copy.targetDelta,
          current: current.ranges?.targetPercent,
          previous: previous.ranges?.targetPercent,
          delta: deltas.targetRangePercentagePoints,
          suffix: '%',
          deltaSuffix: ' pp',
        },
        {
          key: 'mean',
          label: copy.meanDelta,
          current: current.meanGlucoseMgDl,
          previous: previous.meanGlucoseMgDl,
          delta: deltas.meanGlucoseMgDl,
          suffix: ' mg/dL',
          deltaSuffix: ' mg/dL',
        },
        {
          key: 'cv',
          label: copy.cvDelta,
          current: current.coefficientOfVariationPercent,
          previous: previous.coefficientOfVariationPercent,
          delta: deltas.coefficientOfVariationPercentagePoints,
          suffix: '%',
          deltaSuffix: ' pp',
        },
      ]
    : [];
  return (
    <View style={styles.card} testID="trends-overview-comparison">
      <View style={[styles.comparisonPeriods, rtl && styles.reverse]}>
        {[
          {label: copy.current, overview: current},
          {label: copy.previous, overview: previous},
        ].map(period => (
          <View key={period.label} style={styles.comparisonPeriod}>
            <Text style={[styles.periodTitle, rtl && styles.rtlText]}>
              {period.label}
            </Text>
            <Text style={[styles.small, rtl && styles.rtlText]}>
              {trendsDateLabel(
                period.overview.period.startMs,
                locale,
                period.overview.timeZoneOffsetMinutes,
              )}{' '}
              –{' '}
              {trendsDateLabel(
                period.overview.period.endMs,
                locale,
                period.overview.timeZoneOffsetMinutes,
              )}
            </Text>
            <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
              {copy.coverage}: {period.overview.coveragePercent}%
            </Text>
          </View>
        ))}
      </View>
      {deltas ? (
        <>
          {metrics.map(metric => (
            <View key={metric.key} style={styles.comparisonMetric}>
              <View style={[styles.row, rtl && styles.reverse]}>
                <Text style={[styles.deltaLabel, rtl && styles.rtlText]}>
                  {metric.label}
                </Text>
                <Text
                  style={styles.deltaValue}
                  testID={`trends-comparison-${metric.key}-delta`}>
                  {metric.delta > 0 ? '+' : ''}
                  {formatTrendValue(metric.delta)}
                  {metric.deltaSuffix}
                </Text>
              </View>
              <View style={[styles.comparisonValues, rtl && styles.reverse]}>
                <Text style={styles.comparisonValue}>
                  {format(metric.current, metric.suffix)}
                </Text>
                <Text style={styles.comparisonPrevious}>
                  {format(metric.previous, metric.suffix)}
                </Text>
              </View>
            </View>
          ))}
          <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
            {copy.comparisonNote}
          </Text>
        </>
      ) : (
        <Text style={[styles.readingsNote, rtl && styles.rtlText]}>
          {copy.comparisonUnavailable}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  reverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  alignRight: {textAlign: 'right'},
  flex: {flex: 1},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E1E9EE',
    padding: 16,
  },
  title: {color: '#233D49', fontSize: 17, fontWeight: '700', flex: 1},
  small: {fontSize: 12, color: '#647785', lineHeight: 18},
  tag: {
    color: '#36806D',
    backgroundColor: '#EAF6F1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '800',
    fontSize: 11,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  ring: {width: 150, height: 150},
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPercent: {
    fontSize: 28,
    fontWeight: '800',
    color: '#138266',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  targetLabel: {fontSize: 12, color: '#138266', marginTop: 3},
  heroDetail: {flex: 1, minWidth: 60},
  targetThreshold: {
    color: '#24483D',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
    writingDirection: 'ltr',
  },
  readingsNote: {color: '#647785', fontSize: 12, lineHeight: 18, marginTop: 8},
  legend: {borderTopColor: '#EDF1F3', borderTopWidth: 1, paddingTop: 8, gap: 2},
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 32,
  },
  dot: {width: 8, height: 8, borderRadius: 4},
  legendLabel: {color: '#465B66', fontSize: 13, flex: 1},
  threshold: {fontSize: 10, color: '#72848D', writingDirection: 'ltr'},
  legendValue: {
    color: '#233D49',
    fontWeight: '700',
    fontSize: 13,
    width: 59,
    textAlign: 'right',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  unitNote: {fontSize: 10, color: '#73858C', marginTop: 3},
  daysNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayNavButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F0F5F7',
  },
  dayNavArrow: {fontSize: 30, lineHeight: 32, color: '#33576A'},
  daysPeriod: {
    fontSize: 12,
    fontWeight: '700',
    color: '#465B66',
    flexShrink: 1,
    textAlign: 'center',
  },
  disabled: {opacity: 0.3},
  pressed: {opacity: 0.65},
  chartCaption: {fontSize: 11, color: '#647785', marginVertical: 12},
  chartScroll: {flexGrow: 1},
  dayChart: {flex: 1, flexDirection: 'row', gap: 2},
  dayColumn: {
    flex: 1,
    minWidth: 44,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayColumnSelected: {backgroundColor: '#F1F7F5', borderColor: '#BBDACC'},
  dayPercent: {
    fontSize: 10,
    color: '#71818B',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  dayPercentSelected: {color: '#17674F', fontWeight: '700'},
  dayTrack: {
    width: 18,
    height: 96,
    backgroundColor: '#EDF2F3',
    borderRadius: 5,
    marginVertical: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dayFill: {width: '100%', backgroundColor: '#31A184', borderRadius: 4},
  lowCoverageFill: {opacity: 0.35},
  emptyBar: {color: '#91A2AB', marginBottom: 37},
  dayLabel: {fontSize: 10, color: '#647785', writingDirection: 'ltr'},
  selectedDay: {
    backgroundColor: '#F7FAFB',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  selectedDate: {color: '#233D49', fontWeight: '700', flex: 1, fontSize: 13},
  coverageBadge: {
    fontSize: 10,
    color: '#386E5B',
    backgroundColor: '#E7F1EC',
    borderRadius: 6,
    padding: 5,
  },
  coverageBadgeLow: {color: '#8C652C', backgroundColor: '#FCF0DC'},
  selectedMean: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 6,
  },
  selectedMeanValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#355B73',
    writingDirection: 'ltr',
  },
  comparisonPeriods: {flexDirection: 'row', gap: 12, marginBottom: 6},
  comparisonPeriod: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F2F6F8',
    padding: 10,
    borderRadius: 12,
    gap: 4,
  },
  periodTitle: {fontSize: 12, color: '#3E5C6B', fontWeight: '700'},
  comparisonMetric: {
    paddingVertical: 14,
    borderBottomColor: '#EDF1F3',
    borderBottomWidth: 1,
  },
  deltaLabel: {flex: 1, color: '#465B66', fontSize: 13},
  deltaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#415D72',
    backgroundColor: '#EDF2F6',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    writingDirection: 'ltr',
  },
  comparisonValues: {flexDirection: 'row', gap: 12, marginTop: 10},
  comparisonValue: {
    flex: 1,
    color: '#233D49',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  comparisonPrevious: {
    flex: 1,
    color: '#647785',
    fontSize: 17,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
});
