import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  DailyInsulinComparisonPresentation,
  DailyOverview,
} from '../../modules/dailyOverview';
import type {DestinationLocale} from '../destinations';
import {DAILY_OVERVIEW_COPY} from './copy';
import {DailyInsulinComparison} from './DailyInsulinComparison';
import {DailyPeriodLabel} from './DailyPeriodLabel';
import {INSULIN_COLORS, InsulinSplitGraphic} from './DailyInsulinGraphics';
import {
  formatDailyValue,
  recordedInsulinDisplay,
} from './dailyOverviewPresentation';

const units = (value: number) => `${formatDailyValue(value)} U`;

const InsulinComponent = ({
  kind,
  amount,
  estimatedAmount,
  percent,
  complete,
  coverage,
  locale,
}: {
  readonly kind: 'basal' | 'bolus';
  readonly amount: number | undefined;
  readonly estimatedAmount: number | undefined;
  readonly percent: number | undefined;
  readonly complete: boolean;
  readonly coverage: number | undefined;
  readonly locale: DestinationLocale;
}) => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  const align = locale === 'he' && styles.rtl;
  const showEstimate = kind === 'basal' && estimatedAmount !== undefined;
  return (
    <View style={styles.part}>
      <Text style={[styles.partLabel, {color: INSULIN_COLORS[kind]}, align]}>
        {showEstimate ? copy.estimatedBasal : copy[kind]}
      </Text>
      <Text
        testID={
          showEstimate
            ? 'daily-overview-insulin-estimated-basal'
            : `daily-overview-insulin-${kind}`
        }
        style={styles.amount}>
        {showEstimate
          ? units(estimatedAmount)
          : amount === undefined
          ? '—'
          : units(amount)}
      </Text>
      {showEstimate ? (
        <View style={styles.recordedPart}>
          <Text style={[styles.note, align]}>{copy.recordedBasal}</Text>
          <Text
            testID="daily-overview-insulin-basal"
            style={styles.recordedAmount}
            accessibilityLabel={`${copy.recordedBasal}: ${
              amount === undefined ? '—' : units(amount)
            }`}>
            {amount === undefined ? '—' : units(amount)}
          </Text>
        </View>
      ) : null}
      {percent !== undefined ? (
        <Text
          testID={`daily-overview-insulin-${kind}-percent`}
          style={[styles.percent, {color: INSULIN_COLORS[kind]}]}>
          {percent}%
        </Text>
      ) : null}
      {!complete ? (
        <Text style={[styles.note, align]}>
          {amount === undefined
            ? kind === 'basal'
              ? copy.basalUnknown
              : copy.componentUnknown
            : copy.recordedSubtotal}
        </Text>
      ) : null}
      {kind === 'basal' && !complete && coverage !== undefined ? (
        <Text style={[styles.note, align]}>
          {formatDailyValue(coverage)}% {copy.basalCoverage}
        </Text>
      ) : null}
    </View>
  );
};

export const DailyInsulinCard = ({
  overview,
  locale,
  comparison,
  compact = false,
}: {
  readonly overview: DailyOverview;
  readonly locale: DestinationLocale;
  readonly comparison?: DailyInsulinComparisonPresentation | undefined;
  readonly compact?: boolean;
}) => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const align = rtl && styles.rtl;
  const row = [styles.row, rtl && styles.reverse];
  const insulin = recordedInsulinDisplay(overview.insulinSummary);
  const primary =
    insulin.total !== undefined
      ? {value: insulin.total, label: copy.recordedTotal, id: 'total'}
      : insulin.estimatedTotal !== undefined
      ? {
          value: insulin.estimatedTotal,
          label: copy.estimatedTotal,
          id: 'estimated-total',
        }
      : insulin.subtotal !== undefined
      ? {
          value: insulin.subtotal,
          label: copy.recordedSubtotal,
          id: 'recorded-subtotal',
        }
      : insulin.bolus !== undefined
      ? {value: insulin.bolus, label: copy.recordedBolus, id: 'recorded-bolus'}
      : insulin.basal !== undefined
      ? {
          value: insulin.basal,
          label: insulin.basalComplete
            ? copy.recordedBasal
            : copy.recordedSubtotal,
          id: 'recorded-basal',
        }
      : undefined;
  const graphBasal =
    insulin.total !== undefined
      ? insulin.basal
      : insulin.estimatedTotal !== undefined
      ? insulin.estimatedBasal
      : insulin.subtotal !== undefined
      ? insulin.basal
      : undefined;
  const split =
    graphBasal !== undefined && insulin.bolus !== undefined
      ? {basalUnits: graphBasal, bolusUnits: insulin.bolus}
      : undefined;
  if (compact) {
    return (
      <View style={row}>
        {split ? (
          <InsulinSplitGraphic insulin={split} miniature rtl={rtl} />
        ) : null}
        <Text style={styles.compactValue}>
          {primary ? `${primary.label} · ${units(primary.value)}` : copy.noData}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, align]}>
        {copy.insulin}
      </Text>
      <DailyPeriodLabel
        period={overview.observedPeriod ?? overview.period}
        dayLabel={overview.isPartialDay ? copy.today : copy.comparisonDay}
        locale={locale}
        testID="daily-overview-insulin-period"
      />
      <View testID="daily-overview-insulin-metrics">
        {primary ? (
          <View style={[row, styles.hero]}>
            <Text style={[styles.heroLabel, align]}>{primary.label}</Text>
            <Text
              style={[
                styles.total,
                primary.id === 'recorded-bolus' && styles.bolus,
              ]}
              testID={`daily-overview-insulin-${primary.id}`}>
              {units(primary.value)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.note, styles.unavailable, align]}>
            {insulin.basal === undefined
              ? copy.insulinUnavailable
              : copy.recordedSubtotal}
          </Text>
        )}
        {split ? (
          <View
            accessible
            accessibilityLabel={
              primary?.value === 0
                ? copy.noRatio
                : `${primary?.label}: ${copy.basal} ${units(
                    split.basalUnits,
                  )}, ${copy.bolus} ${units(split.bolusUnits)}`
            }>
            <InsulinSplitGraphic insulin={split} rtl={rtl} />
          </View>
        ) : null}
        <View style={[row, styles.parts]}>
          <InsulinComponent
            kind="basal"
            amount={insulin.basal}
            estimatedAmount={
              primary?.id === 'estimated-total'
                ? insulin.estimatedBasal
                : undefined
            }
            percent={insulin.basalPercent}
            complete={insulin.basalComplete}
            coverage={insulin.basalCoveragePercent}
            locale={locale}
          />
          <InsulinComponent
            kind="bolus"
            amount={insulin.bolus}
            estimatedAmount={undefined}
            percent={insulin.bolusPercent}
            complete={insulin.bolus !== undefined}
            coverage={undefined}
            locale={locale}
          />
        </View>
        {insulin.estimatedTotal !== undefined && insulin.total === undefined ? (
          <View style={styles.estimate}>
            {insulin.subtotal !== undefined ? (
              <Text
                testID="daily-overview-insulin-estimate-recorded-subtotal"
                style={[styles.note, align]}>
                {copy.recordedSubtotal}: {units(insulin.subtotal)}
              </Text>
            ) : null}
            <Text style={[styles.note, align]}>{copy.estimateNote}</Text>
          </View>
        ) : null}
        {insulin.total === undefined ? (
          <Text style={[styles.incomplete, align]}>{copy.totalIncomplete}</Text>
        ) : insulin.total === 0 ? (
          <Text style={[styles.note, align]}>{copy.noRatio}</Text>
        ) : null}
        <DailyInsulinComparison
          today={overview.insulinSummary}
          period={overview.period}
          observedPeriod={overview.observedPeriod ?? overview.period}
          comparison={comparison}
          locale={locale}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111D2D',
    borderColor: '#34445B',
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },
  title: {fontSize: 17, fontWeight: '700', color: '#F3F7FF'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  hero: {marginVertical: 18, flexWrap: 'wrap'},
  heroLabel: {flex: 1, fontSize: 14, color: '#D7E3F3'},
  total: {
    fontSize: 38,
    fontWeight: '800',
    color: '#F3F7FF',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  bolus: {color: INSULIN_COLORS.bolus},
  parts: {alignItems: 'stretch', marginTop: 12},
  part: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 15,
    backgroundColor: '#1B2A3E',
    gap: 7,
  },
  partLabel: {fontSize: 13, fontWeight: '700'},
  amount: {
    fontSize: 23,
    fontWeight: '700',
    color: '#F3F7FF',
    writingDirection: 'ltr',
  },
  percent: {fontSize: 18, fontWeight: '700', writingDirection: 'ltr'},
  note: {fontSize: 12, lineHeight: 18, color: '#A6B7CC'},
  recordedPart: {gap: 2},
  recordedAmount: {
    fontSize: 12,
    lineHeight: 18,
    color: '#A6B7CC',
    writingDirection: 'ltr',
  },
  unavailable: {marginTop: 16},
  incomplete: {fontSize: 12, lineHeight: 19, color: '#F4C276', marginTop: 12},
  estimate: {marginTop: 12, gap: 4},
  compactValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#344F62',
    flexShrink: 1,
  },
});
