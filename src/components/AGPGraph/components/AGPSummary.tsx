// AGP Summary Component - Clean and Simple

import React from 'react';
import { View } from 'react-native';
import { AGPGraphProps } from '../types/agp.types';
import { useAGPData } from '../hooks/useAGPData';
import { useAGPStats, useKeyMetrics } from '../hooks/useAGPStats';
import AGPChart from './AGPChart';
import AGPKeyMetrics from './AGPKeyMetrics';
import { AGP_DEFAULT_CONFIG } from '../utils/constants';
import { 
  ErrorContainer, 
  ErrorText, 
  LoadingContainer,
  LoadingText
} from '../styles/components.styles';

const AGPSummary: React.FC<AGPGraphProps> = ({
  bgData,
  width = AGP_DEFAULT_CONFIG.defaultWidth,
  height = AGP_DEFAULT_CONFIG.defaultHeight,
  targetRange = AGP_DEFAULT_CONFIG.targetRange
}) => {
  const { agpData, isLoading, error } = useAGPData(bgData);
  const formattedStats = useAGPStats(agpData?.statistics || null);
  const keyMetrics = useKeyMetrics(agpData?.statistics || null);
  
  if (isLoading) {
    return (
      <LoadingContainer>
        <LoadingText>Processing AGP analytics...</LoadingText>
      </LoadingContainer>
    );
  }
  
  if (error || !agpData || !keyMetrics) {
    return (
      <ErrorContainer>
        <ErrorText>
          Unable to generate AGP analytics. Please check your data.
        </ErrorText>
      </ErrorContainer>
    );
  }

  // Format metrics for display
  const metricsData = {
    timeInTarget: {
      label: 'Time in Range',
      value: keyMetrics.timeInTarget.formatted,
      status: keyMetrics.timeInTarget.status,
      target: 'Target: >70%'
    },
    averageGlucose: {
      label: 'Avg Glucose',
      value: keyMetrics.averageGlucose.formatted,
      status: keyMetrics.averageGlucose.status,
      target: 'Target: 120-160'
    },
    gmi: {
      label: 'GMI',
      value: keyMetrics.gmi.formatted,
      status: keyMetrics.gmi.status,
      target: 'Target: <7.0%'
    },
    variability: {
      label: 'Variability',
      value: keyMetrics.variability.formatted,
      status: keyMetrics.variability.status,
      target: 'Target: <36%'
    }
  };
  return (
    <View>
      {/* Key Metrics Cards */}
      <AGPKeyMetrics metrics={metricsData} />
      
      {/* Main AGP Chart */}
      <View style={{
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
        <AGPChart
          agpData={agpData}
          width={width}
          height={height}
          showTargetRange={true}
          targetRange={targetRange}
        />
      </View>
    </View>
  );
};

export default AGPSummary;
