import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  selectRecordedInsulinComparison,
  type DailyInsulinComparisonPresentation,
} from '../../modules/dailyOverview';
import {DAILY_OVERVIEW_COPY} from '../dailyOverview/copy';
import {
  formatDailyValue,
  formatDailyWindow,
  recordedInsulinDisplay,
} from '../dailyOverview/dailyOverviewPresentation';
import type {HomeLaneState, HomeTodayData} from './homeData';
import {HOME_COPY} from './homeCopy';

const units = (value: number) => `${formatDailyValue(value)} U`;
const change = (value: number) =>
  `${Math.abs(value) < 0.005 ? '' : value > 0 ? '+' : '−'}${units(
    Math.abs(value),
  )}`;

export function HomeDailyInsulin({
  data,
  comparison,
  locale,
}: {
  readonly data: HomeTodayData;
  readonly comparison?:
    | HomeLaneState<DailyInsulinComparisonPresentation>
    | undefined;
  readonly locale: 'en' | 'he';
}) {
  const c = HOME_COPY[locale];
  const daily = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he' && s.rtl;
  const row = [s.row, locale === 'he' && s.reverse];
  const insulin = recordedInsulinDisplay(data.overview.insulinSummary);
  const showEstimate =
    insulin.total === undefined && insulin.estimatedTotal !== undefined;
  const value =
    insulin.total ??
    insulin.estimatedTotal ??
    insulin.subtotal ??
    insulin.bolus ??
    insulin.basal;
  if (value === undefined) {
    return <Text style={s.empty}>{c.unavailable}</Text>;
  }
  // History is useful only when it ends at the same cutoff as today's values.
  const history =
    comparison?.kind === 'ready' &&
    comparison.data.cutoffTimestampMs === data.observedPeriod.endMs
      ? comparison.data
      : undefined;
  const comparisons = (['yesterday', 'weekAverage'] as const).map(kind => ({
    kind,
    label: kind === 'yesterday' ? daily.yesterday : daily.weekAverage,
    selected:
      history?.status === 'available'
        ? selectRecordedInsulinComparison(
            data.overview.insulinSummary,
            kind === 'weekAverage' && history.weekDays !== 7
              ? undefined
              : history[kind],
          )
        : undefined,
  }));
  const hasComparisons = comparisons.some(item => item.selected);
  return (
    <View style={s.body}>
      <Text style={[s.note, rtl]}>
        {insulin.total !== undefined
          ? daily.recordedTotal
          : insulin.estimatedTotal !== undefined
          ? daily.estimatedTotal
          : insulin.subtotal !== undefined
          ? daily.recordedSubtotal
          : insulin.bolus !== undefined
          ? daily.recordedBolus
          : insulin.basalComplete
          ? daily.recordedBasal
          : daily.recordedSubtotal}
      </Text>
      <Text
        testID={
          insulin.total !== undefined
            ? 'home-insulin-total'
            : insulin.estimatedTotal !== undefined
            ? 'home-insulin-estimated-total'
            : insulin.subtotal !== undefined
            ? 'home-insulin-recorded-subtotal'
            : insulin.bolus !== undefined
            ? 'home-insulin-recorded-bolus'
            : 'home-insulin-recorded-basal'
        }
        style={[s.big, locale === 'he' && s.numericRtl]}>
        {units(value)}
      </Text>
      <View style={row}>
        {(['basal', 'bolus'] as const).map(kind => {
          const estimatedBasal = kind === 'basal' && showEstimate;
          const amount = estimatedBasal
            ? insulin.estimatedBasal
            : insulin[kind];
          return (
            <View key={kind} style={s.cell}>
              <Text style={[s.note, rtl]}>
                {estimatedBasal ? daily.estimatedBasal : c[kind]}
              </Text>
              <Text
                testID={
                  estimatedBasal
                    ? 'home-insulin-estimated-basal'
                    : `home-insulin-${kind}`
                }
                style={[s.amount, locale === 'he' && s.numericRtl]}>
                {amount === undefined ? '—' : units(amount)}
              </Text>
              {estimatedBasal ? (
                <View>
                  <Text style={[s.note, rtl]}>{daily.recordedBasal}</Text>
                  <Text
                    testID="home-insulin-basal"
                    style={[s.note, s.numeric, locale === 'he' && s.numericRtl]}
                    accessibilityLabel={`${daily.recordedBasal}: ${
                      insulin.basal === undefined ? '—' : units(insulin.basal)
                    }`}>
                    {insulin.basal === undefined ? '—' : units(insulin.basal)}
                  </Text>
                </View>
              ) : null}
              {kind === 'basal' && !insulin.basalComplete ? (
                <Text style={[s.note, rtl]}>
                  {insulin.basal === undefined
                    ? daily.basalUnknown
                    : daily.recordedSubtotal}
                </Text>
              ) : null}
              {kind === 'basal' &&
              (insulin.basal !== undefined || estimatedBasal) &&
              !insulin.basalComplete &&
              insulin.basalCoveragePercent !== undefined ? (
                <Text style={[s.note, rtl]}>
                  {formatDailyValue(insulin.basalCoveragePercent)}%{' '}
                  {daily.basalCoverage}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {insulin.estimatedTotal !== undefined && insulin.total === undefined ? (
        <View>
          {insulin.subtotal !== undefined ? (
            <Text
              testID="home-insulin-estimate-recorded-subtotal"
              style={[s.note, rtl]}>
              {daily.recordedSubtotal}: {units(insulin.subtotal)}
            </Text>
          ) : null}
          <Text style={[s.note, rtl]}>{daily.estimateNote}</Text>
        </View>
      ) : null}
      {insulin.total === undefined ? (
        <Text style={[s.note, rtl]}>{c.insulinTotalIncomplete}</Text>
      ) : null}
      {comparison && comparison.kind !== 'unavailable' ? (
        <View style={s.comparison} testID="home-insulin-comparison">
          {hasComparisons ? (
            <>
              <View style={[row, s.timing]}>
                <Text style={[s.note, rtl]}>{c.sameHours}</Text>
                <Text
                  testID="home-insulin-comparison-window"
                  style={[s.note, s.numeric]}>
                  {formatDailyWindow(data.observedPeriod)}
                </Text>
              </View>
              {comparisons.map(({kind, label, selected}) => (
                <View key={kind} style={row}>
                  <View style={s.flex}>
                    <Text style={[s.label, rtl]}>{label}</Text>
                    {selected ? (
                      <Text style={[s.note, rtl]}>
                        {selected.metric === 'total'
                          ? daily.recordedTotal
                          : selected.metric === 'estimatedTotal'
                          ? daily.estimatedTotal
                          : selected.metric === 'recordedSubtotal'
                          ? daily.subtotalComparison
                          : daily.recordedBolus}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    testID={`home-insulin-${kind}-value`}
                    style={s.baseline}>
                    {selected ? units(selected.baselineUnits) : '—'}
                  </Text>
                  <Text
                    testID={`home-insulin-${kind}-delta`}
                    accessibilityLabel={`${label}, ${daily.comparisonChange}: ${
                      selected ? change(selected.deltaUnits) : '—'
                    }`}
                    style={s.delta}>
                    {selected ? change(selected.deltaUnits) : '—'}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={[s.note, rtl]} accessibilityLiveRegion="polite">
              {comparison.kind === 'loading' ||
              (comparison.kind === 'ready' &&
                (comparison.refreshing || history?.status === 'loading'))
                ? daily.comparisonLoading
                : daily.comparisonUnavailable}
            </Text>
          )}
          {comparison.kind === 'ready' && comparison.refreshFailed ? (
            <Text style={[s.note, rtl]}>{c.refreshFailed}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  body: {gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  numeric: {writingDirection: 'ltr'},
  numericRtl: {textAlign: 'right'},
  timing: {flexWrap: 'wrap', gap: 8},
  flex: {flex: 1, minWidth: 0},
  big: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700',
    color: '#58488A',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  cell: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F5F2FA',
    borderRadius: 14,
    padding: 12,
    gap: 4,
    alignSelf: 'stretch',
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#58488A',
    writingDirection: 'ltr',
  },
  note: {fontSize: 12, lineHeight: 18, color: '#627484'},
  empty: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: '#627484',
    paddingVertical: 28,
  },
  comparison: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E9EDF3',
    paddingTop: 12,
  },
  label: {fontSize: 13, lineHeight: 19, color: '#253B4C', fontWeight: '600'},
  baseline: {fontSize: 14, color: '#627484', writingDirection: 'ltr'},
  delta: {
    fontSize: 15,
    fontWeight: '700',
    color: '#58488A',
    writingDirection: 'ltr',
  },
});
