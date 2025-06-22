// Trends container - Main entry point for trends analysis

import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';

// Hooks
import { useTrendsData } from './hooks/useTrendsData';
import { useComparison } from './hooks/useComparison';
import { useBestWorstDays } from './hooks/useBestWorstDays';

// Components
import { DataFetchStatus } from './components/DataFetchStatus';
import { DateRangeSelector } from './components/DateRangeSelector';
import TrendsMainContent from './components/TrendsMainContent';

// Styles
import { TrendsContainer, SectionTitle } from './styles/Trends.styles';

const Trends: React.FC = () => {
  const [rangeDays, setRangeDays] = useState<number>(7);

  // Calculate date range
  const { start, end } = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (rangeDays - 1));
    return { start, end };
  }, [rangeDays]);

  // Fetch trends data
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

  // Comparison logic
  const comparison = useComparison({ start, rangeDays });

  // Best/worst days logic  
  const bestWorstDays = useBestWorstDays({ dailyDetails: finalMetrics.dailyDetails });

  const hasData = !isLoading && !fetchError && finalMetrics.dailyDetails.length > 0;
  const hasPartialData = !isLoading && fetchCancelled && finalMetrics.dailyDetails.length > 0;

  return (
    <TrendsContainer>
      {/* Date Range Selector */}
      <DateRangeSelector onRangeChange={setRangeDays} />

      {/* Current date range info */}
      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <SectionTitle>Data Range</SectionTitle>
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>
          {start.toDateString()} to {end.toDateString()} ({rangeDays} days)
        </Text>
      </View>

      {/* Loading/Error/No data status */}
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

      {/* No data case */}
      {!isLoading && !fetchError && bgData.length === 0 && !fetchCancelled && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>No BG data available for this period.</Text>
        </View>
      )}

      {/* Partial data if user canceled */}
      {hasPartialData && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>
            Loading cancelled. Showing partial results for {daysFetched}/{rangeDays} days.
          </Text>
        </View>
      )}

      {/* Main content if data is present */}
      {hasData && (
        <TrendsMainContent
          bgData={bgData}
          finalMetrics={finalMetrics}
          selectedMetric={bestWorstDays.selectedMetric}
          onMetricChange={bestWorstDays.setSelectedMetric}
          bestDayDetail={bestWorstDays.bestDayDetail}
          worstDayDetail={bestWorstDays.worstDayDetail}
          bestDay={bestWorstDays.bestDay}
          worstDay={bestWorstDays.worstDay}
          showComparison={comparison.showComparison}
          comparing={comparison.comparing}
          handleCompare={() => comparison.handleCompare(comparison.comparisonOffset)}
          rangeDays={rangeDays}
          previousMetrics={comparison.previousMetrics}
          comparisonDateRange={comparison.comparisonDateRange}
          changeComparisonPeriod={comparison.changeComparisonPeriod}
          hideComparison={comparison.hideComparison}
        />
      )}
    </TrendsContainer>
  );
};

export default Trends;
