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
  percent,
  complete,
  coverage,
  locale,
}: {
  readonly kind: 'basal' | 'bolus';
  readonly amount: number | undefined;
  readonly percent: number | undefined;
  readonly complete: boolean;
  readonly coverage: number | undefined;
  readonly locale: DestinationLocale;
}) => {
  const copy = DAILY_OVERVIEW_COPY[locale];
  const align = locale === 'he' && styles.rtl;
  return (
    <View style={styles.part}>
      <Text style={[styles.partLabel, {color: INSULIN_COLORS[kind]}, align]}>
        {copy[kind]}
      </Text>
      <Text testID={`daily-overview-insulin-${kind}`} style={styles.amount}>
        {amount === undefined ? '—' : units(amount)}
      </Text>
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
  const split =
    insulin.total !== undefined &&
    insulin.basal !== undefined &&
    insulin.bolus !== undefined
      ? {basalUnits: insulin.basal, bolusUnits: insulin.bolus}
      : undefined;
  if (compact) {
    return (
      <View style={row}>
        {split ? (
          <InsulinSplitGraphic insulin={split} miniature rtl={rtl} />
        ) : null}
        <Text style={styles.compactValue}>
          {insulin.total !== undefined
            ? units(insulin.total)
            : insulin.bolus !== undefined
            ? `${copy.recordedBolus} · ${units(insulin.bolus)}`
            : copy.noData}
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
        {insulin.total !== undefined ? (
          <View style={[row, styles.hero]}>
            <Text style={[styles.heroLabel, align]}>{copy.recordedTotal}</Text>
            <Text style={styles.total} testID="daily-overview-insulin-total">
              {units(insulin.total)}
            </Text>
          </View>
        ) : insulin.bolus !== undefined ? (
          <View style={[row, styles.hero]}>
            <Text style={[styles.heroLabel, align]}>{copy.recordedBolus}</Text>
            <Text
              style={[styles.total, styles.bolus]}
              testID="daily-overview-insulin-recorded-bolus">
              {units(insulin.bolus)}
            </Text>
          </View>
        ) : insulin.basal !== undefined && insulin.basalComplete ? (
          <View style={[row, styles.hero]}>
            <Text style={[styles.heroLabel, align]}>{copy.recordedBasal}</Text>
            <Text
              style={styles.total}
              testID="daily-overview-insulin-recorded-basal">
              {units(insulin.basal)}
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
              insulin.total === 0
                ? copy.noRatio
                : `${copy.insulinSplit}: ${copy.basal} ${
                    insulin.basalPercent ?? '—'
                  }%, ${copy.bolus} ${insulin.bolusPercent ?? '—'}%`
            }>
            <InsulinSplitGraphic insulin={split} rtl={rtl} />
          </View>
        ) : null}
        <View style={[row, styles.parts]}>
          <InsulinComponent
            kind="basal"
            amount={insulin.basal}
            percent={insulin.basalPercent}
            complete={insulin.basalComplete}
            coverage={insulin.basalCoveragePercent}
            locale={locale}
          />
          <InsulinComponent
            kind="bolus"
            amount={insulin.bolus}
            percent={insulin.bolusPercent}
            complete={insulin.bolus !== undefined}
            coverage={undefined}
            locale={locale}
          />
        </View>
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
  unavailable: {marginTop: 16},
  incomplete: {fontSize: 12, lineHeight: 19, color: '#F4C276', marginTop: 12},
  compactValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#344F62',
    flexShrink: 1,
  },
});
