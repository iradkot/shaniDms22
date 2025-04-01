// /Trends/TrendsContainer.tsx

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';

import { useTrendsData } from './hooks/useTrendsData';
import { DayDetail } from './utils/trendsCalculations';

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

import {
  TrendsContainer,
  SectionTitle,
  ExplanationText,
  MetricButton,
  MetricButtonText
} from './styles/Trends.styles';

type MetricType = 'tir' | 'hypos' | 'hypers';

const Trends: React.FC = () => {
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tir');

  // 1) Calculate date range
  const { start, end } = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (rangeDays - 1));
    return { start, end };
  }, [rangeDays]);

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
  const [previousMetrics, setPreviousMetrics] = useState<ReturnType<typeof finalMetrics> | null>(null);

  async function handleCompare() {
    setComparing(true);
    try {
      // Example: fetch previous period data here, then setPreviousMetrics(...)
      setShowComparison(true);
    } catch (e: any) {
      console.log('Failed to compare previous period:', e.message);
    } finally {
      setComparing(false);
    }
  }

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
    <TrendsContainer>
      {/* 1. Date Range Buttons */}
      <DateRangeSelector onRangeChange={days => setRangeDays(days)} />

      {/* 2. Current date range info */}
      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <SectionTitle>Data Range</SectionTitle>
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>
          {start.toDateString()} to {end.toDateString()} ({rangeDays} days)
        </Text>
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
            handleCompare={handleCompare}
            rangeDays={rangeDays}
            currentMetrics={finalMetrics}
            previousMetrics={previousMetrics}
          />
        </ScrollView>
      )}
    </TrendsContainer>
  );
};

export default Trends;
