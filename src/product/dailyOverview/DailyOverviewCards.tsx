import React from 'react';
import {Text, View} from 'react-native';
import type {
  DailyInsulinComparisonPresentation,
  DailyOverview,
} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {
  DailyOverviewCardId,
  StoredDailyOverviewPreferences,
} from '../personalization/types';
import {DAILY_OVERVIEW_COPY} from './copy';
import {RangeGraphic} from './DailyRangeGraphic';
import {DailyRangeCard} from './DailyRangeCard';
import {DailyInsulinCard} from './DailyInsulinCard';
import {formatDailyClock, formatDailyValue} from './dailyOverviewPresentation';
import {dailyOverviewCardStyles as styles} from './dailyOverviewCardStyles';
export {RANGE_COLORS, RangeGraphic} from './DailyRangeGraphic';
export {formatDailyValue} from './dailyOverviewPresentation';

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
  if (id === 'insulin') {
    return (
      <DailyInsulinCard
        overview={overview}
        locale={locale}
        comparison={insulinComparison}
        compact={compact}
      />
    );
  }
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtlText;
  const row = [styles.row, rtl && styles.reverse];
  const asOfTime =
    overview.isPartialDay && overview.observedPeriod
      ? formatDailyClock(overview.observedPeriod.endMs)
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
    return (
      <DailyRangeCard
        overview={overview}
        locale={locale}
        rangeStyle={rangeStyle}
        thresholds={thresholds}
      />
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
