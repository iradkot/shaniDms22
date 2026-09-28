import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import type {DailyOverview} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {StoredDailyOverviewPreferences} from '../personalization/types';
import {DAILY_OVERVIEW_COPY} from './copy';
import {
  RANGE_COLORS,
  RANGE_KEYS,
  RANGE_LABELS,
  RangeGraphic,
} from './DailyRangeGraphic';
import {formatDailyValue, formatDailyClock} from './dailyOverviewPresentation';
import {dailyOverviewCardStyles as styles} from './dailyOverviewCardStyles';

export const DailyRangeCard = ({
  overview,
  locale,
  rangeStyle,
  thresholds,
}: {
  readonly overview: DailyOverview;
  readonly locale: DestinationLocale;
  readonly rangeStyle: StoredDailyOverviewPreferences['rangeStyle'];
  readonly thresholds: TrendsRangeThresholds;
}) => {
  const [rangeDetails, setRangeDetails] = useState(false);
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtlText;
  const row = [styles.row, rtl && styles.reverse];
  const asOfTime =
    overview.isPartialDay && overview.observedPeriod
      ? formatDailyClock(overview.observedPeriod.endMs)
      : undefined;
  const value = (n: number | undefined, unit = '') =>
    n === undefined ? '—' : formatDailyValue(n) + unit;
  const ranges = overview.ranges;
  const thresholdLabels = [
    `<${thresholds.veryLowMaxMgDl}`,
    `${thresholds.veryLowMaxMgDl}–<${thresholds.targetMinMgDl}`,
    `${thresholds.targetMinMgDl}–${thresholds.targetMaxMgDl}`,
    `>${thresholds.targetMaxMgDl}–${thresholds.highMaxMgDl}`,
    `>${thresholds.highMaxMgDl}`,
  ];
  return (
    <View style={[styles.card, styles.darkCard]} testID="daily-overview-ranges">
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
                      style={[styles.rangeSummaryPercent, {color: item.color}]}>
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
};
