import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DailyInsulinComparisonPresentation} from '../../modules/dailyOverview';
import {
  RangeGraphic,
  formatDailyValue as format,
} from '../dailyOverview/DailyOverviewCards';
import type {HomeWidgetId, StoredHomePreferences} from '../personalization';
import type {
  HomeLaneState,
  HomeTodayData,
  HomeWeeklyGlucoseData,
  HomeWeeklyInsulinData,
} from './homeData';
import {HOME_COPY} from './homeCopy';
import {HomeDailyInsulin} from './HomeDailyInsulin';

type Locale = 'en' | 'he';
export const HOME_WIDGET_COLORS: Record<HomeWidgetId, string> = {
  'glucose-graph': '#1769AA',
  'time-in-range': '#138868',
  'daily-insulin': '#7560B1',
  'weekly-glucose': '#1769AA',
  'weekly-insulin': '#7560B1',
  chat: '#4F609A',
};
export const HOME_WIDGET_ICONS: Record<HomeWidgetId, string> = {
  'glucose-graph': '⌁',
  'time-in-range': '◉',
  'daily-insulin': '◒',
  'weekly-glucose': '▥',
  'weekly-insulin': '▥',
  chat: '✧',
};
const date = (ms: number, locale: Locale) =>
  new Date(ms).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
const time = (ms: number, locale: Locale) =>
  new Date(ms).toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

function Lane<T>({
  state,
  locale,
  children,
}: {
  state: HomeLaneState<T>;
  locale: Locale;
  children: (value: T) => React.ReactNode;
}) {
  const c = HOME_COPY[locale];
  if (state.kind !== 'ready') {
    return (
      <Text accessibilityLiveRegion="polite" style={s.empty}>
        {state.kind === 'loading'
          ? c.loading
          : state.kind === 'error'
          ? c.error
          : c.unavailable}
      </Text>
    );
  }
  return (
    <>
      {children(state.data)}
      {state.refreshing ? <Text style={s.note}>{c.refreshing}</Text> : null}
      {state.refreshFailed ? (
        <Text style={s.warning}>{c.refreshFailed}</Text>
      ) : null}
    </>
  );
}

export function GlucoseMiniChart({
  data,
  hours,
  thresholds,
  locale,
  nowMs,
}: {
  data: HomeTodayData;
  hours: StoredHomePreferences['glucoseWindowHours'];
  thresholds: TrendsRangeThresholds;
  locale: Locale;
  nowMs: number;
}) {
  const c = HOME_COPY[locale];
  const end = data.observedPeriod.endMs;
  const start =
    hours === 'full-day'
      ? data.period.startMs
      : Math.max(data.period.startMs, end - hours * 3600000);
  const samples = data.glucose.glucoseSamples.filter(
    p => p.timestampMs >= start && p.timestampMs < end,
  );
  const last = samples[samples.length - 1];
  if (!last) {
    return <Text style={s.empty}>{c.noGlucose}</Text>;
  }
  const lo = Math.max(
    0,
    Math.min(thresholds.veryLowMaxMgDl, ...samples.map(p => p.valueMgDl)) - 15,
  );
  const hi =
    Math.max(thresholds.highMaxMgDl, ...samples.map(p => p.valueMgDl)) + 15;
  const x = (ms: number) =>
    34 + (310 * (ms - start)) / Math.max(1, end - start);
  const y = (v: number) => 145 - (120 * (v - lo)) / (hi - lo);
  const paths = data.glucose.glucoseSegments
    .map(segment =>
      segment.filter(p => p.timestampMs >= start && p.timestampMs < end),
    )
    .filter(segment => segment.length);
  return (
    <>
      <View style={[s.inline, locale === 'he' && s.reverse]}>
        <Text style={s.big} testID="home-glucose-value">
          {format(last.valueMgDl)} <Text style={s.unit}>mg/dL</Text>
        </Text>
        <View>
          <Text style={[s.note, locale === 'he' && s.rtl]}>
            {c.lastReading}
          </Text>
          <Text style={[s.note, locale === 'he' && s.rtl]}>
            {Math.max(0, Math.floor((nowMs - last.timestampMs) / 60000))}{' '}
            {c.minutesAgo}
          </Text>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={`${c.labels['glucose-graph']}, ${time(
          start,
          locale,
        )} – ${time(end, locale)}, ${c.lastReading} ${format(
          last.valueMgDl,
        )} mg/dL`}>
        <Svg
          width="100%"
          height={170}
          viewBox="0 0 354 170"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Rect
            x={34}
            y={y(thresholds.targetMaxMgDl)}
            width={310}
            height={y(thresholds.targetMinMgDl) - y(thresholds.targetMaxMgDl)}
            fill="#E8F5EF"
            rx={4}
          />
          {[thresholds.targetMinMgDl, thresholds.targetMaxMgDl].map(v => (
            <React.Fragment key={v}>
              <Line
                x1={34}
                x2={344}
                y1={y(v)}
                y2={y(v)}
                stroke="#BDD7CE"
                strokeDasharray="3 4"
              />
              <SvgText
                x={28}
                y={y(v) + 4}
                textAnchor="end"
                fontSize={11}
                fill="#5C6875">
                {v}
              </SvgText>
            </React.Fragment>
          ))}
          {paths.map((segment, i) =>
            segment.length === 1 ? (
              <Circle
                key={i}
                cx={x(segment[0]!.timestampMs)}
                cy={y(segment[0]!.valueMgDl)}
                r={2.5}
                fill="#1769AA"
              />
            ) : (
              <Path
                key={i}
                d={segment
                  .map(
                    (p, j) =>
                      `${j ? 'L' : 'M'}${x(p.timestampMs)},${y(p.valueMgDl)}`,
                  )
                  .join(' ')}
                stroke="#1769AA"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            ),
          )}
          <Circle
            cx={x(last.timestampMs)}
            cy={y(last.valueMgDl)}
            r={4}
            fill="#1769AA"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
          <SvgText x={34} y={165} fontSize={11} fill="#5C6875">
            {time(start, locale)}
          </SvgText>
          <SvgText
            x={344}
            y={165}
            textAnchor="end"
            fontSize={11}
            fill="#5C6875">
            {time(end, locale)}
          </SvgText>
        </Svg>
      </View>
    </>
  );
}

function WeeklyBars({
  days,
  locale,
  insulin = false,
  onOpenDay,
}: {
  days: readonly {
    startMs: number;
    value?: number | undefined;
    basal?: number;
    partial?: boolean;
  }[];
  locale: Locale;
  insulin?: boolean;
  onOpenDay?: ((dayStartMs: number) => void) | undefined;
}) {
  const max = Math.max(1, ...days.map(day => day.value ?? 0));
  return (
    <View
      style={s.bars}
      testID={
        insulin ? 'home-weekly-insulin-bars' : 'home-weekly-glucose-bars'
      }>
      {days.map(day => (
        <Pressable
          key={day.startMs}
          style={s.barColumn}
          testID={`home-weekly-${insulin ? 'insulin' : 'glucose'}-day-${
            day.startMs
          }`}
          disabled={!onOpenDay}
          accessibilityRole={onOpenDay ? 'button' : undefined}
          onPress={() => onOpenDay?.(day.startMs)}
          accessible
          accessibilityLabel={`${date(day.startMs, locale)}, ${
            day.value === undefined ? '—' : format(day.value)
          } ${insulin ? 'U' : 'mg/dL'}${
            day.partial
              ? locale === 'he'
                ? ', כיסוי חלקי'
                : ', partial coverage'
              : ''
          }`}>
          <Text style={s.barValue} numberOfLines={1}>
            {day.value === undefined
              ? '—'
              : format(Math.round(day.value * 10) / 10)}
          </Text>
          <View style={s.barTrack}>
            {day.value !== undefined ? (
              <View
                style={[
                  s.barFill,
                  insulin
                    ? s.insulinBar
                    : day.partial
                    ? s.partialBar
                    : s.glucoseBar,
                  {
                    height: Math.max(2, (88 * day.value) / max),
                  },
                ]}>
                {insulin && day.basal !== undefined && day.value > 0 ? (
                  <View
                    style={[
                      s.basalFill,
                      {
                        height: `${Math.min(
                          100,
                          (day.basal / day.value) * 100,
                        )}%`,
                      },
                    ]}
                  />
                ) : null}
              </View>
            ) : (
              <View style={s.missingBar} />
            )}
          </View>
          <Text style={s.barDay} numberOfLines={1}>
            {new Date(day.startMs).toLocaleDateString(
              locale === 'he' ? 'he-IL' : 'en-US',
              {weekday: 'short'},
            )}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface HomeWidgetProps {
  id: HomeWidgetId;
  locale: Locale;
  nowMs: number;
  preferences: StoredHomePreferences;
  thresholds: TrendsRangeThresholds;
  today: HomeLaneState<HomeTodayData>;
  weeklyGlucose: HomeLaneState<HomeWeeklyGlucoseData>;
  weeklyInsulin: HomeLaneState<HomeWeeklyInsulinData>;
  insulinComparison?: HomeLaneState<DailyInsulinComparisonPresentation>;
  chatReady: boolean;
  onOpen?: (id: HomeWidgetId, dayStartMs?: number) => void;
  preview?: boolean;
}
export function HomeWidget({
  id,
  locale,
  nowMs,
  preferences,
  thresholds,
  today,
  weeklyGlucose,
  weeklyInsulin,
  insulinComparison,
  chatReady,
  onOpen,
  preview,
}: HomeWidgetProps) {
  const c = HOME_COPY[locale];
  const rtl = locale === 'he' && s.rtl;
  let body: React.ReactNode;
  if (id === 'chat') {
    body = (
      <View style={s.chatBody}>
        <Text style={[s.chatTitle, rtl]}>{c.chat}</Text>
        <Text style={[s.description, rtl]}>{c.chatHint}</Text>
        {!chatReady ? (
          <Text style={[s.note, rtl]}>{c.chatUnavailable}</Text>
        ) : null}
      </View>
    );
  } else if (id === 'weekly-glucose') {
    body = (
      <Lane state={weeklyGlucose} locale={locale}>
        {data => (
          <>
            <Text style={[s.note, rtl]}>
              {date(data.period.startMs, locale)} –{' '}
              {date(data.period.endMs - 1, locale)} · mg/dL
            </Text>
            <WeeklyBars
              locale={locale}
              days={data.days.map(day => ({
                startMs: day.period.startMs,
                value: day.overview.meanGlucoseMgDl,
                partial: day.overview.coverageQuality !== 'adequate',
              }))}
            />
            <Text style={[s.note, rtl]}>{c.partial}</Text>
          </>
        )}
      </Lane>
    );
  } else if (id === 'weekly-insulin') {
    body = (
      <Lane state={weeklyInsulin} locale={locale}>
        {data => (
          <>
            <Text style={[s.note, rtl]}>
              {date(data.period.startMs, locale)} –{' '}
              {date(data.period.endMs - 1, locale)} · U
            </Text>
            <WeeklyBars
              locale={locale}
              insulin
              onOpenDay={
                onOpen && !preview
                  ? dayStartMs => onOpen(id, dayStartMs)
                  : undefined
              }
              days={data.days.map(day => ({
                startMs: day.period.startMs,
                ...(day.kind === 'ready' &&
                day.insulinSummary.quality === 'available'
                  ? {
                      value: day.insulinSummary.totalUnits,
                      basal: day.insulinSummary.basalUnits,
                    }
                  : {}),
              }))}
            />
            <View style={[s.legend, locale === 'he' && s.reverse]}>
              <Text style={s.basalLegend}>● {c.basal}</Text>
              <Text style={s.bolusLegend}>● {c.bolus}</Text>
            </View>
            <Text style={[s.note, rtl]}>
              {
                data.days.filter(
                  day =>
                    day.kind === 'ready' &&
                    day.insulinSummary.quality === 'available',
                ).length
              }
              /7 {c.daysAvailable}. {c.insulinNote}
            </Text>
            {!preview && onOpen ? (
              <Text style={[s.note, rtl]}>
                {locale === 'he'
                  ? 'לחצו על יום לפתיחת הפירוט.'
                  : 'Tap a day to open its details.'}
              </Text>
            ) : null}
          </>
        )}
      </Lane>
    );
  } else {
    body = (
      <Lane state={today} locale={locale}>
        {data => (
          <>
            {id === 'glucose-graph' ? (
              <GlucoseMiniChart
                data={data}
                hours={preferences.glucoseWindowHours}
                thresholds={thresholds}
                locale={locale}
                nowMs={nowMs}
              />
            ) : id === 'time-in-range' ? (
              data.overview.ranges ? (
                <>
                  <View style={[s.rangeRow, locale === 'he' && s.reverse]}>
                    <RangeGraphic
                      ranges={data.overview.ranges}
                      variant="ring"
                    />
                    <View style={s.rangeText}>
                      <Text style={[s.big, locale === 'he' && s.numericRtl]}>
                        {format(data.overview.ranges.targetPercent)}%
                      </Text>
                      <Text style={[s.description, rtl]}>{c.rangeNote}</Text>
                      <Text
                        style={[
                          s.note,
                          s.numericLtr,
                          locale === 'he' && s.numericRtl,
                        ]}>
                        {thresholds.targetMinMgDl}–{thresholds.targetMaxMgDl}{' '}
                        mg/dL
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.note, rtl]}>
                    {c.coverage}: {format(data.elapsedCoverage.coveragePercent)}
                    %
                  </Text>
                </>
              ) : (
                <Text style={s.empty}>{c.noGlucose}</Text>
              )
            ) : (
              <HomeDailyInsulin
                data={data}
                locale={locale}
                comparison={preview ? undefined : insulinComparison}
              />
            )}
            <Text style={[s.note, rtl]}>
              {c.today} · {c.to} {time(data.observedPeriod.endMs, locale)}
            </Text>
          </>
        )}
      </Lane>
    );
  }
  return (
    <View
      style={[s.card, id === 'chat' && s.chatCard]}
      testID={`home-widget-${id}`}>
      <View style={[s.header, locale === 'he' && s.reverse]}>
        <View
          style={[s.iconBox, {backgroundColor: `${HOME_WIDGET_COLORS[id]}12`}]}>
          <Text style={[s.icon, {color: HOME_WIDGET_COLORS[id]}]}>
            {HOME_WIDGET_ICONS[id]}
          </Text>
        </View>
        <View style={s.heading}>
          <Text style={[s.title, rtl]} accessibilityRole="header">
            {c.labels[id]}
          </Text>
          {id.startsWith('weekly') ? (
            <Text style={[s.note, rtl]}>{c.week}</Text>
          ) : null}
        </View>
      </View>
      {body}
      {onOpen && !preview && id !== 'weekly-insulin' ? (
        <Pressable
          testID={`home-open-${id}`}
          accessibilityRole="button"
          accessibilityLabel={`${c.open}: ${c.labels[id]}`}
          onPress={() => onOpen(id)}
          style={({pressed}) => [s.open, pressed && s.pressed]}>
          <Text style={s.openText}>
            {id === 'chat' ? c.chatOpen : c.open} {locale === 'he' ? '←' : '→'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8EE',
    gap: 10,
    width: '100%',
  },
  header: {flexDirection: 'row', gap: 10, alignItems: 'center'},
  heading: {flex: 1, minWidth: 0},
  title: {fontSize: 17, lineHeight: 24, fontWeight: '700', color: '#253B4C'},
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {fontSize: 25},
  big: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700',
    color: '#18354B',
    writingDirection: 'ltr',
  },
  unit: {fontSize: 15, fontWeight: '500', color: '#5C6875'},
  note: {fontSize: 12, lineHeight: 18, color: '#627484'},
  description: {fontSize: 14, lineHeight: 22, color: '#506579'},
  empty: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: '#627484',
    paddingVertical: 28,
  },
  warning: {fontSize: 12, color: '#8C581A'},
  inline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  numericRtl: {textAlign: 'right'},
  numericLtr: {writingDirection: 'ltr'},
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  rangeText: {flex: 1, minWidth: 96},
  bars: {flexDirection: 'row', gap: 5, paddingTop: 8},
  barColumn: {flex: 1, minWidth: 0, gap: 5, alignItems: 'center'},
  barValue: {fontSize: 11, color: '#465D70', fontWeight: '600'},
  barTrack: {
    height: 90,
    width: '65%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  insulinBar: {backgroundColor: '#AD98D5'},
  partialBar: {backgroundColor: '#A9C9E3'},
  glucoseBar: {backgroundColor: '#4388B9'},
  basalFill: {backgroundColor: '#7560B1', width: '100%'},
  missingBar: {width: '100%', height: 2, backgroundColor: '#D5DDE5'},
  barDay: {fontSize: 11, color: '#627484'},
  legend: {flexDirection: 'row', gap: 14},
  basalLegend: {fontSize: 12, color: '#7560B1'},
  bolusLegend: {fontSize: 12, color: '#8971B3'},
  chatCard: {backgroundColor: '#F0F3FC', borderColor: '#DCE3F3'},
  chatBody: {gap: 8, paddingVertical: 10},
  chatTitle: {fontSize: 23, fontWeight: '700', color: '#35476C'},
  open: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: '#E9EDF3',
    paddingTop: 10,
    marginTop: 2,
    justifyContent: 'center',
  },
  openText: {
    color: '#1769AA',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {opacity: 0.65},
});
