// /Trends/TrendsContainer.tsx

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, ScrollView, Text, Pressable} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {differenceInCalendarDays} from 'date-fns';
import {useTheme} from 'styled-components/native';
import {StackActions, useNavigation} from '@react-navigation/native';
import {dispatchToParentOrSelf} from 'app/utils/navigationDispatch.utils';

import {ThemeType} from 'app/types/theme';

import {useTrendsData} from './hooks/useTrendsData';
import {calculateTrendsMetrics} from './utils/trendsCalculations';
import {fetchBgDataForDateRange} from 'app/api/apiRequests';
import {CHUNK_SIZE} from './Trends.constants';
import {BgSample} from 'app/types/day_bgs.types';

// Components
import {DataFetchStatus} from './components/DataFetchStatus';
import {DateRangeSelector} from './components/DateRangeSelector';
import {CompareSection} from './components/CompareSection';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
// (If you have insulin data, pass it in above.)

import {AGPSummary} from 'app/components/charts/AGPGraph';
import QuickStatsRow from './components/QuickStatsRow';
import {useTrendsQuickStats} from './hooks/useTrendsQuickStats';
import {extractHypoEvents} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';
import {useLoopModeStats} from './hooks/useLoopModeStats';
import {
  buildDateRangeChunks,
  buildPreviousComparisonRange,
} from './utils/comparisonRanges';
import {addOpacity} from 'app/style/styling.utils';

import {TrendsContainer, SectionTitle} from './styles/Trends.styles';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {HYPO_INVESTIGATION_SCREEN} from 'app/constants/SCREEN_NAMES';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const formatLoopHours = (minutes: number) => {
  const hours = Math.max(0, minutes) / 60;
  return hours >= 10
    ? String(Math.round(hours))
    : String(Number(hours.toFixed(1)));
};

const formatLoopValue = (value: number | null | undefined, decimals = 0) =>
  value == null || !Number.isFinite(value) ? '-' : value.toFixed(decimals);

const Trends: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation();
  const {language} = useAppLanguage();
  const isRTL = language === 'he';

  const [presetDays, setPresetDays] = useState<number>(7);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [loopViewMode, setLoopViewMode] = useState<'both' | 'open' | 'closed'>(
    'both',
  );
  const [showLoopDiagnostics, setShowLoopDiagnostics] = useState(false);

  const isCustomRange = useMemo(
    () => Boolean(customStartDate && customEndDate),
    [customEndDate, customStartDate],
  );

  // 1) Calculate date range
  const {start, end, rangeDays} = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const normalizeStart = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    const normalizeEnd = (d: Date) => {
      const x = new Date(d);
      if (x.getTime() > today.getTime()) x.setTime(today.getTime());
      x.setHours(23, 59, 59, 999);
      return x;
    };

    // Custom date range (From/To)
    if (customStartDate && customEndDate) {
      let start = normalizeStart(customStartDate);
      let end = normalizeEnd(customEndDate);

      if (end.getTime() < start.getTime()) {
        const tmp = start;
        start = normalizeStart(end);
        end = normalizeEnd(tmp);
      }

      const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
      return {start, end, rangeDays: days};
    }

    // Preset ranges (7/14/30)
    const end = today;
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (presetDays - 1));
    return {start, end, rangeDays: presetDays};
  }, [customStartDate, customEndDate, presetDays]);

  // 2) Use custom hook for BG data
  const {
    bgData,
    isLoading,
    fetchError,
    daysFetched,
    fetchCancelled,
    loadingStepIndex,
    cancelFetch,
    showLongWaitWarning,
    showMaxWaitReached,
    finalMetrics,
  } = useTrendsData({rangeDays, start, end});

  const {stats: quickStats} = useTrendsQuickStats({
    bgData,
    start,
    end,
    rangeDays,
  });
  const {
    stats: loopModeStats,
    isLoading: isLoopModeStatsLoading,
    fetchError: loopModeStatsError,
    rowsFetched: loopModeRowsFetched,
  } = useLoopModeStats({start, end, bgData});

  const hypoInvestigationNavLockRef = useRef(false);
  const hypoInvestigationUnlockTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [isOpeningHypoInvestigation, setIsOpeningHypoInvestigation] =
    useState(false);

  const severeHypoThreshold = useMemo(() => {
    const raw = cgmRange[CGM_STATUS_CODES.EXTREME_LOW];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : cgmRange.TARGET.min;
  }, []);

  const longestSevereHypoDurationLabel = useMemo(() => {
    if (!bgData?.length) return null;
    const events = extractHypoEvents({
      bgData,
      lowThreshold: severeHypoThreshold,
    });
    if (!events.length) return null;
    const maxMs = events.reduce(
      (m, e) => Math.max(m, Math.max(0, e.endMs - e.startMs)),
      0,
    );
    const minutes = Math.max(1, Math.round(maxMs / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
  }, [bgData, severeHypoThreshold]);

  const openHypoInvestigation = useCallback(() => {
    if (hypoInvestigationNavLockRef.current) return;
    hypoInvestigationNavLockRef.current = true;
    setIsOpeningHypoInvestigation(true);

    if (hypoInvestigationUnlockTimeoutRef.current != null) {
      clearTimeout(hypoInvestigationUnlockTimeoutRef.current);
      hypoInvestigationUnlockTimeoutRef.current = null;
    }

    const payload = {
      startMs: start.getTime(),
      endMs: end.getTime(),
      lowThreshold: severeHypoThreshold,
    };

    const action = StackActions.push(HYPO_INVESTIGATION_SCREEN, payload);
    dispatchToParentOrSelf({
      navigation,
      action,
      fallbackNavigate: () =>
        (navigation as any).navigate?.(HYPO_INVESTIGATION_SCREEN, payload),
    });

    // Safety: if navigation fails for any reason, unlock after a short delay.
    hypoInvestigationUnlockTimeoutRef.current = setTimeout(() => {
      hypoInvestigationNavLockRef.current = false;
      setIsOpeningHypoInvestigation(false);
      hypoInvestigationUnlockTimeoutRef.current = null;
    }, 4000);
  }, [end, navigation, severeHypoThreshold, start]);

  useEffect(() => {
    const unsubscribeFocus = (navigation as any)?.addListener?.('focus', () => {
      hypoInvestigationNavLockRef.current = false;
      setIsOpeningHypoInvestigation(false);

      if (hypoInvestigationUnlockTimeoutRef.current != null) {
        clearTimeout(hypoInvestigationUnlockTimeoutRef.current);
        hypoInvestigationUnlockTimeoutRef.current = null;
      }
    });

    const unsubscribeBlur = (navigation as any)?.addListener?.('blur', () => {
      // If we successfully navigated away, stop showing loading.
      // The lock is also safe to release because the user can't spam the button
      // while this screen is not focused.
      hypoInvestigationNavLockRef.current = false;
      setIsOpeningHypoInvestigation(false);

      if (hypoInvestigationUnlockTimeoutRef.current != null) {
        clearTimeout(hypoInvestigationUnlockTimeoutRef.current);
        hypoInvestigationUnlockTimeoutRef.current = null;
      }
    });

    return () => {
      if (typeof unsubscribeFocus === 'function') unsubscribeFocus();
      if (typeof unsubscribeBlur === 'function') unsubscribeBlur();

      if (hypoInvestigationUnlockTimeoutRef.current != null) {
        clearTimeout(hypoInvestigationUnlockTimeoutRef.current);
        hypoInvestigationUnlockTimeoutRef.current = null;
      }
    };
  }, [navigation]);

  // 3) Compare logic
  const [showComparison, setShowComparison] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previousMetrics, setPreviousMetrics] = useState<
    typeof finalMetrics | null
  >(null);
  const [previousBgData, setPreviousBgData] = useState<BgSample[]>([]);
  const [comparisonOffset, setComparisonOffset] = useState(rangeDays);
  const [comparisonDateRange, setComparisonDateRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const compareRequestIdRef = useRef(0);

  const resetComparison = useCallback(
    (nextRangeDays?: number) => {
      compareRequestIdRef.current += 1;
      setShowComparison(false);
      setComparing(false);
      setPreviousMetrics(null);
      setPreviousBgData([]);
      setComparisonDateRange(null);
      setComparisonOffset(nextRangeDays ?? rangeDays);
    },
    [rangeDays],
  );

  const handlePresetDaysChange = useCallback(
    (days: number) => {
      setPresetDays(days);
      setCustomStartDate(null);
      setCustomEndDate(null);
      resetComparison(days);
    },
    [resetComparison],
  );

  const handleCustomStartChange = useCallback(
    (date: Date) => {
      setCustomStartDate(date);
      setCustomEndDate(prev => prev ?? new Date());
      resetComparison();
    },
    [resetComparison],
  );

  const handleCustomEndChange = useCallback(
    (date: Date) => {
      setCustomEndDate(date);
      setCustomStartDate(prev => prev ?? new Date(date));
      resetComparison();
    },
    [resetComparison],
  );

  async function handleCompare(offset = rangeDays) {
    const requestId = compareRequestIdRef.current + 1;
    compareRequestIdRef.current = requestId;
    setComparisonOffset(offset);
    setComparing(true);
    setPreviousMetrics(null);
    setPreviousBgData([]);

    try {
      const previousRange = buildPreviousComparisonRange({
        currentStart: start,
        rangeDays,
        offsetDays: offset,
      });

      if (compareRequestIdRef.current !== requestId) {
        return;
      }

      setComparisonDateRange(previousRange);

      // We need to fetch data in chunks, similar to useTrendsData
      let fetchedPreviousBgData: BgSample[] = [];

      for (const chunk of buildDateRangeChunks(previousRange, CHUNK_SIZE)) {
        const dataChunk = await fetchBgDataForDateRange(chunk.start, chunk.end);
        if (compareRequestIdRef.current !== requestId) {
          return;
        }
        fetchedPreviousBgData = fetchedPreviousBgData.concat(dataChunk);
      }

      if (compareRequestIdRef.current !== requestId) {
        return;
      }

      const metrics = calculateTrendsMetrics(fetchedPreviousBgData);
      setPreviousBgData(fetchedPreviousBgData);
      setPreviousMetrics(metrics);
      setShowComparison(true);
    } catch (e: any) {
      console.log('Failed to compare previous period:', e.message);
      // Optionally, handle the error in the UI
    } finally {
      if (compareRequestIdRef.current === requestId) {
        setComparing(false);
      }
    }
  }

  const changeComparisonPeriod = (direction: 'back' | 'forward') => {
    const newOffset =
      direction === 'back'
        ? comparisonOffset + rangeDays
        : Math.max(rangeDays, comparisonOffset - rangeDays);
    setComparisonOffset(newOffset);
    handleCompare(newOffset);
  };

  const renderLoopMetricTile = ({
    icon,
    label,
    value,
  }: {
    icon: string;
    label: string;
    value: string;
  }) => (
    <View
      key={label}
      style={{
        flexGrow: 1,
        minWidth: 86,
        borderRadius: 10,
        paddingHorizontal: 9,
        paddingVertical: 8,
        backgroundColor: addOpacity(theme.textColor, 0.055),
      }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 5,
        }}>
        <MaterialIcons
          name={icon}
          size={14}
          color={addOpacity(theme.textColor, 0.7)}
        />
        <Text
          style={{
            color: addOpacity(theme.textColor, 0.64),
            fontSize: 11,
            fontWeight: '700',
          }}>
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 3,
          color: theme.textColor,
          fontSize: 15,
          fontWeight: '800',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {value}
      </Text>
    </View>
  );

  const renderLoopModeCard = (mode: 'open' | 'closed') => {
    const isOpen = mode === 'open';
    const color = isOpen ? '#f39c12' : '#2ecc71';
    const minutes = isOpen
      ? loopModeStats.openMinutes
      : loopModeStats.closedMinutes;
    const reliable = isOpen
      ? loopModeStats.openMetricsReliable
      : loopModeStats.closedMetricsReliable;
    const avgBg = isOpen ? loopModeStats.openAvgBg : loopModeStats.closedAvgBg;
    const tirPct = isOpen
      ? loopModeStats.openTirPct
      : loopModeStats.closedTirPct;
    const pct = isOpen ? loopModeStats.openPct : loopModeStats.closedPct;

    return (
      <View
        style={{
          borderRadius: 12,
          padding: 12,
          backgroundColor: addOpacity(color, 0.1),
          borderWidth: 1,
          borderColor: addOpacity(color, 0.22),
          gap: 10,
        }}>
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 7,
            }}>
            <MaterialIcons
              name={isOpen ? 'radio-button-unchecked' : 'lock-outline'}
              size={18}
              color={color}
            />
            <Text
              style={{
                color: theme.textColor,
                fontSize: 15,
                fontWeight: '800',
              }}>
              {language === 'he'
                ? isOpen
                  ? 'לופ פתוח'
                  : 'לופ סגור'
                : isOpen
                ? 'Open loop'
                : 'Closed loop'}
            </Text>
          </View>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 20,
              fontWeight: '800',
            }}>
            {pct.toFixed(1)}%
          </Text>
        </View>

        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            flexWrap: 'wrap',
            gap: 8,
          }}>
          {[
            {
              icon: 'schedule',
              label: language === 'he' ? 'זמן' : 'Time',
              value:
                language === 'he'
                  ? `${formatLoopHours(minutes)} ש׳`
                  : `${formatLoopHours(minutes)}h`,
            },
            {
              icon: 'show-chart',
              label: language === 'he' ? 'ממוצע' : 'Avg',
              value: reliable ? formatLoopValue(avgBg) : '-',
            },
            {
              icon: 'check-circle-outline',
              label: 'TIR',
              value: reliable ? `${formatLoopValue(tirPct, 1)}%` : '-',
            },
          ].map(renderLoopMetricTile)}
        </View>
      </View>
    );
  };

  const renderBasalPill = ({
    icon,
    label,
    pct,
    minutes,
  }: {
    icon: string;
    label: string;
    pct: number;
    minutes: number;
  }) => (
    <View
      key={label}
      style={{
        flexGrow: 1,
        minWidth: 138,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: addOpacity(theme.textColor, 0.055),
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 7,
      }}>
      <MaterialIcons
        name={icon}
        size={15}
        color={addOpacity(theme.textColor, 0.72)}
      />
      <Text
        style={{
          flexShrink: 1,
          color: theme.textColor,
          fontSize: 12,
          fontWeight: '700',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {label}
      </Text>
      <Text
        style={{
          marginLeft: isRTL ? 0 : 'auto',
          marginRight: isRTL ? 'auto' : 0,
          color: addOpacity(theme.textColor, 0.72),
          fontSize: 12,
          fontWeight: '700',
        }}>
        {pct.toFixed(1)}% ·{' '}
        {language === 'he'
          ? `${formatLoopHours(minutes)} ש׳`
          : `${formatLoopHours(minutes)}h`}
      </Text>
    </View>
  );

  return (
    <TrendsContainer testID={E2E_TEST_IDS.screens.trends}>
      {/* 1. Date Range Buttons */}
      <DateRangeSelector
        presetDays={presetDays}
        onPresetDaysChange={handlePresetDaysChange}
        isCustomRange={isCustomRange}
        rangeDays={rangeDays}
        startDate={start}
        endDate={end}
        onStartDateChange={handleCustomStartChange}
        onEndDateChange={handleCustomEndChange}
      />

      {/* 3. Loading/Error/No data status */}
      <DataFetchStatus
        isLoading={isLoading}
        fetchError={fetchError}
        daysFetched={daysFetched}
        rangeDays={rangeDays}
        loadingStepIndex={loadingStepIndex}
        fetchCancelled={fetchCancelled}
        cancelFetch={cancelFetch}
        showLongWaitWarning={showLongWaitWarning}
        showMaxWaitReached={showMaxWaitReached}
      />

      {/* 4. No data case */}
      {!isLoading && !fetchError && bgData.length === 0 && !fetchCancelled && (
        <View
          style={{alignItems: 'center', marginVertical: theme.spacing.sm + 2}}>
          <Text style={{color: theme.textColor}}>
            {tr(language, 'trends.noBgData')}
          </Text>
        </View>
      )}

      {/* 5. Partial data if user canceled */}
      {!isLoading && fetchCancelled && finalMetrics.dailyDetails.length > 0 && (
        <View
          style={{alignItems: 'center', marginVertical: theme.spacing.sm + 2}}>
          <Text>
            {tr(language, 'trends.loadingCancelledPartial', {
              daysFetched,
              rangeDays,
            })}
          </Text>
        </View>
      )}

      {/* 6. Main content if data is present */}
      {!isLoading && !fetchError && finalMetrics.dailyDetails.length > 0 && (
        <ScrollView removeClippedSubviews={false}>
          {/* (a) Time In Range */}
          <View style={{marginBottom: theme.spacing.lg - 1}}>
            <SectionTitle>
              {tr(language, 'trends.keyGlucoseTrends')}
            </SectionTitle>
            <TimeInRangeRow bgData={bgData} />
          </View>

          {/* (b) Quick Stats */}
          <View
            testID={E2E_TEST_IDS.trends.quickStatsSection}
            style={{marginBottom: theme.spacing.lg - 1}}>
            <SectionTitle>{tr(language, 'trends.quickStats')}</SectionTitle>
            <QuickStatsRow
              avgTddUPerDay={quickStats.avgTddUPerDay}
              basalPct={quickStats.basalPct}
              bolusPct={quickStats.bolusPct}
              hyposPerWeek={quickStats.hyposPerWeek}
              nightTirPct={quickStats.nightTirPct}
              avgCarbsGPerDay={quickStats.avgCarbsGPerDay}
              longestHypoDurationLabel={longestSevereHypoDurationLabel}
              avgTddTestID={E2E_TEST_IDS.trends.quickStatsAvgTdd}
              onPressSevereHypos={openHypoInvestigation}
              isSevereHyposLoading={isOpeningHypoInvestigation}
            />
          </View>

          {/* (c) Open vs Closed loop – interactive compare */}
          <View style={{marginBottom: theme.spacing.lg - 1}}>
            <SectionTitle>
              {language === 'he' ? 'לופ פתוח מול סגור' : 'Open vs Closed Loop'}
            </SectionTitle>

            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                marginBottom: 10,
              }}>
              {(
                [
                  {key: 'both', labelHe: 'שניהם', labelEn: 'Both'},
                  {key: 'open', labelHe: 'רק פתוח', labelEn: 'Open only'},
                  {key: 'closed', labelHe: 'רק סגור', labelEn: 'Closed only'},
                ] as const
              ).map(opt => {
                const active = loopViewMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setLoopViewMode(opt.key)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active
                        ? theme.primaryColor
                        : addOpacity(theme.textColor, 0.25),
                      backgroundColor: active
                        ? addOpacity(theme.primaryColor, 0.2)
                        : addOpacity(theme.textColor, 0.04),
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      marginRight: isRTL ? 0 : 8,
                      marginLeft: isRTL ? 8 : 0,
                    }}>
                    <Text
                      style={{
                        color: theme.textColor,
                        fontWeight: active ? '700' : '500',
                      }}>
                      {language === 'he' ? opt.labelHe : opt.labelEn}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: addOpacity(theme.textColor, 0.12),
                backgroundColor: addOpacity(theme.textColor, 0.03),
                padding: 12,
                gap: 12,
              }}>
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}>
                <View
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    flex: 1,
                    gap: 8,
                  }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: addOpacity(theme.primaryColor, 0.16),
                    }}>
                    <MaterialIcons
                      name="settings-input-component"
                      size={18}
                      color={theme.primaryColor}
                    />
                  </View>
                  <View style={{flex: 1}}>
                    <Text
                      style={{
                        color: theme.textColor,
                        fontSize: 14,
                        fontWeight: '700',
                        textAlign: isRTL ? 'right' : 'left',
                      }}>
                      {language === 'he'
                        ? 'כיסוי נתוני לופ'
                        : 'Loop data coverage'}
                    </Text>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.68),
                        fontSize: 12,
                        textAlign: isRTL ? 'right' : 'left',
                      }}>
                      {isLoopModeStatsLoading
                        ? language === 'he'
                          ? 'טוען devicestatus...'
                          : 'Loading devicestatus...'
                        : language === 'he'
                        ? `לא ידוע ${loopModeStats.unknownPct.toFixed(1)}%`
                        : `Unknown ${loopModeStats.unknownPct.toFixed(1)}%`}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    minWidth: 74,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    backgroundColor: loopModeStats.hasEnoughLoopCoverage
                      ? addOpacity('#2ecc71', 0.16)
                      : addOpacity('#f1c40f', 0.16),
                    alignItems: 'center',
                  }}>
                  <Text
                    style={{
                      color: theme.textColor,
                      fontSize: 18,
                      fontWeight: '800',
                    }}>
                    {isLoopModeStatsLoading
                      ? '...'
                      : `${loopModeStats.knownCoveragePct.toFixed(0)}%`}
                  </Text>
                  <Text
                    style={{
                      color: addOpacity(theme.textColor, 0.68),
                      fontSize: 11,
                      fontWeight: '600',
                    }}>
                    {isLoopModeStatsLoading
                      ? language === 'he'
                        ? 'טוען'
                        : 'loading'
                      : language === 'he'
                      ? 'ידוע'
                      : 'known'}
                  </Text>
                </View>
              </View>

              {isLoopModeStatsLoading ? (
                <View
                  style={{
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: addOpacity(theme.textColor, 0.055),
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                  <MaterialIcons
                    name="hourglass-empty"
                    size={17}
                    color={addOpacity(theme.textColor, 0.72)}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: addOpacity(theme.textColor, 0.72),
                      fontSize: 13,
                      fontWeight: '700',
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                    {language === 'he'
                      ? 'טוען נתוני לופ מהשרת...'
                      : 'Loading loop data from the server...'}
                  </Text>
                </View>
              ) : (
                <>
                  {loopModeStatsError && (
                    <View
                      style={{
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: addOpacity('#e74c3c', 0.12),
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 7,
                      }}>
                      <MaterialIcons
                        name="error-outline"
                        size={16}
                        color={addOpacity(theme.textColor, 0.78)}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: addOpacity(theme.textColor, 0.75),
                          fontSize: 12,
                          fontWeight: '700',
                          textAlign: isRTL ? 'right' : 'left',
                        }}>
                        {language === 'he'
                          ? 'טעינת נתוני הלופ נכשלה.'
                          : 'Loop data failed to load.'}
                      </Text>
                    </View>
                  )}

                  {!loopModeStatsError && loopModeRowsFetched === 0 && (
                    <View
                      style={{
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: addOpacity('#f1c40f', 0.13),
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 7,
                      }}>
                      <MaterialIcons
                        name="info-outline"
                        size={16}
                        color={addOpacity(theme.textColor, 0.75)}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: addOpacity(theme.textColor, 0.72),
                          fontSize: 12,
                          fontWeight: '700',
                          textAlign: isRTL ? 'right' : 'left',
                        }}>
                        {language === 'he'
                          ? 'לא נמצאו נתוני devicestatus לטווח הזה.'
                          : 'No devicestatus data was found for this range.'}
                      </Text>
                    </View>
                  )}

                  {(loopViewMode === 'both' || loopViewMode === 'open') &&
                    renderLoopModeCard('open')}

                  {(loopViewMode === 'both' || loopViewMode === 'closed') &&
                    renderLoopModeCard('closed')}

                  {!loopModeStats.hasEnoughLoopCoverage && (
                    <View
                      style={{
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: addOpacity('#f1c40f', 0.13),
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 7,
                      }}>
                      <MaterialIcons
                        name="info-outline"
                        size={16}
                        color={addOpacity(theme.textColor, 0.75)}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: addOpacity(theme.textColor, 0.72),
                          fontSize: 12,
                          fontWeight: '600',
                          textAlign: isRTL ? 'right' : 'left',
                        }}>
                        {language === 'he'
                          ? 'אין מספיק כיסוי להשוואה חזקה בין פתוח לסגור.'
                          : 'Not enough coverage for a strong open/closed comparison.'}
                      </Text>
                    </View>
                  )}

                  {!loopModeStats.canCompareOpenClosed && (
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.65),
                        fontSize: 12,
                        textAlign: isRTL ? 'right' : 'left',
                      }}>
                      {language === 'he'
                        ? 'ממוצע ו-TIR מוצגים לכל מצב רק כשיש מספיק כיסוי ודגימות.'
                        : 'Avg and TIR are shown per mode only when coverage and samples are sufficient.'}
                    </Text>
                  )}
                </>
              )}

              <Pressable
                onPress={() => setShowLoopDiagnostics(v => !v)}
                style={{
                  alignSelf: isRTL ? 'flex-end' : 'flex-start',
                  paddingVertical: 4,
                }}>
                <Text
                  style={{
                    color: addOpacity(theme.primaryColor, 0.9),
                    fontSize: 12,
                    fontWeight: '600',
                  }}>
                  {language === 'he'
                    ? showLoopDiagnostics
                      ? 'הסתר דיאגנוסטיקה'
                      : 'הצג דיאגנוסטיקה'
                    : showLoopDiagnostics
                    ? 'Hide diagnostics'
                    : 'Show diagnostics'}
                </Text>
              </Pressable>

              {showLoopDiagnostics && (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: addOpacity(theme.textColor, 0.1),
                    paddingTop: 10,
                    gap: 6,
                  }}>
                  <Text
                    style={{
                      color: addOpacity(theme.textColor, 0.65),
                      fontSize: 12,
                      fontWeight: '800',
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                    {language === 'he' ? 'דיאגנוסטיקה' : 'Diagnostics'}
                  </Text>
                  <View
                    style={{
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                    }}>
                    {[
                      {
                        label: language === 'he' ? 'rows מהשרת' : 'server rows',
                        value: loopModeRowsFetched,
                      },
                      {
                        label: language === 'he' ? 'אירועים' : 'events',
                        value: loopModeStats.diagnostics.eventsFetched,
                      },
                      {
                        label: language === 'he' ? 'מסווגים' : 'classified',
                        value: loopModeStats.diagnostics.eventsClassified,
                      },
                      {
                        label:
                          language === 'he' ? 'דגימות פתוח' : 'open samples',
                        value: loopModeStats.diagnostics.openSamples,
                      },
                      {
                        label:
                          language === 'he' ? 'דגימות סגור' : 'closed samples',
                        value: loopModeStats.diagnostics.closedSamples,
                      },
                      {
                        label:
                          language === 'he' ? 'אירועי בזאל' : 'basal events',
                        value: loopModeStats.diagnostics.basalEvents,
                      },
                      ...(loopModeStatsError
                        ? [
                            {
                              label: language === 'he' ? 'שגיאה' : 'error',
                              value: loopModeStatsError,
                            },
                          ]
                        : []),
                    ].map(item => (
                      <View
                        key={item.label}
                        style={{
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          backgroundColor: addOpacity(theme.textColor, 0.05),
                        }}>
                        <Text
                          style={{
                            color: addOpacity(theme.textColor, 0.64),
                            fontSize: 11,
                            fontWeight: '700',
                          }}>
                          {item.label}: {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={{marginBottom: theme.spacing.lg - 1}}>
            <SectionTitle>
              {language === 'he' ? 'מצב בזאל' : 'Basal Delivery'}
            </SectionTitle>

            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: addOpacity(theme.textColor, 0.12),
                backgroundColor: addOpacity(theme.textColor, 0.03),
                padding: 12,
                gap: 10,
              }}>
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 8,
                }}>
                <MaterialIcons
                  name="waterfall-chart"
                  size={18}
                  color={theme.primaryColor}
                />
                <Text
                  style={{
                    flex: 1,
                    color: theme.textColor,
                    fontSize: 14,
                    fontWeight: '800',
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                  {language === 'he' ? 'פירוק בזאל' : 'Basal breakdown'}
                </Text>
              </View>

              {isLoopModeStatsLoading ? (
                <View
                  style={{
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: addOpacity(theme.textColor, 0.055),
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                  <MaterialIcons
                    name="hourglass-empty"
                    size={17}
                    color={addOpacity(theme.textColor, 0.72)}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: addOpacity(theme.textColor, 0.72),
                      fontSize: 13,
                      fontWeight: '700',
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                    {language === 'he'
                      ? 'טוען נתוני בזאל...'
                      : 'Loading basal data...'}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                  {[
                    {
                      icon: 'bolt',
                      label: language === 'he' ? 'טמפ בזאל' : 'Temp basal',
                      pct: loopModeStats.tempBasalPct,
                      minutes: loopModeStats.tempBasalMinutes,
                    },
                    {
                      icon: 'pause-circle-outline',
                      label:
                        language === 'he'
                          ? 'בזאל 0 / עצירה'
                          : 'Zero basal / stop',
                      pct: loopModeStats.suspendedPct,
                      minutes: loopModeStats.suspendedMinutes,
                    },
                    {
                      icon: 'event-repeat',
                      label:
                        language === 'he' ? 'בזאל מתוכנן' : 'Planned basal',
                      pct: loopModeStats.plannedBasalPct,
                      minutes: loopModeStats.plannedBasalMinutes,
                    },
                    {
                      icon: 'help-outline',
                      label: language === 'he' ? 'לא ידוע' : 'Unknown',
                      pct: loopModeStats.unknownBasalPct,
                      minutes: loopModeStats.unknownBasalMinutes,
                    },
                  ].map(renderBasalPill)}
                </View>
              )}
            </View>
          </View>
          {/* (d) AGP Summary */}
          <View style={{marginBottom: theme.spacing.lg - 1}}>
            <SectionTitle>{tr(language, 'trends.agp')}</SectionTitle>
            <AGPSummary
              bgData={bgData}
              testID={E2E_TEST_IDS.charts.agpSummary}
            />
          </View>

          {/* (c) Insulin Stats (optional) */}
          {/*
          <InsulinStatsRow
            insulinData={insulinData}
            basalProfileData={basalProfileData}
            startDate={start}
            endDate={end}
          />
          */}

          {/* (d) Overall Stats in a collapsible (optional)
          <Collapsable title={tr(language, 'trends.quickStats')}>
            <OverallStatsSection metrics={finalMetrics} />
          </Collapsable>
          */}

          {/* (g) Compare with previous period */}
          <CompareSection
            showComparison={showComparison}
            comparing={comparing}
            handleCompare={() => handleCompare(rangeDays)}
            rangeDays={rangeDays}
            currentDateRange={{start, end}}
            currentBgData={bgData}
            previousBgData={previousBgData}
            currentMetrics={finalMetrics}
            previousMetrics={previousMetrics}
            comparisonDateRange={comparisonDateRange}
            changeComparisonPeriod={changeComparisonPeriod}
            hideComparison={() => setShowComparison(false)}
          />
        </ScrollView>
      )}
    </TrendsContainer>
  );
};

export default Trends;
