import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {DailyInsulinComparisonPresentation} from '../../modules/dailyOverview';
import type {DestinationLocale} from '../destinations';
import {DAILY_OVERVIEW_COPY} from './copy';

export const INSULIN_COLORS = {basal: '#68DFC7', bolus: '#BEA7FF'} as const;

export interface InsulinGraphicAmounts {
  readonly basalUnits: number;
  readonly bolusUnits: number;
  readonly totalUnits: number;
}

/** Use unrounded components for geometry; rounded display totals can distort tiny doses. */
export const insulinGraphicTotal = (insulin: InsulinGraphicAmounts): number =>
  insulin.basalUnits + insulin.bolusUnits;

/** The same scale is shared by comparison bars; a true zero has no filled segment. */
export const InsulinSplitGraphic = ({
  insulin,
  maximum = insulinGraphicTotal(insulin),
  miniature = false,
  rtl = false,
}: {
  readonly insulin: InsulinGraphicAmounts;
  readonly maximum?: number;
  readonly miniature?: boolean;
  readonly rtl?: boolean;
}) => {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
  const basal = safeMaximum ? Math.max(0, insulin.basalUnits) / safeMaximum : 0;
  const bolus = safeMaximum ? Math.max(0, insulin.bolusUnits) / safeMaximum : 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="daily-overview-insulin-split-graphic"
      style={[
        styles.track,
        rtl && styles.reverse,
        miniature && styles.miniTrack,
      ]}>
      {basal > 0 ? (
        <View
          style={[
            styles.fill,
            {flex: basal, backgroundColor: INSULIN_COLORS.basal},
          ]}
        />
      ) : null}
      {bolus > 0 ? (
        <View
          style={[
            styles.fill,
            {flex: bolus, backgroundColor: INSULIN_COLORS.bolus},
          ]}
        />
      ) : null}
      <View style={{flex: Math.max(0, 1 - basal - bolus)}} />
    </View>
  );
};

const units = (value: number) => `${Number(value.toFixed(2))} U`;

export const DailyInsulinComparison = ({
  today,
  comparison,
  locale,
}: {
  readonly today: InsulinGraphicAmounts;
  readonly comparison?: DailyInsulinComparisonPresentation | undefined;
  readonly locale: DestinationLocale;
}) => {
  const [mode, setMode] = useState<'yesterday' | 'week'>('yesterday');
  const copy = DAILY_OVERVIEW_COPY[locale];
  const rtl = locale === 'he';
  const row = [styles.row, rtl && styles.reverse];
  const align = rtl && styles.rtlText;
  const baseline =
    comparison?.status === 'available'
      ? mode === 'yesterday'
        ? comparison.yesterday
        : comparison.weekAverage
      : undefined;
  const label = mode === 'yesterday' ? copy.yesterday : copy.weekAverage;
  const delta = baseline
    ? insulinGraphicTotal(today) - insulinGraphicTotal(baseline)
    : undefined;
  const deltaText =
    delta === undefined
      ? '—'
      : `${Math.abs(delta) < 0.005 ? '' : delta > 0 ? '+' : '−'}${units(
          Math.abs(delta),
        )}`;
  const cutoff = comparison
    ? new Date(comparison.cutoffTimestampMs).toLocaleTimeString(
        locale === 'he' ? 'he-IL' : 'en-GB',
        {hour: '2-digit', minute: '2-digit', hour12: false},
      )
    : undefined;
  const timeCaption = comparison?.isPartialDay
    ? `${copy.comparisonSameTime} · ${cutoff}`
    : copy.comparisonFullDays;
  return (
    <View style={styles.panel} testID="daily-overview-insulin-comparison">
      <Text style={[styles.eyebrow, align]}>{copy.insulinCompare}</Text>
      <View style={[row, styles.tabs]}>
        {(['yesterday', 'week'] as const).map(option => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{selected: mode === option}}
            accessibilityLabel={
              option === 'yesterday' ? copy.yesterday : copy.weekAverage
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
              {option === 'yesterday' ? copy.yesterday : copy.weekAverage}
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
      ) : baseline ? (
        <View testID={`daily-overview-comparison-${mode}`}>
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
          {[
            {key: 'today', label: copy.comparisonDay, insulin: today},
            {key: 'baseline', label, insulin: baseline},
          ].map(item => (
            <View key={item.key} style={styles.comparisonRow}>
              <View style={row}>
                <Text style={[styles.barLabel, styles.flex, align]}>
                  {item.label}
                </Text>
                <Text style={styles.barValue}>
                  {units(item.insulin.totalUnits)}
                </Text>
              </View>
              <InsulinSplitGraphic
                insulin={item.insulin}
                maximum={Math.max(
                  insulinGraphicTotal(today),
                  insulinGraphicTotal(baseline),
                )}
                rtl={rtl}
              />
            </View>
          ))}
          <Text style={[styles.caption, align]}>{timeCaption}</Text>
          {mode === 'week' ? (
            <Text style={[styles.caption, align]}>{copy.weekComplete}</Text>
          ) : null}
        </View>
      ) : (
        <Text
          style={[styles.message, styles.unavailable, align]}
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
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  flex: {flex: 1},
  track: {
    height: 12,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#34445B',
  },
  fill: {height: '100%'},
  miniTrack: {width: 48, height: 10},
  panel: {
    marginTop: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#1B2A3E',
  },
  eyebrow: {color: '#A6B7CC', fontSize: 12, fontWeight: '600', marginBottom: 9},
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
  deltaRow: {marginTop: 16, marginBottom: 7},
  delta: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F3F7FF',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  message: {fontSize: 12, color: '#B7C6D9', lineHeight: 18},
  messageRow: {marginTop: 14},
  unavailable: {marginTop: 14},
  comparisonRow: {gap: 6, marginTop: 10},
  barLabel: {fontSize: 12, color: '#D7E3F3'},
  barValue: {
    fontSize: 13,
    color: '#F3F7FF',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  caption: {fontSize: 10, color: '#A6B7CC', lineHeight: 16, marginTop: 12},
});
