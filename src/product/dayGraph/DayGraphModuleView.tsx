import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {LayoutChangeEvent, ScrollView} from 'react-native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useTheme} from 'styled-components/native';
import type {ThemeType} from '../../types/theme';
import type {
  DayGraphDataSource,
  DayGraphModel,
  DayGraphPeriod,
  DayGraphTimelineItem,
} from '../../modules/dayGraph';
import {buildDayGraph} from '../../modules/dayGraph';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import {PreMealAssistanceCard} from './PreMealAssistanceCard';
import {RichDayGraphChart} from './RichDayGraphChart';
import type {
  DayGraphChartPreferencesRuntime,
  PreMealAssistanceRuntime,
} from './runtime';
import {useDayGraphSnapshot} from './useDayGraphSnapshot';
import {useRefreshingNow} from '../time';

const MINUTE_MS = 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * MINUTE_MS;
const PHONE_VIEWPORT_MAX_WIDTH = 768;

export type DayGraphInitialFocus = Extract<
  DestinationFocus,
  {readonly kind: 'day'}
>;

export interface DayGraphModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: DayGraphDataSource;
  readonly initialFocus?: DayGraphInitialFocus;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly preMealAssistance?: PreMealAssistanceRuntime;
  readonly chartPreferences?: DayGraphChartPreferencesRuntime;
  readonly onOpenJournalEntry?: (item: DayGraphTimelineItem) => void;
}

const COPY = {
  en: {
    title: 'Day graph',
    subtitle: 'Glucose readings and recorded events for one selected day.',
    previous: 'Previous day',
    next: 'Next day',
    today: 'Today',
    showToday: 'Show today',
    loading: 'Loading this day…',
    error: 'This day could not be loaded.',
    retry: 'Try again',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    refreshFailed: 'Could not refresh. The last loaded data is still shown.',
    openEntry: 'Open details',
    focusEvent: 'Show on graph',
    stale: 'Saved data',
    staleAt: 'Last refreshed',
    empty: 'No glucose readings or timeline items were found for this day.',
    graph: 'Glucose',
    noGlucose: 'No glucose readings were found for this day.',
    dataGap: 'visible data gap',
    dataGaps: 'visible data gaps',
    gapExplanation: 'The line is separated where readings are missing.',
    timeline: 'Timeline',
    noTimeline: 'No timeline items were found for this day.',
    readings: 'glucose readings',
    minimum: 'Minimum',
    maximum: 'Maximum',
    first: 'First',
    last: 'Last',
    at: 'at',
    timelineItems: 'timeline items',
    treatment: 'Treatment record',
    externalCarb: 'External carbohydrate record',
    meal: 'Meal',
    activity: 'Activity',
    grams: 'g carbohydrates',
    preMealPrompt: 'Planning a meal?',
    preMealPromptDetail:
      'Open a 90-minute factual context card for the meal you are planning.',
    preMealStart: 'Show pre-meal context',
  },
  he: {
    title: 'גרף יומי',
    subtitle: 'קריאות סוכר ואירועים שנרשמו ביום שנבחר.',
    previous: 'היום הקודם',
    next: 'היום הבא',
    today: 'היום',
    showToday: 'הצגת היום',
    loading: 'טוען את היום…',
    error: 'לא הצלחנו לטעון את היום הזה.',
    retry: 'ניסיון נוסף',
    refresh: 'רענון',
    refreshing: 'מרענן…',
    refreshFailed: 'הרענון לא הצליח. הנתונים האחרונים עדיין מוצגים.',
    openEntry: 'פתיחת פירוט',
    focusEvent: 'הצגה בגרף',
    stale: 'נתונים שמורים',
    staleAt: 'רענון אחרון',
    empty: 'לא נמצאו קריאות סוכר או אירועים ביום הזה.',
    graph: 'סוכר',
    noGlucose: 'לא נמצאו קריאות סוכר ביום הזה.',
    dataGap: 'פער נתונים גלוי',
    dataGaps: 'פערי נתונים גלויים',
    gapExplanation: 'הקו מופרד במקומות שבהם חסרות קריאות.',
    timeline: 'ציר זמן',
    noTimeline: 'לא נמצאו אירועים ביום הזה.',
    readings: 'קריאות סוכר',
    minimum: 'מינימום',
    maximum: 'מקסימום',
    first: 'ראשונה',
    last: 'אחרונה',
    at: 'בשעה',
    timelineItems: 'אירועים בציר הזמן',
    treatment: 'רשומת טיפול',
    externalCarb: 'רשומת פחמימות חיצונית',
    meal: 'ארוחה',
    activity: 'פעילות',
    grams: 'גרם פחמימות',
    preMealPrompt: 'מתכננים ארוחה?',
    preMealPromptDetail:
      'פתיחת כרטיס הקשר עובדתי למשך 90 דקות עבור הארוחה שמתוכננת.',
    preMealStart: 'הצגת הקשר לפני ארוחה',
  },
} as const;

const systemNow = (): number => Date.now();

const startOfLocalDay = (timestampMs: number): number => {
  const value = new Date(timestampMs);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
};

const moveLocalDays = (dayStartMs: number, amount: number): number => {
  const value = new Date(dayStartMs);
  value.setDate(value.getDate() + amount);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
};

const periodForLocalDay = (dayStartMs: number): DayGraphPeriod => ({
  dayStartMs,
  dayEndMs: moveLocalDays(dayStartMs, 1),
});

const validInitialDay = (
  initialFocus: DayGraphInitialFocus | undefined,
  now: () => number,
): number =>
  initialFocus && Number.isFinite(initialFocus.dayStartMs)
    ? initialFocus.dayStartMs
    : startOfLocalDay(now());

const formatDay = (timestampMs: number, locale: DestinationLocale): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestampMs));

const formatCompactDay = (
  timestampMs: number,
  locale: DestinationLocale,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestampMs));

const formatTime = (timestampMs: number, locale: DestinationLocale): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));

const itemKindLabel = (
  item: DayGraphTimelineItem,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  switch (item.kind) {
    case 'treatment':
      return copy.treatment;
    case 'external-carb':
      return copy.externalCarb;
    case 'journal-meal':
      return copy.meal;
    case 'journal-activity':
      return copy.activity;
  }
};

const itemAccent = (item: DayGraphTimelineItem): string => {
  switch (item.kind) {
    case 'treatment':
      return '#7C3AED';
    case 'external-carb':
      return '#D97706';
    case 'journal-meal':
      return '#EA580C';
    case 'journal-activity':
      return '#059669';
  }
};

const accessibilitySummary = (
  model: DayGraphModel,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  const summary = model.glucoseSummary;
  const timeline = `${model.timelineItems.length} ${copy.timelineItems}.`;
  if (!summary) {
    return `${copy.noGlucose} ${timeline}`;
  }
  const gaps = `${model.dataGaps.length} ${
    model.dataGaps.length === 1 ? copy.dataGap : copy.dataGaps
  }.`;
  return `${summary.sampleCount} ${copy.readings}. ${copy.minimum} ${
    summary.minimumMgDl
  } mg/dL. ${copy.maximum} ${summary.maximumMgDl} mg/dL. ${copy.first} ${
    summary.first.valueMgDl
  } mg/dL ${copy.at} ${formatTime(summary.first.timestampMs, locale)}. ${
    copy.last
  } ${summary.last.valueMgDl} mg/dL ${copy.at} ${formatTime(
    summary.last.timestampMs,
    locale,
  )}. ${gaps} ${timeline}`;
};

const glucosePointKey = (sourceId: string, recordId: string): string =>
  `${sourceId.length}:${sourceId}:${recordId}`;

const TimelineItemRow = ({
  item,
  locale,
  selected,
  onFocus,
  onOpen,
}: {
  readonly item: DayGraphTimelineItem;
  readonly locale: DestinationLocale;
  readonly selected: boolean;
  readonly onFocus: () => void;
  readonly onOpen?: (() => void) | undefined;
}) => {
  const rtl = locale === 'he';
  const copy = COPY[locale];
  const carbohydratesGrams =
    item.kind === 'external-carb' || item.kind === 'journal-meal'
      ? item.carbohydratesGrams
      : undefined;
  return (
    <View
      style={[
        styles.eventRow,
        selected && styles.eventSelected,
        rtl && styles.rowReverse,
      ]}>
      <View
        accessibilityElementsHidden
        style={[styles.eventAccent, {backgroundColor: itemAccent(item)}]}
      />
      <View style={styles.eventBody}>
        <View style={[styles.eventHeader, rtl && styles.rowReverse]}>
          <Text style={[styles.eventTime, rtl && styles.rtlText]}>
            {formatTime(item.timestampMs, locale)}
          </Text>
          <Text style={[styles.sourceLabel, rtl && styles.rtlText]}>
            {item.sourceLabel}
          </Text>
        </View>
        <Text style={[styles.eventTitle, rtl && styles.rtlText]}>
          {item.title}
        </Text>
        <Text style={[styles.eventMeta, rtl && styles.rtlText]}>
          {itemKindLabel(item, locale)}
          {carbohydratesGrams !== undefined
            ? ` · ${carbohydratesGrams} ${copy.grams}`
            : ''}
          {item.detail ? ` · ${item.detail}` : ''}
        </Text>
        <View style={[styles.eventActions, rtl && styles.rowReverse]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected}}
            accessibilityLabel={`${copy.focusEvent}: ${item.title}`}
            onPress={onFocus}
            style={styles.eventAction}
            testID={`day-graph-focus-${item.identity.recordId}`}>
            <Text style={styles.eventActionText}>{copy.focusEvent}</Text>
          </Pressable>
          {onOpen ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpen}
              style={styles.eventAction}
              testID={`day-graph-open-${item.identity.recordId}`}>
              <Text style={styles.eventActionText}>{copy.openEntry}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export const DayGraphModuleView = ({
  locale,
  dataSource,
  initialFocus,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  preMealAssistance,
  chartPreferences,
  onOpenJournalEntry,
}: DayGraphModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const theme = useTheme() as ThemeType;
  const phoneStyles = useMemo(() => createPhoneStyles(theme), [theme]);
  const phone = useWindowDimensions().width < PHONE_VIEWPORT_MAX_WIDTH;
  const currentTimeMs = useRefreshingNow({now});
  const todayStartMs = startOfLocalDay(currentTimeMs);
  const initialDayStartMs = validInitialDay(initialFocus, now);
  const [selectedDayStartMs, setSelectedDayStartMs] =
    useState(initialDayStartMs);
  const [selectedTimestampMs, setSelectedTimestampMs] = useState<
    number | undefined
  >(initialFocus?.atMs);
  const pageRef = useRef<ScrollView>(null);
  const chartTop = useRef<number | undefined>(undefined);
  const measuredPageHeight = useRef<number | undefined>(undefined);
  const [pageViewportHeight, setPageViewportHeight] = useState<number>();
  const [chartTopInPage, setChartTopInPage] = useState<number>();
  const handlePageLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    const roundedHeight = Math.round(height);
    if (measuredPageHeight.current === roundedHeight) {
      return;
    }
    measuredPageHeight.current = roundedHeight;
    setPageViewportHeight(roundedHeight);
  }, []);
  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    const top = event.nativeEvent.layout.y;
    if (!Number.isFinite(top) || top < 0) {
      return;
    }
    const roundedTop = Math.round(top);
    if (chartTop.current === roundedTop) {
      return;
    }
    chartTop.current = roundedTop;
    setChartTopInPage(roundedTop);
  }, []);
  const availableChartHeight =
    phone && pageViewportHeight !== undefined && chartTopInPage !== undefined
      ? Math.max(0, pageViewportHeight - chartTopInPage - theme.spacing.sm)
      : undefined;
  const period = useMemo(
    () => periodForLocalDay(selectedDayStartMs),
    [selectedDayStartMs],
  );

  useEffect(() => {
    setSelectedDayStartMs(current =>
      current === initialDayStartMs ? current : initialDayStartMs,
    );
  }, [initialDayStartMs]);
  useEffect(() => {
    setSelectedTimestampMs(initialFocus?.atMs);
  }, [initialFocus?.atMs, selectedDayStartMs]);
  const {state: loadState, refresh} = useDayGraphSnapshot(
    dataSource,
    period,
    selectedDayStartMs === todayStartMs,
  );
  const snapshot = loadState.kind === 'ready' ? loadState.snapshot : undefined;
  const model = useMemo(
    () =>
      snapshot
        ? buildDayGraph({
            ...snapshot,
            period,
            expectedSampleIntervalMs,
          })
        : undefined,
    [snapshot, period, expectedSampleIntervalMs],
  );
  const state = loadState;

  const nextDisabled = selectedDayStartMs >= todayStartMs;
  const hasChartData =
    !!model &&
    (model.glucoseSamples.length > 0 ||
      model.activeLoadSamples.length > 0 ||
      model.insulinEvents.length > 0 ||
      model.basalSchedule.length > 0);
  const hasUnavailableChartData =
    !!model &&
    Object.values(model.dataAvailability).some(
      status => status !== 'available',
    );
  const isEmpty =
    state.kind === 'ready' &&
    !hasChartData &&
    !hasUnavailableChartData &&
    model?.timelineItems.length === 0;

  const preMealContent = (
    <>
      {preMealAssistance?.settings.enabled &&
      preMealAssistance.intentActive === false &&
      preMealAssistance.onStartIntent &&
      selectedDayStartMs === todayStartMs ? (
        <View style={styles.preMealPrompt} testID="pre-meal-intent-prompt">
          <View style={styles.preMealPromptCopy}>
            <Text style={[styles.preMealPromptTitle, rtl && styles.rtlText]}>
              {copy.preMealPrompt}
            </Text>
            <Text style={[styles.preMealPromptDetail, rtl && styles.rtlText]}>
              {copy.preMealPromptDetail}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={preMealAssistance.onStartIntent}
            style={({pressed}) => [
              styles.preMealPromptAction,
              pressed && styles.pressed,
            ]}
            testID="pre-meal-start-intent">
            <Text style={styles.preMealPromptActionText}>
              {copy.preMealStart}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {preMealAssistance ? (
        <PreMealAssistanceCard
          locale={locale}
          now={now}
          period={period}
          runtime={preMealAssistance}
        />
      ) : null}
    </>
  );

  const summaryContent = model ? (
    <View
      accessible
      accessibilityLabel={accessibilitySummary(model, locale)}
      style={phone ? phoneStyles.summaryCard : styles.summaryCard}
      testID="day-graph-accessible-summary">
      <Text
        style={[
          phone ? phoneStyles.detailText : styles.summaryText,
          rtl && styles.rtlText,
        ]}>
        {accessibilitySummary(model, locale)}
      </Text>
    </View>
  ) : null;

  const graphContent = model ? (
    <>
      {model.glucoseSamples.length === 0 ? (
        <View
          style={phone ? phoneStyles.noGlucose : styles.subtleCard}
          testID="day-graph-no-glucose">
          <Text
            style={[
              phone ? phoneStyles.statusText : styles.stateText,
              rtl && styles.rtlText,
            ]}>
            {copy.noGlucose}
          </Text>
        </View>
      ) : null}
      <View onLayout={handleChartLayout} testID="day-graph-chart-frame">
        {hasChartData || hasUnavailableChartData ? (
          <View testID="day-graph-glucose-chart">
            <RichDayGraphChart
              locale={locale}
              model={model}
              selectedTimestampMs={selectedTimestampMs}
              {...(availableChartHeight === undefined
                ? {}
                : {availableHeight: availableChartHeight})}
              {...(chartPreferences === undefined
                ? {}
                : {preferences: chartPreferences})}
            />
          </View>
        ) : null}
      </View>
      {model.dataGaps.length > 0 ? (
        <View
          style={phone ? phoneStyles.summaryCard : styles.gapCard}
          testID="day-graph-data-gaps">
          <Text
            style={[
              phone ? phoneStyles.detailTitle : styles.gapTitle,
              rtl && styles.rtlText,
            ]}>
            {model.dataGaps.length}{' '}
            {model.dataGaps.length === 1 ? copy.dataGap : copy.dataGaps}
          </Text>
          <Text
            style={[
              phone ? phoneStyles.detailText : styles.gapDetail,
              rtl && styles.rtlText,
            ]}>
            {copy.gapExplanation}
          </Text>
        </View>
      ) : null}
    </>
  ) : null;

  return (
    <ProductPage
      scrollRef={pageRef}
      compact={phone}
      onLayout={handlePageLayout}
      style={phone && phoneStyles.page}
      {...(phone ? {header: null} : {})}
      locale={locale}
      subtitle={copy.subtitle}
      testID="day-graph-module-view"
      title={copy.title}>
      {!phone ? (
        <Text
          style={[styles.selectedDate, rtl && styles.rtlText]}
          testID="day-graph-selected-date">
          {formatDay(selectedDayStartMs, locale)}
        </Text>
      ) : null}
      <View
        style={[
          phone ? phoneStyles.controls : styles.controls,
          rtl && styles.rowReverse,
        ]}
        testID="day-graph-day-controls">
        <Pressable
          accessibilityLabel={copy.previous}
          accessibilityRole="button"
          onPress={() =>
            setSelectedDayStartMs(value => moveLocalDays(value, -1))
          }
          style={({pressed}) => [
            phone ? phoneStyles.iconControl : styles.dayControl,
            pressed && styles.pressed,
          ]}
          testID="day-graph-previous">
          <Text style={phone ? phoneStyles.iconText : styles.dayControlText}>
            {phone ? (rtl ? '›' : '‹') : `‹ ${copy.previous}`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          {...(phone
            ? {
                accessibilityLabel: `${copy.title}: ${formatDay(
                  selectedDayStartMs,
                  locale,
                )}`,
                accessibilityHint: copy.showToday,
              }
            : {})}
          onPress={() => setSelectedDayStartMs(todayStartMs)}
          style={({pressed}) => [
            phone ? phoneStyles.todayControl : styles.todayControl,
            pressed && styles.pressed,
          ]}
          testID="day-graph-today">
          {phone ? (
            <>
              <View
                style={[phoneStyles.todayTitleRow, rtl && styles.rowReverse]}
                testID="day-graph-phone-heading">
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={phoneStyles.todayTitle}>
                  {copy.title}
                </Text>
                <Text
                  style={phoneStyles.todayAction}>{` · ${copy.today}`}</Text>
              </View>
              <Text
                accessibilityLabel={formatDay(selectedDayStartMs, locale)}
                numberOfLines={1}
                style={phoneStyles.todayDate}
                testID="day-graph-selected-date">
                {formatCompactDay(selectedDayStartMs, locale)}
              </Text>
            </>
          ) : (
            <Text style={styles.todayControlText}>{copy.today}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={copy.next}
          accessibilityRole="button"
          accessibilityState={{disabled: nextDisabled}}
          disabled={nextDisabled}
          onPress={() =>
            setSelectedDayStartMs(value => moveLocalDays(value, 1))
          }
          style={({pressed}) => [
            phone ? phoneStyles.iconControl : styles.dayControl,
            nextDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="day-graph-next">
          <Text style={phone ? phoneStyles.iconText : styles.dayControlText}>
            {phone ? (rtl ? '‹' : '›') : `${copy.next} ›`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            state.kind === 'ready' && state.refreshing
              ? copy.refreshing
              : copy.refresh
          }
          accessibilityState={{
            disabled:
              state.kind === 'loading' ||
              (state.kind === 'ready' && state.refreshing),
            busy: state.kind === 'ready' && state.refreshing,
          }}
          disabled={
            state.kind === 'loading' ||
            (state.kind === 'ready' && state.refreshing)
          }
          onPress={refresh}
          style={phone ? phoneStyles.iconControl : styles.dayControl}
          testID="day-graph-refresh">
          {phone && state.kind === 'ready' && state.refreshing ? (
            <ActivityIndicator color={theme.textColor} size="small" />
          ) : (
            <Text style={phone ? phoneStyles.iconText : styles.dayControlText}>
              {phone
                ? '↻'
                : state.kind === 'ready' && state.refreshing
                ? copy.refreshing
                : copy.refresh}
            </Text>
          )}
        </Pressable>
      </View>
      {state.kind === 'ready' && state.refreshFailed ? (
        <Text
          accessibilityRole="alert"
          style={phone ? phoneStyles.statusText : styles.staleDetail}
          testID="day-graph-refresh-error">
          {copy.refreshFailed}
        </Text>
      ) : null}

      {!phone ? preMealContent : null}

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="day-graph-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="day-graph-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
            testID="day-graph-retry">
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : isEmpty ? (
        <View style={styles.stateCard} testID="day-graph-empty">
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.empty}
          </Text>
        </View>
      ) : state.kind === 'ready' && model ? (
        <>
          {state.snapshot.freshness.kind === 'stale' ? (
            <View
              style={phone ? phoneStyles.staleCard : styles.staleCard}
              testID="day-graph-stale">
              <Text
                style={[
                  phone ? phoneStyles.detailTitle : styles.staleTitle,
                  rtl && styles.rtlText,
                ]}>
                {copy.stale}
              </Text>
              <Text
                style={[
                  phone ? phoneStyles.statusText : styles.staleDetail,
                  rtl && styles.rtlText,
                ]}>
                {state.snapshot.freshness.reason ??
                  `${copy.staleAt}: ${formatTime(
                    state.snapshot.freshness.fetchedAtMs,
                    locale,
                  )}`}
              </Text>
            </View>
          ) : null}

          {!phone ? summaryContent : null}
          {phone ? (
            graphContent
          ) : (
            <ProductSection locale={locale} title={copy.graph}>
              {graphContent}
            </ProductSection>
          )}
          {phone ? summaryContent : null}

          {phone ? (
            <Text
              accessibilityRole="header"
              style={[phoneStyles.sectionTitle, rtl && styles.rtlText]}>
              {copy.timeline}
            </Text>
          ) : (
            <ProductSection locale={locale} title={copy.timeline}>
              {null}
            </ProductSection>
          )}
          <>
            {model.timelineItems.length === 0 ? (
              <View style={styles.subtleCard} testID="day-graph-no-timeline">
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.noTimeline}
                </Text>
              </View>
            ) : (
              <View style={styles.timeline} testID="day-graph-timeline">
                {model.timelineItems.map(item => (
                  <TimelineItemRow
                    item={item}
                    key={glucosePointKey(
                      item.identity.sourceId,
                      item.identity.recordId,
                    )}
                    locale={locale}
                    selected={selectedTimestampMs === item.timestampMs}
                    onFocus={() => {
                      setSelectedTimestampMs(item.timestampMs);
                      pageRef.current?.scrollTo({
                        y: chartTop.current ?? 0,
                        animated: true,
                      });
                    }}
                    onOpen={
                      onOpenJournalEntry &&
                      (item.kind === 'journal-meal' ||
                        item.kind === 'journal-activity')
                        ? () => onOpenJournalEntry(item)
                        : undefined
                    }
                  />
                ))}
              </View>
            )}
          </>
        </>
      ) : null}
      {phone ? preMealContent : null}
    </ProductPage>
  );
};

const createPhoneStyles = (theme: ThemeType) =>
  StyleSheet.create({
    page: {backgroundColor: theme.backgroundColor},
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    iconControl: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
    },
    iconText: {color: theme.textColor, fontSize: 26, lineHeight: 30},
    todayControl: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      minHeight: 44,
      backgroundColor: theme.buttonBackgroundColor,
      borderRadius: theme.borderRadius,
    },
    todayTitleRow: {flexDirection: 'row', alignItems: 'center'},
    todayTitle: {
      color: theme.buttonTextColor,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(theme.typography.size.xs * 1.35),
      fontWeight: '700',
    },
    todayAction: {
      color: theme.buttonTextColor,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(theme.typography.size.xs * 1.35),
    },
    todayDate: {
      color: theme.buttonTextColor,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(theme.typography.size.xs * 1.35),
    },
    staleCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    statusText: {color: theme.textColor, fontSize: 12, lineHeight: 17},
    noGlucose: {paddingVertical: theme.spacing.xs},
    summaryCard: {
      borderColor: theme.borderColor,
      borderWidth: 1,
      borderRadius: theme.borderRadius,
      padding: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    detailTitle: {
      color: theme.textColor,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    sectionTitle: {
      color: theme.textColor,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '700',
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    detailText: {color: theme.textColor, fontSize: 12, lineHeight: 18},
  });

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  selectedDate: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.lg,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: productUiTokens.spacing.md,
  },
  dayControl: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  dayControlText: {color: productUiTokens.colors.text, fontWeight: '700'},
  todayControl: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  todayControlText: {
    color: productUiTokens.colors.actionText,
    fontWeight: '800',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  preMealPrompt: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.md,
  },
  preMealPromptCopy: {flex: 1, minWidth: 210},
  preMealPromptTitle: {color: '#14532D', fontSize: 16, fontWeight: '900'},
  preMealPromptDetail: {color: '#166534', lineHeight: 19, marginTop: 3},
  preMealPromptAction: {
    alignItems: 'center',
    backgroundColor: '#15803D',
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginStart: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.xs,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  preMealPromptActionText: {color: '#FFFFFF', fontWeight: '900'},
  stateText: {
    color: productUiTokens.colors.textMuted,
    lineHeight: 21,
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '800'},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '800'},
  staleCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.md,
  },
  staleTitle: {color: '#9A3412', fontWeight: '800'},
  staleDetail: {color: '#9A3412', marginTop: productUiTokens.spacing.xs},
  summaryCard: {
    backgroundColor: '#E7F1FA',
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  summaryText: {color: productUiTokens.colors.text, lineHeight: 20},
  chartFrame: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    height: 230,
    overflow: 'hidden',
    padding: productUiTokens.spacing.xs,
    width: '100%',
  },
  subtleCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  gapCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.sm,
    padding: productUiTokens.spacing.md,
  },
  gapTitle: {color: '#475569', fontWeight: '800'},
  gapDetail: {color: '#64748B', marginTop: productUiTokens.spacing.xs},
  timeline: {width: '100%'},
  eventRow: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: productUiTokens.spacing.sm,
    minHeight: 88,
    overflow: 'hidden',
  },
  eventAccent: {width: 6},
  eventSelected: {borderColor: productUiTokens.colors.action, borderWidth: 2},
  eventActions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  eventAction: {minHeight: 40, justifyContent: 'center', paddingEnd: 20},
  eventActionText: {color: productUiTokens.colors.action, fontWeight: '700'},
  eventBody: {flex: 1, padding: productUiTokens.spacing.md},
  eventHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventTime: {color: productUiTokens.colors.text, fontWeight: '800'},
  sourceLabel: {
    backgroundColor: '#EEF2FF',
    borderRadius: productUiTokens.radii.pill,
    color: '#4338CA',
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: productUiTokens.spacing.sm,
    paddingVertical: 3,
  },
  eventTitle: {
    color: productUiTokens.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.sm,
  },
  eventMeta: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.xs,
  },
});
