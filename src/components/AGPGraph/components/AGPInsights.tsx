// AGP Clinical Insights Component

import React from 'react';
import { View, Text } from 'react-native';
import { ChartContainer, ChartTitle } from '../styles/components.styles';

interface AGPInsightsProps {
  insights: string[];
}

const getInsightColor = (insight: string): string => {
  if (insight.includes('🎯') || insight.includes('✅')) return '#4CAF50';
  if (insight.includes('⚠️')) return '#FF9800';
  if (insight.includes('🚨')) return '#F44336';
  return '#2196F3';
};

const getInsightIcon = (insight: string): string => {
  if (insight.includes('🎯') || insight.includes('✅')) return '✅';
  if (insight.includes('⚠️')) return '⚠️';
  if (insight.includes('🚨')) return '🚨';
  return '💡';
};

const AGPInsights: React.FC<AGPInsightsProps> = ({ insights }) => {
  if (!insights || insights.length === 0) {
    return (
      <ChartContainer>
        <ChartTitle>Clinical Insights</ChartTitle>
        <Text style={{ textAlign: 'center', color: '#666', padding: 20 }}>
          No insights available for current data
        </Text>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer>
      <ChartTitle>Clinical Insights & Recommendations</ChartTitle>
      <View style={{ padding: 12 }}>
        {insights.slice(0, 3).map((insight, index) => (
          <View key={index} style={{
            flexDirection: 'row',
            backgroundColor: '#F8F9FA',
            padding: 12,
            borderRadius: 8,
            marginBottom: 8,
            borderLeftWidth: 4,
            borderLeftColor: getInsightColor(insight),
            alignItems: 'flex-start'
          }}>
            <Text style={{ 
              fontSize: 16, 
              marginRight: 8,
              marginTop: 2
            }}>
              {getInsightIcon(insight)}
            </Text>
            <Text style={{ 
              fontSize: 13, 
              lineHeight: 18, 
              color: '#333',
              flex: 1
            }}>
              {insight.replace(/🎯|✅|⚠️|🚨|📊|📈/g, '').trim()}
            </Text>
          </View>
        ))}
        {insights.length > 3 && (
          <Text style={{
            textAlign: 'center',
            color: '#666',
            fontSize: 12,
            marginTop: 8
          }}>
            +{insights.length - 3} more insights available
          </Text>
        )}
      </View>
    </ChartContainer>
  );
};

export default AGPInsights;
