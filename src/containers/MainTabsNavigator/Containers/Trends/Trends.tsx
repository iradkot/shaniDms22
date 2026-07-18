// /Trends/TrendsContainer.tsx

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, ScrollView, Text} from 'react-native';
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
import {
  LoopStatsSection,
  LoopStatsTimeFilterKey,
} from './components/LoopStatsSection';
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

import {TrendsContainer, SectionTitle} from './styles/Trends.styles';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {HYPO_INVESTIGATION_SCREEN} from 'app/constants/SCREEN_NAMES';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {LoopStatsTimeWindow} from './utils/loopModeStats';

const Trends: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation();
  const {language} = useAppLanguage();

  const [presetDays, setPresetDays] = useState<number>(7);
  const [presetEndDate, setPresetEndDate] = useState<Date | null>(null);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [loopTimeFilterKey, setLoopTimeFilterKey] =
    useState<LoopStatsTimeFilterKey>('all');
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

    // Preset ranges (7/14/30), optionally shifted back in time.
    const end = normalizeEnd(presetEndDate ?? today);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (presetDays - 1));
    return {start, end, rangeDays: presetDays};
  }, [customStartDate, customEndDate, presetDays, presetEndDate]);

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
  const loopStatsTimeWindow = useMemo<LoopStatsTimeWindow | null>(() => {
    switch (loopTimeFilterKey) {
      case 'morning':
        return {startHour: 6, endHour: 12};
      case 'afternoon':
        return {startHour: 12, endHour: 18};
      case 'evening':
        return {startHour: 18, endHour: 24};
      case 'night':
        return {startHour: 0, endHour: 6};
      default:
        return null;
    }
  }, [loopTimeFilterKey]);
  const {
    stats: loopModeStats,
    isLoading: isLoopModeStatsLoading,
    fetchError: loopModeStatsError,
    rowsFetched: loopModeRowsFetched,
    loadProgress: loopModeLoadProgress,
  } = useLoopModeStats({
    start,
    end,
    bgData,
    timeWindow: loopStatsTimeWindow,
  });

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

  const canShiftRangeForward = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return end.getTime() < today.getTime() - 1000;
  }, [end]);

  const shiftDateRange = useCallback(
    (direction: 'back' | 'forward') => {
      const deltaDays = direction === 'back' ? -rangeDays : rangeDays;
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const shiftDate = (date: Date) => {
        const next = new Date(date);
        next.setDate(next.getDate() + deltaDays);
        return next;
      };

      if (isCustomRange && customStartDate && customEndDate) {
        const shiftedStart = shiftDate(start);
        const shiftedEnd = shiftDate(end);
        if (direction === 'forward' && shiftedEnd.getTime() > today.getTime()) {
          const clampedEnd = today;
          const clampedStart = new Date(clampedEnd);
          clampedStart.setDate(clampedEnd.getDate() - (rangeDays - 1));
          clampedStart.setHours(0, 0, 0, 0);
          setCustomStartDate(clampedStart);
          setCustomEndDate(clampedEnd);
        } else {
          setCustomStartDate(shiftedStart);
          setCustomEndDate(shiftedEnd);
        }
        resetComparison(rangeDays);
        return;
      }

      const shiftedEnd = shiftDate(end);
      setPresetEndDate(
        direction === 'forward' && shiftedEnd.getTime() > today.getTime()
          ? today
          : shiftedEnd,
      );
      resetComparison(rangeDays);
    },
    [
      customEndDate,
      customStartDate,
      end,
      isCustomRange,
      rangeDays,
      resetComparison,
      start,
    ],
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
        onShiftRangeBack={() => shiftDateRange('back')}
        onShiftRangeForward={() => shiftDateRange('forward')}
        canShiftRangeForward={canShiftRangeForward}
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

          <LoopStatsSection
            stats={loopModeStats}
            isLoading={isLoopModeStatsLoading}
            fetchError={loopModeStatsError}
            rowsFetched={loopModeRowsFetched}
            loadProgress={loopModeLoadProgress}
            timeFilterKey={loopTimeFilterKey}
            onTimeFilterChange={setLoopTimeFilterKey}
          />
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
