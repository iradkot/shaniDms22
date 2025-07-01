// Component for selecting metrics for best/worst day analysis

import React from 'react';
import { View } from 'react-native';
import { MetricType } from '../types/trends.types';
import { ExplanationText, MetricButton, MetricButtonText } from '../styles/Trends.styles';

interface MetricSelectorProps {
  selectedMetric: MetricType;
  onMetricChange: (metric: MetricType) => void;
}

const MetricSelector: React.FC<MetricSelectorProps> = ({
  selectedMetric,
  onMetricChange
}) => {
  return (
    <>
      <ExplanationText>Choose how to determine best/worst day:</ExplanationText>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
        <View style={{ marginHorizontal: 5 }}>
          <MetricButton
            selected={selectedMetric === 'tir'}
            onPress={() => onMetricChange('tir')}
          >
            <MetricButtonText>TIR</MetricButtonText>
          </MetricButton>
        </View>
        <View style={{ marginHorizontal: 5 }}>
          <MetricButton
            selected={selectedMetric === 'hypos'}
            onPress={() => onMetricChange('hypos')}
          >
            <MetricButtonText>Fewest Hypos</MetricButtonText>
          </MetricButton>
        </View>
        <View style={{ marginHorizontal: 5 }}>
          <MetricButton
            selected={selectedMetric === 'hypers'}
            onPress={() => onMetricChange('hypers')}
          >
            <MetricButtonText>Fewest Hypers</MetricButtonText>
          </MetricButton>
        </View>
      </View>
    </>
  );
};

export default MetricSelector;
