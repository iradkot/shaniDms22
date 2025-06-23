// Main content area for Trends screen

import React from 'react';
import { View, ScrollView, Dimensions } from 'react-native';
import { BgSample } from 'app/types/day_bgs.types';
import { DayDetail, calculateTrendsMetrics } from '../utils/trendsCalculations';
import { MetricType, DateRange } from '../types/trends.types';

// Components
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import { AGPSummary } from 'app/components/AGPGraph';
import Collapsable from 'app/components/Collapsable';
import { DayInsights } from '../TrendsUI';
import { CompareSection } from './CompareSection';
import MetricSelector from './MetricSelector';
import { SectionTitle } from '../styles/Trends.styles';

interface TrendsMainContentProps {
  bgData: BgSample[];
  finalMetrics: ReturnType<typeof calculateTrendsMetrics>;
  
  // Best/Worst day props
  selectedMetric: MetricType;
  onMetricChange: (metric: MetricType) => void;
  bestDayDetail: DayDetail | undefined;
  worstDayDetail: DayDetail | undefined;
  bestDay: string;
  worstDay: string;
  
  // Comparison props
  showComparison: boolean;
  comparing: boolean;
  handleCompare: () => void;
  rangeDays: number;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics> | null;
  previousBgData: BgSample[];
  comparisonDateRange: DateRange | null;
  changeComparisonPeriod: (direction: 'back' | 'forward') => void;
  hideComparison: () => void;
}

const TrendsMainContent: React.FC<TrendsMainContentProps> = ({
  bgData,
  finalMetrics,
  selectedMetric,
  onMetricChange,
  bestDayDetail,
  worstDayDetail,
  bestDay,
  worstDay,
  showComparison,
  comparing,
  handleCompare,
  rangeDays,
  previousMetrics,
  previousBgData,
  comparisonDateRange,
  changeComparisonPeriod,
  hideComparison
}) => {// Get screen width for charts
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.max(screenWidth - 10, 350); // Almost full width, minimum 350
  const chartHeight = 220; // Increased height for better visibility
  
  // Add debugging for data flow
  console.log('[TrendsMainContent] Rendering with data:', {
    bgDataCount: bgData.length,
    firstSample: bgData.length > 0 ? new Date(bgData[0].date).toISOString() : null,
    lastSample: bgData.length > 0 ? new Date(bgData[bgData.length - 1].date).toISOString() : null,
    rangeDays,
    chartWidth,
    screenWidth
  });
  return (
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
      {/* (c) AGP Graph - Ambulatory Glucose Profile */}
         
      <View style={{ marginTop: 15, marginBottom: 15 }}>
        <SectionTitle>AGP Analytics & Statistics</SectionTitle>
        <View style={{ 
          alignItems: 'center', 
          paddingHorizontal: 5
        }}>
          <AGPSummary 
            bgData={bgData}
            width={chartWidth}
            height={chartHeight + 40}
          />
          
          {/* Show AGP comparison when comparing */}
          {showComparison && previousBgData.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <SectionTitle>Previous Period Comparison</SectionTitle>
              <View style={{
                backgroundColor: '#F8F9FA',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12
              }}>
                <AGPSummary 
                  bgData={previousBgData}
                  width={chartWidth}
                  height={chartHeight + 40}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* (e) Best/Worst Day Selection */}
      <Collapsable title="Select Metric for Best/Worst Day">
        <MetricSelector
          selectedMetric={selectedMetric}
          onMetricChange={onMetricChange}
        />
      </Collapsable>

      {/* (f) Best/Worst day details */}
      <DayInsights
        bestDayDetail={bestDayDetail || null}
        worstDayDetail={worstDayDetail || null}
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
        comparisonDateRange={comparisonDateRange}
        changeComparisonPeriod={changeComparisonPeriod}
        hideComparison={hideComparison}
      />
    </ScrollView>
  );
};

export default TrendsMainContent;
