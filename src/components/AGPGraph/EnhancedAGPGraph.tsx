// Enhanced AGP Graph with Advanced Features

import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { AGPGraphProps } from './types/agp.types';
import { useAGPData } from './hooks/useAGPData';
import { useAGPStats, useKeyMetrics } from './hooks/useAGPStats';
import AGPChart from './components/AGPChart';
import AGPStatistics from './components/AGPStatistics';
import AGPLegend from './components/AGPLegend';
import { AGP_GLUCOSE_RANGES, AGP_DEFAULT_CONFIG } from './utils/constants';
import { 
  ChartContainer, 
  ChartTitle, 
  ErrorContainer, 
  ErrorText, 
  WarningContainer, 
  WarningText,
  LoadingContainer,
  LoadingText,
  MetricCard,
  StatLabel,
  StatValue
} from './styles/components.styles';

interface EnhancedAGPGraphProps extends AGPGraphProps {
  showComparison?: boolean;
  previousBgData?: any[];
  compactMode?: boolean;
}

const EnhancedAGPGraph: React.FC<EnhancedAGPGraphProps> = ({
  bgData,
  width = AGP_DEFAULT_CONFIG.defaultWidth,
  height = AGP_DEFAULT_CONFIG.defaultHeight,
  showStatistics = true,
  showLegend = true,
  targetRange = AGP_DEFAULT_CONFIG.targetRange,
  showComparison = false,
  previousBgData = [],
  compactMode = false
}) => {
  const [selectedTab, setSelectedTab] = useState<'chart' | 'stats' | 'insights'>('chart');
  
  const { agpData, isLoading, error, warnings, dataQuality } = useAGPData(bgData);
  const formattedStats = useAGPStats(agpData?.statistics || null);
  const keyMetrics = useKeyMetrics(agpData?.statistics || null);
  
  // Show loading state
  if (isLoading) {
    return (
      <LoadingContainer>
        <LoadingText>Processing Enhanced AGP data...</LoadingText>
      </LoadingContainer>
    );
  }
  
  // Show error state
  if (error || !agpData) {
    return (
      <ErrorContainer>
        <ErrorText>
          {error || 'Unable to generate Enhanced AGP. Please check your data and try again.'}
        </ErrorText>
      </ErrorContainer>
    );
  }
  
  if (compactMode) {
    return (
      <ChartContainer>
        {/* Compact Key Metrics */}
        {keyMetrics && (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <StatLabel style={{ fontSize: 10 }}>Time in Range</StatLabel>
                <StatValue style={{ fontSize: 14 }} color={getMetricColor(keyMetrics.timeInTarget.status)}>
                  {keyMetrics.timeInTarget.formatted}
                </StatValue>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <StatLabel style={{ fontSize: 10 }}>Avg Glucose</StatLabel>
                <StatValue style={{ fontSize: 14 }}>
                  {keyMetrics.averageGlucose.formatted}
                </StatValue>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <StatLabel style={{ fontSize: 10 }}>GMI</StatLabel>
                <StatValue style={{ fontSize: 14 }} color={getMetricColor(keyMetrics.gmi.status)}>
                  {keyMetrics.gmi.formatted}
                </StatValue>
              </View>
            </View>
          </View>
        )}
        
        {/* Compact Chart */}
        <AGPChart
          agpData={agpData}
          width={width}
          height={height * 0.7}
          showTargetRange={true}
          targetRange={targetRange}
        />
      </ChartContainer>
    );
  }
  
  return (
    <View>
      {/* Data Quality Warnings */}
      {warnings.length > 0 && (
        <WarningContainer>
          {warnings.map((warning, index) => (
            <WarningText key={index}>⚠️ {warning}</WarningText>
          ))}
        </WarningContainer>
      )}
      
      {/* Key Metrics Dashboard */}
      {keyMetrics && (
        <ChartContainer style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <MetricCard style={{ flex: 1, marginRight: 4 }}>
              <StatLabel>Time in Range</StatLabel>
              <StatValue color={getMetricColor(keyMetrics.timeInTarget.status)}>
                {keyMetrics.timeInTarget.formatted}
              </StatValue>
              <Text style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                Target: {'>'}70%
              </Text>
            </MetricCard>
            
            <MetricCard style={{ flex: 1, marginHorizontal: 2 }}>
              <StatLabel>Average Glucose</StatLabel>
              <StatValue color={getMetricColor(keyMetrics.averageGlucose.status)}>
                {keyMetrics.averageGlucose.formatted}
              </StatValue>
              <Text style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                Target: 120-160
              </Text>
            </MetricCard>
            
            <MetricCard style={{ flex: 1, marginHorizontal: 2 }}>
              <StatLabel>GMI</StatLabel>
              <StatValue color={getMetricColor(keyMetrics.gmi.status)}>
                {keyMetrics.gmi.formatted}
              </StatValue>
              <Text style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                Target: {'<'}7.0%
              </Text>
            </MetricCard>
            
            <MetricCard style={{ flex: 1, marginLeft: 4 }}>
              <StatLabel>Variability</StatLabel>
              <StatValue color={getMetricColor(keyMetrics.variability.status, true)}>
                {keyMetrics.variability.formatted}
              </StatValue>
              <Text style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                Target: {'<'}36%
              </Text>
            </MetricCard>
          </View>
        </ChartContainer>
      )}
      
      {/* Tab Navigation */}
      <View style={{ 
        flexDirection: 'row', 
        backgroundColor: '#F5F5F5',
        borderRadius: 8,
        padding: 4,
        marginBottom: 8
      }}>
        {[
          { key: 'chart', label: 'AGP Chart' },
          { key: 'stats', label: 'Statistics' },
          { key: 'insights', label: 'Insights' }
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              backgroundColor: selectedTab === tab.key ? '#FFFFFF' : 'transparent',
              borderRadius: 6,
              alignItems: 'center'
            }}
            onPress={() => setSelectedTab(tab.key as any)}
          >
            <Text style={{
              fontSize: 14,
              fontWeight: selectedTab === tab.key ? 'bold' : 'normal',
              color: selectedTab === tab.key ? '#333' : '#666'
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Tab Content */}
      {selectedTab === 'chart' && (
        <ChartContainer>
          <ChartTitle>Ambulatory Glucose Profile (AGP)</ChartTitle>
          <AGPChart
            agpData={agpData}
            width={width}
            height={height}
            showTargetRange={true}
            targetRange={targetRange}
          />
          
          {/* Data Quality Indicator */}
          <View style={{ 
            marginTop: 8, 
            padding: 8, 
            backgroundColor: getDataQualityColor(dataQuality),
            borderRadius: 4 
          }}>
            <Text style={{ 
              color: 'white', 
              fontSize: 12, 
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              Data Quality: {dataQuality.toUpperCase()} • {agpData.dateRange.days} days • {agpData.statistics.totalReadings} readings
            </Text>
          </View>
          
          {showLegend && (
            <View style={{ marginTop: 12 }}>
              <AGPLegend 
                ranges={AGP_GLUCOSE_RANGES}
                horizontal={true}
              />
            </View>
          )}
        </ChartContainer>
      )}
      
      {selectedTab === 'stats' && showStatistics && (
        <ChartContainer>
          <ChartTitle>Detailed AGP Statistics</ChartTitle>
          <AGPStatistics 
            statistics={agpData.statistics}
            showDetailed={true}
          />
        </ChartContainer>
      )}
      
      {selectedTab === 'insights' && formattedStats && (
        <ChartContainer>
          <ChartTitle>Clinical Insights & Recommendations</ChartTitle>
          <View style={{ padding: 16 }}>
            {formattedStats.insights.map((insight, index) => (
              <View key={index} style={{
                backgroundColor: '#F8F9FA',
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                borderLeftWidth: 4,
                borderLeftColor: getInsightColor(insight)
              }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: '#333' }}>
                  {insight}
                </Text>
              </View>
            ))}
          </View>
        </ChartContainer>
      )}
    </View>
  );
};

// Helper functions
const getMetricColor = (status: string, inverse: boolean = false): string => {
  if (inverse) {
    switch (status) {
      case 'good': return '#4CAF50';
      case 'fair': return '#FF9800';
      case 'poor': return '#F44336';
      default: return '#666';
    }
  } else {
    switch (status) {
      case 'good': return '#4CAF50';
      case 'fair': return '#FF9800';
      case 'poor': return '#F44336';
      default: return '#666';
    }
  }
};

const getDataQualityColor = (quality: string): string => {
  switch (quality) {
    case 'excellent': return '#4CAF50';
    case 'good': return '#8BC34A';
    case 'fair': return '#FF9800';
    case 'poor': return '#F44336';
    default: return '#9E9E9E';
  }
};

const getInsightColor = (insight: string): string => {
  if (insight.includes('🎯') || insight.includes('✅')) return '#4CAF50';
  if (insight.includes('⚠️')) return '#FF9800';
  if (insight.includes('🚨')) return '#F44336';
  return '#2196F3';
};

export default EnhancedAGPGraph;
