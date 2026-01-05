// /Trends/TrendsContainer.tsx

import React, {useCallback, useMemo, useState} from 'react';
import {View, ScrollView} from 'react-native';
import {differenceInCalendarDays} from 'date-fns';

import { useTrendsData } from './hooks/useTrendsData';
import { DayDetail, calculateTrendsMetrics } from './utils/trendsCalculations';
import { fetchBgDataForDateRange } from 'app/api/apiRequests';
import { CHUNK_SIZE } from './Trends.constants';
import { BgSample } from 'app/types/day_bgs.types';

// Components
import { DataFetchStatus } from './components/DataFetchStatus';
import { DateRangeSelector } from './components/DateRangeSelector';
import { CompareSection } from './components/CompareSection';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
// (If you have insulin data, pass it in above.)

import Collapsable from 'app/components/Collapsable';
import { DayInsights } from './TrendsUI'; // <--- Now it exists for real!
import {AGPSummary} from 'app/components/charts/AGPGraph';

import {
  TrendsContainer,
  SectionTitle,
  ExplanationText,
  MetricButton,
  MetricButtonText
} from './styles/Trends.styles';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

type MetricType = 'tir' | 'hypos' | 'hypers';

const Trends: React.FC = () => {
  const [presetDays, setPresetDays] = useState<number>(7);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tir');

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
  } = useTrendsData({ rangeDays, start, end });

  // 3) Compare logic
  const [showComparison, setShowComparison] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previousMetrics, setPreviousMetrics] = useState<ReturnType<
    typeof finalMetrics
  > | null>(null);
  const [comparisonOffset, setComparisonOffset] = useState(rangeDays);
  const [comparisonDateRange, setComparisonDateRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  const resetComparison = useCallback((nextRangeDays?: number) => {
    setShowComparison(false);
    setComparing(false);
    setPreviousMetrics(null);
    setComparisonDateRange(null);
    setComparisonOffset(nextRangeDays ?? rangeDays);
  }, [rangeDays]);

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
    setComparing(true);
    setPreviousMetrics(null);

    try {
      const previousStart = new Date(start);
      previousStart.setDate(start.getDate() - offset);
      previousStart.setHours(0, 0, 0, 0);

      const previousEnd = new Date(previousStart);
      previousEnd.setHours(23, 59, 59, 999);
      previousEnd.setDate(previousStart.getDate() + (rangeDays - 1));

      setComparisonDateRange({ start: previousStart, end: previousEnd });

      // We need to fetch data in chunks, similar to useTrendsData
      const totalChunks = Math.ceil(rangeDays / CHUNK_SIZE);
      let previousBgData: BgSample[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = new Date(previousStart);
        chunkStart.setDate(previousStart.getDate() + i * CHUNK_SIZE);

        const chunkEnd = new Date(chunkStart);
        chunkEnd.setDate(chunkStart.getDate() + CHUNK_SIZE - 1);
        if (chunkEnd > previousEnd) chunkEnd.setTime(previousEnd.getTime());

        const dataChunk = await fetchBgDataForDateRange(chunkStart, chunkEnd);
        previousBgData = previousBgData.concat(dataChunk);
      }

      const metrics = calculateTrendsMetrics(previousBgData);
      setPreviousMetrics(metrics);
      setShowComparison(true);
    } catch (e: any) {
      console.log('Failed to compare previous period:', e.message);
      // Optionally, handle the error in the UI
    } finally {
      setComparing(false);
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

  // 4) Determine best/worst day based on selected metric
  let displayDays: DayDetail[] = finalMetrics.dailyDetails;
  if (selectedMetric === 'tir') {
    displayDays = [...displayDays].sort((a, b) => b.tir - a.tir);
  } else if (selectedMetric === 'hypos') {
    displayDays = [...displayDays].sort((a, b) => a.seriousHypos - b.seriousHypos);
  } else {
    displayDays = [...displayDays].sort((a, b) => a.seriousHypers - b.seriousHypers);
  }

  const bestDayDetail = displayDays[0];
  const worstDayDetail = displayDays[displayDays.length - 1];
  const bestDay = bestDayDetail?.dateString || '';
  const worstDay = worstDayDetail?.dateString || '';

  return (
    <TrendsContainer testID={E2E_TEST_IDS.screens.trends}>
      {/* 1. Date Range Buttons */}
      <DateRangeSelector
        presetDays={presetDays}
        onPresetDaysChange={handlePresetDaysChange}
        startDate={start}
        endDate={end}
        onStartDateChange={handleCustomStartChange}
        onEndDateChange={handleCustomEndChange}
      />

      {/* 2. Current date range info */}
      <View style={{alignItems: 'center', marginVertical: 10}}>
        <SectionTitle>Data Range</SectionTitle>
        <ExplanationText>
          {start.toDateString()} to {end.toDateString()} ({rangeDays} days)
        </ExplanationText>
      </View>

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
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>No BG data available for this period.</Text>
        </View>
      )}

      {/* 5. Partial data if user canceled */}
      {!isLoading && fetchCancelled && finalMetrics.dailyDetails.length > 0 && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>
            Loading cancelled. Showing partial results for {daysFetched}/{rangeDays} days.
          </Text>
        </View>
      )}

      {/* 6. Main content if data is present */}
      {!isLoading && !fetchError && finalMetrics.dailyDetails.length > 0 && (
        <ScrollView>
          {/* (a) Time In Range */}
          <View style={{ marginBottom: 15 }}>
            <SectionTitle>Key Glucose Trends</SectionTitle>
            <TimeInRangeRow bgData={bgData} />
          </View>

          {/* (b) Quick Stats */}
          <View style={{ marginBottom: 15 }}>
            <SectionTitle>Quick Stats</SectionTitle>
            <StatsRow bgData={bgData} />
          </View>

          {/* (c) AGP Summary */}
          <View style={{ marginBottom: 15 }}>
            <SectionTitle>AGP</SectionTitle>
            <AGPSummary bgData={bgData} testID={E2E_TEST_IDS.charts.agpSummary} />
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
          <Collapsable title="Overall Stats (Key Indicators)">
            <OverallStatsSection metrics={finalMetrics} />
          </Collapsable>
          */}

          {/* (e) Best/Worst Day Selection */}
          <Collapsable title="Select Metric for Best/Worst Day">
            <ExplanationText>Choose how to determine best/worst day:</ExplanationText>
            <View style={{flexDirection: 'row', justifyContent: 'center', marginVertical: 10}}>
              <View style={{ marginHorizontal: 5 }}>
                <MetricButton
                  selected={selectedMetric === 'tir'}
                  onPress={() => setSelectedMetric('tir')}
                >
                  <MetricButtonText>TIR</MetricButtonText>
                </MetricButton>
              </View>
              <View style={{ marginHorizontal: 5 }}>
                <MetricButton
                  selected={selectedMetric === 'hypos'}
                  onPress={() => setSelectedMetric('hypos')}
                >
                  <MetricButtonText>Fewest Hypos</MetricButtonText>
                </MetricButton>
              </View>
              <View style={{ marginHorizontal: 5 }}>
                <MetricButton
                  selected={selectedMetric === 'hypers'}
                  onPress={() => setSelectedMetric('hypers')}
                >
                  <MetricButtonText>Fewest Hypers</MetricButtonText>
                </MetricButton>
              </View>
            </View>
          </Collapsable>

          {/* (f) Best/Worst day details */}
          <DayInsights
            bestDayDetail={bestDayDetail}
            worstDayDetail={worstDayDetail}
            bestDay={bestDay}
            worstDay={worstDay}
            selectedMetric={selectedMetric}
          />

          {/* (g) Compare with previous period */}
          <CompareSection
            showComparison={showComparison}
            comparing={comparing}
            handleCompare={() => handleCompare(comparisonOffset)}
            rangeDays={rangeDays}
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
