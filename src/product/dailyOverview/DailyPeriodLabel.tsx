import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {DailyOverviewPeriod} from '../../modules/dailyOverview';
import type {DestinationLocale} from '../destinations';
import {
  formatDailyDate,
  formatDailyDateRange,
  formatDailyPeriodLabel,
  formatDailyWindow,
  type DailyDateRange,
} from './dailyOverviewPresentation';

/** Reused inside cards and comparison rows, so their date never depends on the page header. */
export const DailyPeriodLabel = ({
  period,
  dayLabel,
  locale,
  testID,
  dateRange,
}: {
  readonly period: DailyOverviewPeriod;
  readonly dayLabel: string;
  readonly locale: DestinationLocale;
  readonly testID?: string;
  readonly dateRange?: DailyDateRange;
}) => (
  <View
    accessible
    accessibilityLabel={formatDailyPeriodLabel(period, dayLabel, dateRange)}
    testID={testID}
    style={[styles.badge, locale === 'he' && styles.reverse]}>
    <Text style={[styles.day, locale === 'he' && styles.rtl]}>{dayLabel}</Text>
    <Text style={styles.numeric}>
      {dateRange
        ? formatDailyDateRange(dateRange)
        : formatDailyDate(period.startMs)}
    </Text>
    <Text style={styles.numeric}>{formatDailyWindow(period)}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#24354C',
    marginTop: 10,
  },
  reverse: {flexDirection: 'row-reverse'},
  day: {fontSize: 13, fontWeight: '700', color: '#F3F7FF'},
  numeric: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D7E3F3',
    writingDirection: 'ltr',
  },
  rtl: {writingDirection: 'rtl', textAlign: 'right'},
});
