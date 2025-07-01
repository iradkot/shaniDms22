// Key AGP Metrics Display Component

import React from 'react';
import { View, Text } from 'react-native';
import { StatLabel, StatValue } from '../styles/components.styles';

interface KeyMetric {
  label: string;
  value: string;
  status: string;
  target: string;
}

interface AGPKeyMetricsProps {
  metrics: {
    timeInTarget: KeyMetric;
    averageGlucose: KeyMetric;
    gmi: KeyMetric;
    variability: KeyMetric;
  };
}

const getMetricColor = (status: string): string => {
  switch (status) {
    case 'good': return '#4CAF50';
    case 'fair': return '#FF9800';  
    case 'poor': return '#F44336';
    default: return '#666';
  }
};

const AGPKeyMetrics: React.FC<AGPKeyMetricsProps> = ({ metrics }) => {
  const metricsArray = [
    { key: 'timeInTarget', label: 'Time in Range', icon: '🎯' },
    { key: 'averageGlucose', label: 'Avg Glucose', icon: '📊' },
    { key: 'gmi', label: 'GMI', icon: '🩺' },
    { key: 'variability', label: 'Variability', icon: '📈' }
  ];

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3
    }}>
      {metricsArray.map((metric, index) => {
        const data = metrics[metric.key as keyof typeof metrics];
        return (
          <View key={metric.key} style={{
            flex: 1,
            alignItems: 'center',
            paddingHorizontal: 4,
            borderRightWidth: index < metricsArray.length - 1 ? 1 : 0,
            borderRightColor: '#E0E0E0'
          }}>
            <Text style={{ fontSize: 16, marginBottom: 4 }}>{metric.icon}</Text>
            <StatLabel style={{ fontSize: 11, textAlign: 'center', marginBottom: 4 }}>
              {metric.label}
            </StatLabel>
            <StatValue 
              style={{ fontSize: 16, marginBottom: 2 }}
              color={getMetricColor(data.status)}
            >
              {data.value}
            </StatValue>
            <Text style={{ fontSize: 9, color: '#888', textAlign: 'center' }}>
              {data.target}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default AGPKeyMetrics;
