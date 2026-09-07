import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import type {DailyOverview} from '../../modules/dailyOverview';
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

export const RANGE_COLORS = [
  '#C33E46',
  '#EE9143',
  '#169C79',
  '#D7A51F',
  '#9266CB',
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
}: {
  readonly ranges: TrendsRangeDistribution;
  readonly variant: StoredDailyOverviewPreferences['rangeStyle'];
  readonly miniature?: boolean;
}) => {
  const total = RANGE_KEYS.reduce((sum, key) => sum + ranges[key], 0);
  if (variant === 'ring') {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
      <Svg
        width={miniature ? 38 : 152}
        height={miniature ? 38 : 152}
        viewBox="0 0 152 152"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Circle
          cx={76}
          cy={76}
          r={radius}
          stroke="#E6EEEB"
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
              style={{
                flex: ranges[key],
                backgroundColor: RANGE_COLORS[index],
                height: '100%',
              }}
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
}: {
  readonly id: DailyOverviewCardId;
  readonly overview: DailyOverview;
  readonly locale: DestinationLocale;
  readonly rangeStyle: StoredDailyOverviewPreferences['rangeStyle'];
  readonly thresholds: TrendsRangeThresholds;
  readonly compact?: boolean;
}) => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtlText;
  const row = [styles.row, rtl && styles.reverse];
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
      <View style={styles.card} testID="daily-overview-ranges">
        <View style={row}>
          <Text accessibilityRole="header" style={[styles.title, align]}>
            {copy.ranges}
          </Text>
          <Text style={styles.tag}>TIR</Text>
        </View>
        {ranges ? (
          <View testID={`daily-overview-range-visual-${rangeStyle}`}>
            {rangeStyle !== 'list' ? (
              <>
                <View style={[row, styles.rangeHero]}>
                  {rangeStyle === 'ring' ? (
                    <View style={styles.ring}>
                      <RangeGraphic ranges={ranges} variant="ring" />
                      <View style={styles.ringCenter}>
                        <Text style={styles.ringValue}>
                          {value(ranges.targetPercent)}%
                        </Text>
                        <Text style={styles.greenLabel}>{copy.target}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.heroPercent}>
                      {value(ranges.targetPercent)}%
                    </Text>
                  )}
                  <View style={styles.rangeExplanation}>
                    <Text
                      style={[styles.rangeTarget, rtl && styles.alignRight]}>
                      {thresholdLabels[2]}
                    </Text>
                    <Text style={[styles.small, align]}>mg/dL</Text>
                    <Text style={[styles.rangeNote, align]}>
                      {copy.basedOnReadings}
                    </Text>
                  </View>
                </View>
                {rangeStyle === 'bar' ? (
                  <RangeGraphic ranges={ranges} variant="bar" />
                ) : null}
              </>
            ) : null}
            <View style={styles.legend}>
              {RANGE_KEYS.map((key, index) => (
                <View key={key} style={[row, styles.legendRow]}>
                  <View
                    style={[styles.dot, {backgroundColor: RANGE_COLORS[index]}]}
                  />
                  <Text style={[styles.legendLabel, align]}>
                    {copy[RANGE_LABELS[index]!]}
                  </Text>
                  <Text style={styles.threshold}>{thresholdLabels[index]}</Text>
                  <Text style={styles.legendValue}>{value(ranges[key])}%</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.footnote, align]}>
              {rangeStyle === 'list' ? `${copy.basedOnReadings} · ` : ''}mg/dL
            </Text>
            {overview.coverageQuality !== 'adequate' ? (
              <Text style={[styles.coverageMessage, styles.warning, align]}>
                {copy.coverageLow}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.noData, align]}>{copy.noGlucose}</Text>
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
    return (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, align]}>
          {copy.insulin}
        </Text>
        {insulin.quality === 'available' ? (
          <View testID="daily-overview-insulin-metrics">
            <View style={[row, styles.insulinTotal]}>
              <Text style={[styles.small, styles.flex, align]}>
                {copy.total}
              </Text>
              <Text
                style={styles.totalValue}
                testID="daily-overview-insulin-total">
                {value(insulin.totalUnits, ' U')}
              </Text>
            </View>
            <View style={[row, styles.insulinSplit]}>
              {(['basal', 'bolus'] as const).map(key => (
                <View style={styles.insulinPart} key={key}>
                  <Text style={[styles.small, align]}>{copy[key]}</Text>
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
          </View>
        ) : (
          <Text style={[styles.noData, align]}>{copy.insulinUnavailable}</Text>
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
      <View style={styles.coverageTrack}>
        <View
          style={[
            styles.coverageFill,
            {
              width: `${overview.coveragePercent}%`,
              backgroundColor:
                overview.coverageQuality === 'adequate' ? '#448A78' : '#A96B25',
            },
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
  title: {fontSize: 17, fontWeight: '700', color: '#233D49', flex: 1},
  small: {fontSize: 12, color: '#647785'},
  tag: {
    fontSize: 11,
    color: '#36806D',
    backgroundColor: '#EAF6F1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '800',
  },
  green: {color: '#138266'},
  blue: {color: '#225F8C'},
  rangeHero: {justifyContent: 'center', gap: 12, paddingVertical: 10},
  ring: {width: 152, height: 152},
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#138266',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  greenLabel: {fontSize: 12, color: '#138266', marginTop: 2},
  rangeExplanation: {flex: 1, minWidth: 64},
  rangeTarget: {
    fontSize: 17,
    fontWeight: '700',
    color: '#24483D',
    writingDirection: 'ltr',
  },
  rangeNote: {fontSize: 12, color: '#647785', lineHeight: 18, marginTop: 12},
  heroPercent: {
    fontSize: 42,
    fontWeight: '800',
    color: '#138266',
    writingDirection: 'ltr',
  },
  rangeBar: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E6EEEB',
    marginVertical: 10,
  },
  miniBar: {width: 48, height: 12, marginVertical: 0},
  miniList: {width: 38, gap: 4},
  miniListRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  miniLine: {height: 3, backgroundColor: '#A7B7C2', flex: 1, borderRadius: 2},
  legend: {marginTop: 8, gap: 2},
  legendRow: {minHeight: 32},
  dot: {width: 8, height: 8, borderRadius: 4},
  legendLabel: {flex: 1, color: '#465B66', fontSize: 13},
  threshold: {fontSize: 10, color: '#72848D', writingDirection: 'ltr'},
  legendValue: {
    width: 60,
    textAlign: 'right',
    color: '#233D49',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  footnote: {fontSize: 10, color: '#73858C', marginTop: 7},
  noData: {color: '#647785', lineHeight: 21, marginTop: 12},
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
  insulinTotal: {marginVertical: 14},
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#635094',
    writingDirection: 'ltr',
  },
  insulinSplit: {gap: 12},
  insulinPart: {
    flex: 1,
    backgroundColor: '#F6F4FA',
    borderRadius: 12,
    padding: 12,
    gap: 7,
  },
  insulinValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#554679',
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
