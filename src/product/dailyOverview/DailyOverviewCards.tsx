import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import type {
  DailyInsulinComparisonPresentation,
  DailyOverview,
} from '../../modules/dailyOverview';
import type {
  TrendsRangeDistribution,
  TrendsRangeThresholds,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {
  DailyOverviewCardId,
  StoredDailyOverviewPreferences,
} from '../personalization/types';
import {DAILY_OVERVIEW_COPY} from './copy';
import {
  DailyInsulinComparison,
  INSULIN_COLORS,
  InsulinSplitGraphic,
  insulinGraphicTotal,
} from './DailyInsulinComparison';

export const RANGE_COLORS = [
  '#FF6C81',
  '#FFA4AF',
  '#68DFC7',
  '#F4C276',
  '#E19650',
] as const;
const RANGE_KEYS = [
  'veryLowPercent',
  'lowPercent',
  'targetPercent',
  'highPercent',
  'veryHighPercent',
] as const;
const RANGE_LABELS = ['veryLow', 'low', 'target', 'high', 'veryHigh'] as const;
export const formatDailyValue = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toFixed(2))) : '—';

export const RangeGraphic = ({
  ranges,
  variant,
  miniature = false,
  dark = false,
  size = 152,
}: {
  readonly ranges: TrendsRangeDistribution;
  readonly variant: StoredDailyOverviewPreferences['rangeStyle'];
  readonly miniature?: boolean;
  readonly dark?: boolean;
  readonly size?: number;
}) => {
  const total = RANGE_KEYS.reduce((sum, key) => sum + ranges[key], 0);
  if (variant === 'ring') {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
      <Svg
        width={miniature ? 38 : size}
        height={miniature ? 38 : size}
        viewBox="0 0 152 152"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Circle
          cx={76}
          cy={76}
          r={radius}
          stroke={dark ? '#34445B' : '#E6EEEB'}
          strokeWidth={14}
          fill="none"
        />
        {RANGE_KEYS.map((key, index) => {
          const length = total > 0 ? (ranges[key] / total) * circumference : 0;
          const start = offset;
          offset += length;
          return length > 0 ? (
            <Circle
              key={key}
              cx={76}
              cy={76}
              r={radius}
              fill="none"
              stroke={RANGE_COLORS[index]!}
              strokeWidth={14}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-start}
              rotation={-90}
              origin="76, 76"
            />
          ) : null;
        })}
      </Svg>
    );
  }
  if (variant === 'bar') {
    return (
      <View
        style={[styles.rangeBar, miniature && styles.miniBar]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {RANGE_KEYS.map((key, index) =>
          ranges[key] > 0 ? (
            <View
              key={key}
              style={[
                styles.rangeSegment,
                {
                  flex: ranges[key],
                  backgroundColor: RANGE_COLORS[index],
                },
              ]}
            />
          ) : null,
        )}
      </View>
    );
  }
  return (
    <View
      style={styles.miniList}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {RANGE_COLORS.slice(1, 4).map(color => (
        <View key={color} style={styles.miniListRow}>
          <View style={[styles.dot, {backgroundColor: color}]} />
          <View style={styles.miniLine} />
        </View>
      ))}
    </View>
  );
};

export const dailyCardLabel = (
  id: DailyOverviewCardId,
  locale: DestinationLocale,
): string => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  return {
    ranges: copy.ranges,
    mean: copy.mean,
    glucose: copy.metrics,
    insulin: copy.insulin,
    coverage: copy.coverage,
  }[id];
};

export const DailyOverviewCard = ({
  id,
  overview,
  locale,
  rangeStyle,
  thresholds,
  compact = false,
  insulinComparison,
}: {
  readonly id: DailyOverviewCardId;
  readonly overview: DailyOverview;
  readonly locale: DestinationLocale;
  readonly rangeStyle: StoredDailyOverviewPreferences['rangeStyle'];
  readonly thresholds: TrendsRangeThresholds;
  readonly compact?: boolean;
  readonly insulinComparison?: DailyInsulinComparisonPresentation | undefined;
}) => {
  const [rangeDetails, setRangeDetails] = useState(false);
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtlText;
  const row = [styles.row, rtl && styles.reverse];
  const asOfTime =
    overview.isPartialDay && overview.observedPeriod
      ? new Date(overview.observedPeriod.endMs).toLocaleTimeString(
          locale === 'he' ? 'he-IL' : 'en-GB',
          {hour: '2-digit', minute: '2-digit', hour12: false},
        )
      : undefined;
  const value = (n: number | undefined, unit = '') =>
    n === undefined ? '—' : `${formatDailyValue(n)}${unit}`;
  if (compact) {
    const summary = {
      ranges: overview.ranges
        ? `${value(overview.ranges.targetPercent)}%`
        : '—',
      mean: value(overview.meanGlucoseMgDl, ' mg/dL'),
      glucose: `${value(overview.minimumGlucoseMgDl)} – ${value(
        overview.maximumGlucoseMgDl,
      )} mg/dL`,
      insulin:
        overview.insulinSummary.quality === 'available'
          ? value(overview.insulinSummary.totalUnits, ' U')
          : copy.noData,
      coverage: `${overview.coveragePercent}%`,
    }[id];
    return (
      <View style={[row, styles.compact]}>
        {id === 'ranges' && overview.ranges ? (
          <RangeGraphic
            ranges={overview.ranges}
            variant={rangeStyle}
            miniature
          />
        ) : null}
        {id === 'insulin' && overview.insulinSummary.quality === 'available' ? (
          <InsulinSplitGraphic
            insulin={overview.insulinSummary}
            miniature
            rtl={rtl}
          />
        ) : null}
        <Text style={[styles.compactValue, id === 'ranges' && styles.green]}>
          {summary}
        </Text>
      </View>
    );
  }

  if (id === 'ranges') {
    const ranges = overview.ranges;
    const thresholdLabels = [
      `<${thresholds.veryLowMaxMgDl}`,
      `${thresholds.veryLowMaxMgDl}–<${thresholds.targetMinMgDl}`,
      `${thresholds.targetMinMgDl}–${thresholds.targetMaxMgDl}`,
      `>${thresholds.targetMaxMgDl}–${thresholds.highMaxMgDl}`,
      `>${thresholds.highMaxMgDl}`,
    ];
    return (
      <View
        style={[styles.card, styles.darkCard]}
        testID="daily-overview-ranges">
        <View style={row}>
          <Text
            accessibilityRole="header"
            style={[styles.title, styles.lightText, align]}>
            {copy.ranges}
          </Text>
          <Text style={styles.tag}>TIR</Text>
        </View>
        {ranges ? (
          <View testID={`daily-overview-range-visual-${rangeStyle}`}>
            <>
              <View style={[row, styles.rangeHero]}>
                {rangeStyle === 'ring' ? (
                  <View style={styles.ring}>
                    <RangeGraphic
                      ranges={ranges}
                      variant="ring"
                      dark
                      size={136}
                    />
                    <View style={styles.ringCenter}>
                      <Text
                        style={styles.ringValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        testID="daily-overview-tir-hero"
                        accessibilityLabel={`${copy.ranges}: ${value(
                          ranges.targetPercent,
                        )}%`}>
                        {Math.round(ranges.targetPercent)}%
                      </Text>
                      <Text style={styles.greenLabel}>{copy.target}</Text>
                    </View>
                  </View>
                ) : (
                  <Text
                    style={styles.heroPercent}
                    testID="daily-overview-tir-hero"
                    accessibilityLabel={`${copy.ranges}: ${value(
                      ranges.targetPercent,
                    )}%`}>
                    {Math.round(ranges.targetPercent)}%
                  </Text>
                )}
                <View style={styles.rangeExplanation}>
                  <Text style={[styles.rangeEyebrow, align]}>
                    {copy.targetRange}
                  </Text>
                  <Text style={[styles.rangeTarget, rtl && styles.alignRight]}>
                    {thresholdLabels[2]}
                  </Text>
                  <Text style={[styles.rangeEyebrow, align]}>mg/dL</Text>
                  <View style={styles.rangeCoverageBadge}>
                    <Text
                      style={[
                        styles.rangeCoverageValue,
                        overview.coverageQuality !== 'adequate' &&
                          styles.darkWarning,
                      ]}>
                      {formatDailyValue(overview.coveragePercent)}%
                    </Text>
                    <Text style={[styles.rangeNote, align]}>
                      {overview.isPartialDay
                        ? copy.rangeCoverageSoFar
                        : copy.rangeCoverage}
                    </Text>
                    {asOfTime ? (
                      <Text style={[styles.rangeNote, align]}>
                        {copy.asOf} {asOfTime}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
              {rangeStyle === 'bar' ? (
                <RangeGraphic ranges={ranges} variant="bar" />
              ) : null}
            </>
            {rangeStyle !== 'list' ? (
              <>
                <View style={[row, styles.rangeSummary]}>
                  {[
                    {
                      label: copy.low,
                      percent: ranges.veryLowPercent + ranges.lowPercent,
                      color: RANGE_COLORS[1],
                    },
                    {
                      label: copy.target,
                      percent: ranges.targetPercent,
                      color: RANGE_COLORS[2],
                    },
                    {
                      label: copy.high,
                      percent: ranges.highPercent + ranges.veryHighPercent,
                      color: RANGE_COLORS[3],
                    },
                  ].map(item => (
                    <View key={item.label} style={styles.rangeSummaryCell}>
                      <Text
                        style={[
                          styles.rangeSummaryPercent,
                          {color: item.color},
                        ]}>
                        {value(item.percent)}%
                      </Text>
                      <Text style={styles.rangeSummaryLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  testID="daily-overview-range-details"
                  accessibilityRole="button"
                  accessibilityState={{expanded: rangeDetails}}
                  accessibilityLabel={
                    rangeDetails ? copy.hideRangeDetails : copy.rangeDetails
                  }
                  onPress={() => setRangeDetails(current => !current)}
                  style={[row, styles.rangeDetailsButton]}>
                  <Text style={[styles.rangeDetailsText, align]}>
                    {rangeDetails ? copy.hideRangeDetails : copy.rangeDetails}
                  </Text>
                  <Text style={styles.rangeDetailsText} accessible={false}>
                    {rangeDetails ? '−' : '+'}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {rangeDetails || rangeStyle === 'list' ? (
              <>
                <View style={styles.legend}>
                  {RANGE_KEYS.map((key, index) => (
                    <View
                      key={key}
                      style={[
                        row,
                        styles.legendRow,
                        index === 2 && styles.targetLegendRow,
                      ]}>
                      <View
                        style={[
                          styles.dot,
                          {backgroundColor: RANGE_COLORS[index]},
                        ]}
                      />
                      <Text style={[styles.legendLabel, align]}>
                        {copy[RANGE_LABELS[index]!]}
                      </Text>
                      <Text style={styles.threshold}>
                        {thresholdLabels[index]}
                      </Text>
                      <Text
                        style={[
                          styles.legendValue,
                          {color: RANGE_COLORS[index]},
                        ]}>
                        {value(ranges[key])}%
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.footnote, styles.darkFootnote, align]}>
                  {copy.basedOnReadings} · mg/dL
                </Text>
              </>
            ) : null}
            {overview.coverageQuality !== 'adequate' ? (
              <Text style={[styles.coverageMessage, styles.darkWarning, align]}>
                {copy.coverageLow}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyRange}>
            <Text style={styles.emptyRangeValue}>—</Text>
            <Text style={[styles.noData, styles.darkFootnote, align]}>
              {copy.noGlucose}
            </Text>
          </View>
        )}
      </View>
    );
  }
  if (id === 'mean') {
    return (
      <View style={[styles.card, styles.meanCard]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, styles.blue, align]}>
          {copy.mean}
        </Text>
        <Text
          style={[styles.meanValue, styles.blue]}
          testID="daily-overview-mean">
          {value(overview.meanGlucoseMgDl, ' mg/dL')}
        </Text>
        <Text style={[styles.small, align]}>{copy.metrics}</Text>
      </View>
    );
  }
  if (id === 'glucose') {
    return (
      <View style={styles.card} testID="daily-overview-glucose-metrics">
        <Text accessibilityRole="header" style={[styles.title, align]}>
          {copy.metrics}
        </Text>
        <View style={[row, styles.statsRow]}>
          {(
            [
              ['minimum', overview.minimumGlucoseMgDl, 'mg/dL'],
              ['maximum', overview.maximumGlucoseMgDl, 'mg/dL'],
              ['cv', overview.coefficientOfVariationPercent, '%'],
            ] as const
          ).map(([key, number, unit]) => (
            <View key={key} style={styles.stat}>
              <Text style={[styles.small, align]}>{copy[key]}</Text>
              <Text style={styles.statValue} testID={`daily-overview-${key}`}>
                {value(number)}
              </Text>
              <Text style={styles.small}>{unit}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (id === 'insulin') {
    const insulin = overview.insulinSummary;
    const rawTotal =
      insulin.quality === 'available' ? insulinGraphicTotal(insulin) : 0;
    const basalPercent =
      insulin.quality === 'available' && rawTotal > 0
        ? Math.round((insulin.basalUnits / rawTotal) * 100)
        : undefined;
    const bolusPercent =
      basalPercent === undefined ? undefined : 100 - basalPercent;
    return (
      <View style={[styles.card, styles.darkCard]}>
        <View style={row}>
          <Text
            accessibilityRole="header"
            style={[styles.title, styles.lightText, align]}>
            {copy.insulin}
          </Text>
          {insulin.quality === 'available' && insulin.basalEstimated ? (
            <Text style={styles.estimateTag}>{copy.estimated}</Text>
          ) : null}
        </View>
        {insulin.quality === 'available' ? (
          <View testID="daily-overview-insulin-metrics">
            <View style={[row, styles.insulinTotal]}>
              <Text
                style={[styles.small, styles.darkFootnote, styles.flex, align]}>
                {copy.total}
              </Text>
              <Text
                style={styles.totalValue}
                testID="daily-overview-insulin-total">
                {value(insulin.totalUnits, ' U')}
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={`${copy.insulinSplit}: ${copy.basal} ${
                basalPercent === undefined ? '—' : `${basalPercent}%`
              }, ${copy.bolus} ${
                bolusPercent === undefined ? '—' : `${bolusPercent}%`
              }`}>
              <InsulinSplitGraphic insulin={insulin} rtl={rtl} />
            </View>
            <View style={[row, styles.insulinSplit]}>
              {(['basal', 'bolus'] as const).map(key => (
                <View style={styles.insulinPart} key={key}>
                  <View style={row}>
                    <View
                      style={[
                        styles.dot,
                        {backgroundColor: INSULIN_COLORS[key]},
                      ]}
                    />
                    <Text style={[styles.small, styles.lightText, align]}>
                      {copy[key]}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.insulinPercent,
                      {color: INSULIN_COLORS[key]},
                    ]}
                    testID={`daily-overview-insulin-${key}-percent`}>
                    {(key === 'basal' ? basalPercent : bolusPercent) ===
                    undefined
                      ? '—'
                      : `${key === 'basal' ? basalPercent : bolusPercent}%`}
                  </Text>
                  <Text
                    style={styles.insulinValue}
                    testID={`daily-overview-insulin-${key}`}>
                    {value(
                      key === 'basal' ? insulin.basalUnits : insulin.bolusUnits,
                      ' U',
                    )}
                  </Text>
                </View>
              ))}
            </View>
            {rawTotal === 0 ? (
              <Text style={[styles.footnote, styles.darkFootnote, align]}>
                {copy.noRatio}
              </Text>
            ) : null}
            {insulin.basalEstimated ? (
              <Text style={[styles.footnote, styles.darkFootnote, align]}>
                {copy.insulinEstimateNote}
              </Text>
            ) : null}
            <DailyInsulinComparison
              today={insulin}
              comparison={insulinComparison}
              locale={locale}
            />
          </View>
        ) : (
          <Text style={[styles.noData, styles.darkFootnote, align]}>
            {copy.insulinUnavailable}
          </Text>
        )}
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.coverageCard]}>
      <View style={row}>
        <Text accessibilityRole="header" style={[styles.title, align]}>
          {copy.coverage}
        </Text>
        <Text style={styles.coverageValue} testID="daily-overview-coverage">
          {overview.coveragePercent}%
        </Text>
      </View>
      {asOfTime ? (
        <Text style={[styles.small, align]}>
          {copy.daySoFar} · {copy.asOf} {asOfTime}
        </Text>
      ) : null}
      <View style={styles.coverageTrack}>
        <View
          style={[
            styles.coverageFill,
            {
              width: `${overview.coveragePercent}%`,
            },
            overview.coverageQuality === 'adequate'
              ? styles.coverageAdequateFill
              : styles.coverageLowFill,
          ]}
        />
      </View>
      <View style={row}>
        <Text style={styles.small}>
          {overview.validSampleCount} / {overview.expectedSampleCount}
        </Text>
        <Text style={styles.small}>{copy.readings}</Text>
      </View>
      <Text
        style={[
          styles.coverageMessage,
          overview.coverageQuality !== 'adequate' && styles.warning,
          align,
        ]}>
        {overview.coverageQuality === 'no-data'
          ? copy.noGlucose
          : overview.coverageQuality === 'adequate'
          ? copy.coverageAdequate
          : copy.coverageLow}
      </Text>
      {overview.excludedSampleCount > 0 || overview.duplicateSampleCount > 0 ? (
        <Text style={[styles.footnote, align]}>
          {overview.excludedSampleCount} {copy.excluded}
          {' · '}
          {overview.duplicateSampleCount} {copy.duplicates}
        </Text>
      ) : null}
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
    padding: 18,
  },
  darkCard: {backgroundColor: '#111D2D', borderColor: '#34445B'},
  lightText: {color: '#F3F7FF'},
  darkFootnote: {color: '#A6B7CC'},
  darkWarning: {color: '#F4C276'},
  title: {fontSize: 17, fontWeight: '700', color: '#233D49', flex: 1},
  small: {fontSize: 12, color: '#647785'},
  tag: {
    fontSize: 11,
    color: '#68DFC7',
    backgroundColor: '#203B3D',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '800',
  },
  green: {color: '#138266'},
  blue: {color: '#225F8C'},
  rangeHero: {justifyContent: 'center', gap: 16, paddingVertical: 8},
  ring: {width: 136, height: 136},
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ringValue: {
    fontSize: 38,
    fontWeight: '800',
    color: '#68DFC7',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  greenLabel: {fontSize: 12, color: '#D7E3F3', marginTop: 2},
  rangeExplanation: {flex: 1, minWidth: 64},
  rangeTarget: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F3F7FF',
    writingDirection: 'ltr',
  },
  rangeEyebrow: {fontSize: 11, color: '#A6B7CC', marginVertical: 3},
  rangeCoverageBadge: {
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#1B2A3E',
  },
  rangeCoverageValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#D7E3F3',
    writingDirection: 'ltr',
  },
  rangeNote: {fontSize: 10, color: '#A6B7CC', lineHeight: 15, marginTop: 2},
  rangeSummary: {gap: 6, marginTop: 8},
  rangeSummaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#1B2A3E',
  },
  rangeSummaryPercent: {
    fontSize: 20,
    fontWeight: '800',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  rangeSummaryLabel: {fontSize: 10, color: '#D7E3F3', marginTop: 2},
  rangeDetailsButton: {
    minHeight: 40,
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  rangeDetailsText: {fontSize: 11, color: '#A6B7CC'},
  heroPercent: {
    fontSize: 52,
    fontWeight: '800',
    color: '#68DFC7',
    writingDirection: 'ltr',
  },
  rangeBar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E6EEEB',
    marginVertical: 10,
  },
  rangeSegment: {height: '100%'},
  miniBar: {width: 48, height: 12, marginVertical: 0},
  miniList: {width: 38, gap: 4},
  miniListRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  miniLine: {height: 3, backgroundColor: '#A7B7C2', flex: 1, borderRadius: 2},
  legend: {marginTop: 8, gap: 4},
  legendRow: {
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
  },
  targetLegendRow: {backgroundColor: '#203B3D'},
  dot: {width: 8, height: 8, borderRadius: 4},
  legendLabel: {flex: 1, color: '#D7E3F3', fontSize: 12},
  threshold: {fontSize: 10, color: '#A6B7CC', writingDirection: 'ltr'},
  legendValue: {
    width: 60,
    textAlign: 'right',
    color: '#F3F7FF',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  footnote: {fontSize: 10, color: '#73858C', marginTop: 7},
  noData: {color: '#647785', lineHeight: 21, marginTop: 12},
  emptyRange: {minHeight: 150, justifyContent: 'center'},
  emptyRangeValue: {fontSize: 48, color: '#A6B7CC', textAlign: 'center'},
  meanCard: {backgroundColor: '#EEF5FC', borderColor: '#D8E7F5'},
  meanValue: {
    fontSize: 30,
    fontWeight: '800',
    marginVertical: 8,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  statsRow: {marginTop: 16, alignItems: 'stretch'},
  stat: {flex: 1, minWidth: 0, gap: 4},
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#233D49',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  insulinTotal: {marginTop: 12, marginBottom: 20},
  totalValue: {
    fontSize: 42,
    fontWeight: '800',
    color: '#F3F7FF',
    writingDirection: 'ltr',
  },
  insulinSplit: {gap: 10, marginTop: 12},
  insulinPart: {
    flex: 1,
    backgroundColor: '#1B2A3E',
    borderRadius: 16,
    padding: 12,
    gap: 5,
  },
  estimateTag: {
    color: '#A6B7CC',
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#24354C',
    borderRadius: 7,
  },
  insulinPercent: {
    fontSize: 30,
    fontWeight: '800',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  insulinValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D7E3F3',
    writingDirection: 'ltr',
  },
  coverageCard: {backgroundColor: '#F2F7F5', borderColor: '#DFEAE4'},
  coverageValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#426C5D',
    writingDirection: 'ltr',
  },
  coverageTrack: {
    height: 5,
    backgroundColor: '#DAE6DF',
    borderRadius: 3,
    marginVertical: 14,
    overflow: 'hidden',
  },
  coverageFill: {height: '100%', borderRadius: 3},
  coverageAdequateFill: {backgroundColor: '#448A78'},
  coverageLowFill: {backgroundColor: '#A96B25'},
  coverageMessage: {
    fontSize: 12,
    lineHeight: 19,
    color: '#426C5D',
    marginTop: 10,
  },
  warning: {color: '#925615'},
  compact: {gap: 10},
  compactValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#344F62',
    writingDirection: 'ltr',
    flexShrink: 1,
  },
});
