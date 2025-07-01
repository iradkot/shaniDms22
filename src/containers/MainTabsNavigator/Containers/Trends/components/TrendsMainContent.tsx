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
import { CompareSection } from './CompareSection';
import MetricSelector from './MetricSelector';
import { 
  SectionTitle,
  HighlightBox,
  BoldText,
  StatRow,
  StatLabel,
  StatValue,
  ExplanationText,
  Row
} from '../styles/Trends.styles';

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

/**
 * Integrated Day Insights component (previously from TrendsUI.tsx)
 * Renders collapsable sections for best/worst day analysis
 */
const DayInsights: React.FC<{
  bestDayDetail: DayDetail | null;
  worstDayDetail: DayDetail | null;
  bestDay: string;
  worstDay: string;
  selectedMetric: string;
}> = ({ bestDayDetail, worstDayDetail, bestDay, worstDay, selectedMetric }) => {
  if (!bestDayDetail && !worstDayDetail) return null;

  // Label text for "best" and "worst" day, depending on selected metric
  const bestMetricLabel = selectedMetric === 'tir' ? 'Highest TIR'
    : selectedMetric === 'hypos' ? 'Fewest Hypos'
      : 'Fewest Hypers';

  const worstMetricLabel = selectedMetric === 'tir' ? 'Lowest TIR'
    : selectedMetric === 'hypos' ? 'Most Hypos'
      : 'Most Hypers';

  return (
    <Collapsable title="Day Quality & Patterns">
      {/* Best Day Section */}
      {!!bestDayDetail && (
        <HighlightBox>
          <Row>
            <BoldText>Best Day ({bestMetricLabel}): </BoldText>
            <StatLabel>{bestDay || "N/A"}</StatLabel>
          </Row>
          <ExplanationText>
            TIR: {(bestDayDetail.tir * 100).toFixed(1)}% | Hypos: {bestDayDetail.seriousHypos} | Hypers: {bestDayDetail.seriousHypers}
          </ExplanationText>
        </HighlightBox>
      )}

      {/* Worst Day Section */}
      {!!worstDayDetail && (
        <HighlightBox style={{ backgroundColor: "#fff1f0", borderLeftColor: "#ff4d4f" }}>
          <Row>
            <BoldText>Worst Day ({worstMetricLabel}): </BoldText>
            <StatLabel>{worstDay || "N/A"}</StatLabel>
          </Row>
          <ExplanationText>
            TIR: {(worstDayDetail.tir * 100).toFixed(1)}% | Hypos: {worstDayDetail.seriousHypos} | Hypers: {worstDayDetail.seriousHypers}
          </ExplanationText>
        </HighlightBox>
      )}

      {/* Best Day Insights */}
      {!!bestDayDetail && (
        <Collapsable title="Best Day Insights">
          <StatRow>
            <StatLabel>Date:</StatLabel>
            <StatValue>{bestDayDetail.dateString}</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Avg BG:</StatLabel>
            <StatValue>{bestDayDetail.avg.toFixed(1)} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>TIR (%):</StatLabel>
            <StatValue>{(bestDayDetail.tir * 100).toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Min BG:</StatLabel>
            <StatValue>{bestDayDetail.minBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Max BG:</StatLabel>
            <StatValue>{bestDayDetail.maxBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{bestDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{bestDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>
            Stable overnight? Good meal timing? Learn from this pattern.
          </ExplanationText>
        </Collapsable>
      )}

      {/* Worst Day Insights */}
      {!!worstDayDetail && (
        <Collapsable title="Worst Day Insights">
          <StatRow>
            <StatLabel>Date:</StatLabel>
            <StatValue>{worstDayDetail.dateString}</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Avg BG:</StatLabel>
            <StatValue>{worstDayDetail.avg.toFixed(1)} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>TIR (%):</StatLabel>
            <StatValue>{(worstDayDetail.tir * 100).toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Min BG:</StatLabel>
            <StatValue>{worstDayDetail.minBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Max BG:</StatLabel>
            <StatValue>{worstDayDetail.maxBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{worstDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{worstDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>
            Identify causes: Late meals? Missed bolus? Stress?
          </ExplanationText>
        </Collapsable>
      )}
    </Collapsable>
  );
};

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
}) => {
  // Get screen width for charts
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

      {/* (f) Best/Worst day details - Now integrated */}
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
