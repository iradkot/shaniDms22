// AGP Statistics Component

import React from 'react';
import { View, Text } from 'react-native';
import { AGPStatisticsProps } from '../types/agp.types';
import { useAGPStats } from '../hooks/useAGPStats';
import { AGP_GLUCOSE_RANGES } from '../utils/constants';
import { StatisticsContainer, StatRow, StatLabel, StatValue, InsightText, MetricCard, RangeBar } from '../styles/components.styles';

const AGPStatistics: React.FC<AGPStatisticsProps> = ({
  statistics,
  showDetailed = true
}) => {
  const formattedStats = useAGPStats(statistics);
  
  if (!formattedStats) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: '#666', fontSize: 14 }}>No statistics available</Text>
      </View>
    );
  }
  
  const { formatted, riskAssessment, insights } = formattedStats;
  
  return (
    <StatisticsContainer>
      {/* Key Metrics Row */}
      <View style={{ flexDirection: 'row', marginBottom: 20 }}>
        <MetricCard style={{ flex: 1, marginRight: 8 }}>
          <StatLabel>Time in Range</StatLabel>
          <StatValue color={getStatusColor(riskAssessment.timeInTarget)}>
            {formatted.timeInRange.target}
          </StatValue>
          <Text style={{ fontSize: 10, color: '#666' }}>Target: {'>'}70%</Text>
        </MetricCard>
        
        <MetricCard style={{ flex: 1, marginLeft: 8 }}>
          <StatLabel>Average Glucose</StatLabel>
          <StatValue>{formatted.averageGlucose}</StatValue>
        </MetricCard>
      </View>
      
      {/* Time in Range Breakdown */}
      <View style={{ marginBottom: 20 }}>
        <StatLabel style={{ marginBottom: 8 }}>Time in Range Breakdown</StatLabel>
        <RangeBar>
          <RangeSegment 
            percentage={statistics.timeInRange.veryLow}
            color={AGP_GLUCOSE_RANGES.veryLow.color}
            label="Very Low"
          />
          <RangeSegment 
            percentage={statistics.timeInRange.low}
            color={AGP_GLUCOSE_RANGES.low.color}
            label="Low"
          />
          <RangeSegment 
            percentage={statistics.timeInRange.target}
            color={AGP_GLUCOSE_RANGES.target.color}
            label="Target"
          />
          <RangeSegment 
            percentage={statistics.timeInRange.high}
            color={AGP_GLUCOSE_RANGES.high.color}
            label="High"
          />
          <RangeSegment 
            percentage={statistics.timeInRange.veryHigh}
            color={AGP_GLUCOSE_RANGES.veryHigh.color}
            label="Very High"
          />
        </RangeBar>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 10, color: '#666' }}>Very Low: {formatted.timeInRange.veryLow}</Text>
          <Text style={{ fontSize: 10, color: '#666' }}>Low: {formatted.timeInRange.low}</Text>
          <Text style={{ fontSize: 10, color: '#666' }}>Target: {formatted.timeInRange.target}</Text>
          <Text style={{ fontSize: 10, color: '#666' }}>High: {formatted.timeInRange.high}</Text>
          <Text style={{ fontSize: 10, color: '#666' }}>Very High: {formatted.timeInRange.veryHigh}</Text>
        </View>
      </View>
      
      {showDetailed && (
        <>
          {/* Additional Metrics */}
          <View style={{ marginBottom: 20 }}>
            <StatRow>
              <StatLabel>GMI (Glucose Management Indicator)</StatLabel>
              <StatValue color={getStatusColor(riskAssessment.timeInTarget)}>
                {formatted.gmi}
              </StatValue>
            </StatRow>
            
            <StatRow>
              <StatLabel>Coefficient of Variation (CV)</StatLabel>
              <StatValue color={getStatusColor(riskAssessment.variabilityRisk, true)}>
                {formatted.cv}
              </StatValue>
            </StatRow>
            
            <StatRow>
              <StatLabel>Estimated A1C</StatLabel>
              <StatValue>{formatted.estimatedA1C}</StatValue>
            </StatRow>
            
            <StatRow>
              <StatLabel>Readings per Day</StatLabel>
              <StatValue>{formatted.readingsPerDay}</StatValue>
            </StatRow>
            
            <StatRow>
              <StatLabel>Total Readings</StatLabel>
              <StatValue>{statistics.totalReadings.toLocaleString()}</StatValue>
            </StatRow>
            
            <StatRow>
              <StatLabel>Days with Data</StatLabel>
              <StatValue>{statistics.daysWithData}</StatValue>
            </StatRow>
          </View>
          
          {/* Clinical Insights */}
          <View>
            <StatLabel style={{ marginBottom: 8 }}>Clinical Insights</StatLabel>
            {insights.map((insight, index) => (
              <InsightText key={index}>
                {insight}
              </InsightText>
            ))}
          </View>
        </>
      )}
    </StatisticsContainer>
  );
};

// Range segment component for time in range visualization
interface RangeSegmentProps {
  percentage: number;
  color: string;
  label: string;
}

const RangeSegment: React.FC<RangeSegmentProps> = ({ percentage, color, label }) => {
  if (percentage === 0) return null;
  
  return (
    <View 
      style={{ 
        flex: percentage,
        backgroundColor: color,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {percentage > 10 && (
        <Text style={{ fontSize: 8, color: 'white', fontWeight: 'bold' }}>
          {percentage.toFixed(0)}%
        </Text>
      )}
    </View>
  );
};

// Helper function to get status color
const getStatusColor = (status: string, inverse: boolean = false): string => {
  if (inverse) {
    // For metrics where lower is better (like CV)
    switch (status) {
      case 'excellent':
      case 'good':
      case 'low':
        return '#4CAF50'; // Green
      case 'fair':
      case 'moderate':
        return '#FF9800'; // Orange
      case 'poor':
      case 'high':
        return '#F44336'; // Red
      default:
        return '#666';
    }
  } else {
    // For metrics where higher is better (like time in range)
    switch (status) {
      case 'excellent':
      case 'good':
      case 'low':
        return '#4CAF50'; // Green
      case 'fair':
      case 'moderate':
        return '#FF9800'; // Orange
      case 'poor':
      case 'high':
        return '#F44336'; // Red
      default:
        return '#666';
    }
  }
};

export default AGPStatistics;
