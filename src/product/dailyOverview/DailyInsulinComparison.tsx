import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getDailyInsulinComparisonWindows,
  selectRecordedInsulinComparison,
  type DailyInsulinComparisonPresentation,
  type DailyInsulinSummary,
  type DailyOverviewPeriod,
} from '../../modules/dailyOverview';
import type {DestinationLocale} from '../destinations';
import {DAILY_OVERVIEW_COPY} from './copy';
import {DailyPeriodLabel} from './DailyPeriodLabel';
import {InsulinSplitGraphic} from './DailyInsulinGraphics';
import {
  formatDailyValue,
  recordedInsulinDisplay,
} from './dailyOverviewPresentation';
export {
  InsulinSplitGraphic,
  INSULIN_COLORS,
  insulinGraphicTotal,
} from './DailyInsulinGraphics';

const units = (value: number) => `${formatDailyValue(value)} U`;

export const DailyInsulinComparison = ({
  today,
  period,
  observedPeriod,
  comparison,
  locale,
}: {
  readonly today: DailyInsulinSummary;
  readonly period: DailyOverviewPeriod;
  readonly observedPeriod: DailyOverviewPeriod;
  readonly comparison?: DailyInsulinComparisonPresentation | undefined;
  readonly locale: DestinationLocale;
}) => {
  const [mode, setMode] = useState<'yesterday' | 'week'>('yesterday');
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtl;
  const row = [styles.row, rtl && styles.reverse];
  const windows = getDailyInsulinComparisonWindows({
    period,
    asOfMs: comparison?.cutoffTimestampMs ?? observedPeriod.endMs,
  });
  const previousDay = windows.previousDays[0]!;
  const previousDayLabel = windows.isPartialDay
    ? copy.yesterday
    : copy.previousDay;
  const baseline =
    comparison?.status === 'available'
      ? mode === 'yesterday'
        ? comparison.yesterday
        : comparison.weekAverage
      : undefined;
  const selected = baseline
    ? selectRecordedInsulinComparison(today, baseline)
    : undefined;
  const delta = selected?.deltaUnits;
  const deltaText =
    delta === undefined
      ? '—'
      : `${Math.abs(delta) < 0.005 ? '' : delta > 0 ? '+' : '−'}${units(
          Math.abs(delta),
        )}`;
  const todayDisplay = recordedInsulinDisplay(today);
  const baselineDisplay = baseline
    ? recordedInsulinDisplay(baseline)
    : undefined;
  const chartParts = (current: boolean) => {
    const display = current ? todayDisplay : baselineDisplay;
    return selected?.metric === 'total'
      ? {basalUnits: display?.basal ?? 0, bolusUnits: display?.bolus ?? 0}
      : {
          basalUnits: 0,
          bolusUnits: current
            ? selected?.currentUnits ?? 0
            : selected?.baselineUnits ?? 0,
        };
  };
  return (
    <View style={styles.panel} testID="daily-overview-insulin-comparison">
      <Text style={[styles.heading, align]}>{copy.insulinCompare}</Text>
      <View style={[row, styles.tabs]}>
        {(['yesterday', 'week'] as const).map(option => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{selected: mode === option}}
            accessibilityLabel={
              option === 'yesterday' ? previousDayLabel : copy.weekAverage
            }
            onPress={() => setMode(option)}
            testID={`daily-overview-compare-${option}`}
            style={({pressed}) => [
              styles.tab,
              mode === option && styles.selectedTab,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.tabText,
                mode === option && styles.selectedTabText,
                align,
              ]}>
              {option === 'yesterday' ? previousDayLabel : copy.weekAverage}
            </Text>
          </Pressable>
        ))}
      </View>
      {comparison?.status === 'loading' ? (
        <View
          style={[row, styles.messageRow]}
          testID="daily-overview-comparison-loading">
          <ActivityIndicator color="#BEA7FF" size="small" />
          <Text
            style={[styles.message, align]}
            accessibilityLiveRegion="polite">
            {copy.comparisonLoading}
          </Text>
        </View>
      ) : selected ? (
        <View testID={`daily-overview-comparison-${mode}`}>
          <Text style={[styles.metric, align]}>
            {selected.metric === 'total'
              ? copy.recordedTotal
              : copy.bolusComparisonOnly}
          </Text>
          <View style={[row, styles.deltaRow]}>
            <Text style={[styles.message, styles.flex, align]}>
              {copy.comparisonChange}
            </Text>
            <Text
              style={styles.delta}
              testID="daily-overview-insulin-delta"
              accessibilityLiveRegion="polite">
              {deltaText}
            </Text>
          </View>
          {[true, false].map(current => (
            <View key={String(current)} style={styles.comparisonRow}>
              {current ? (
                <DailyPeriodLabel
                  period={windows.current}
                  dayLabel={
                    windows.isPartialDay ? copy.today : copy.comparisonDay
                  }
                  locale={locale}
                  testID="daily-overview-comparison-current-period"
                />
              ) : mode === 'yesterday' ? (
                <DailyPeriodLabel
                  period={previousDay}
                  dayLabel={previousDayLabel}
                  locale={locale}
                  testID="daily-overview-comparison-baseline-period"
                />
              ) : (
                <DailyPeriodLabel
                  period={previousDay}
                  dayLabel={copy.weekAverage}
                  dateRange={{
                    firstDayMs: windows.previousDays[6]!.startMs,
                    lastDayMs: previousDay.startMs,
                  }}
                  locale={locale}
                  testID="daily-overview-comparison-baseline-period"
                />
              )}
              <View style={row}>
                <View style={styles.flex}>
                  <InsulinSplitGraphic
                    insulin={chartParts(current)}
                    maximum={Math.max(
                      selected.currentUnits,
                      selected.baselineUnits,
                    )}
                    rtl={rtl}
                  />
                </View>
                <Text style={styles.barValue}>
                  {units(
                    current ? selected.currentUnits : selected.baselineUnits,
                  )}
                </Text>
              </View>
            </View>
          ))}
          {mode === 'week' ? (
            <Text style={[styles.caption, align]}>{copy.weekComplete}</Text>
          ) : null}
        </View>
      ) : (
        <Text
          style={[styles.message, styles.messageRow, align]}
          testID="daily-overview-comparison-unavailable">
          {copy.comparisonUnavailable}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  flex: {flex: 1},
  panel: {
    marginTop: 18,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#1B2A3E',
  },
  heading: {color: '#D7E3F3', fontSize: 13, fontWeight: '700', marginBottom: 9},
  tabs: {gap: 4, padding: 4, backgroundColor: '#111D2D', borderRadius: 13},
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selectedTab: {backgroundColor: '#34445B'},
  tabText: {
    fontSize: 12,
    color: '#A6B7CC',
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedTabText: {color: '#F3F7FF'},
  pressed: {opacity: 0.7},
  metric: {fontSize: 14, fontWeight: '700', color: '#F3F7FF', marginTop: 14},
  deltaRow: {marginTop: 8},
  delta: {
    fontSize: 25,
    fontWeight: '800',
    color: '#F3F7FF',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  message: {fontSize: 12, color: '#B7C6D9', lineHeight: 18},
  messageRow: {marginTop: 14},
  comparisonRow: {gap: 8, marginTop: 5},
  barValue: {
    fontSize: 14,
    color: '#F3F7FF',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  caption: {fontSize: 11, color: '#A6B7CC', lineHeight: 17, marginTop: 12},
});
