// Main AGP Graph Component

import React from 'react';
import { View, ScrollView } from 'react-native';
import { AGPGraphProps } from './types/agp.types';
import { useAGPData } from './hooks/useAGPData';
import AGPChart from './components/AGPChart';
import AGPStatistics from './components/AGPStatistics';
import AGPLegend from './components/AGPLegend';
import { AGP_GLUCOSE_RANGES, AGP_DEFAULT_CONFIG } from './utils/constants';
import { colors } from '../../style/colors';
import { 
  ChartContainer, 
  ChartTitle, 
  ErrorContainer, 
  ErrorText, 
  WarningContainer, 
  WarningText,
  LoadingContainer,
  LoadingText 
} from './styles/components.styles';

const AGPGraph: React.FC<AGPGraphProps> = ({
  bgData,
  width = AGP_DEFAULT_CONFIG.defaultWidth,
  height = AGP_DEFAULT_CONFIG.defaultHeight,
  showStatistics = true,
  showLegend = true,
  targetRange = AGP_DEFAULT_CONFIG.targetRange
}) => {
  const { agpData, isLoading, error, warnings, dataQuality } = useAGPData(bgData);
  
  // Data quality color mapping using existing color palette
  const getDataQualityColor = (quality: string): string => {
    switch (quality) {
      case 'excellent':
        return colors.green[600];
      case 'good':
        return colors.lightGreen[600];
      case 'fair':
        return colors.orange[600];
      case 'poor':
        return colors.red[600];
      default:
        return colors.gray[500];
    }
  };
  
  // Show loading state
  if (isLoading) {
    return (
      <LoadingContainer>
        <LoadingText>Processing AGP data...</LoadingText>
      </LoadingContainer>
    );
  }
  
  // Show error state
  if (error || !agpData) {
    return (
      <ErrorContainer>
        <ErrorText>
          {error || 'Unable to generate AGP. Please check your data and try again.'}
        </ErrorText>
      </ErrorContainer>
    );
  }
    return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {warnings.length > 0 && (
        <WarningContainer>
          {warnings.map((warning, index) => (
            <WarningText key={index}>⚠️ {warning}</WarningText>
          ))}
        </WarningContainer>
      )}
      
      <ChartContainer>
        <ChartTitle>
          Ambulatory Glucose Profile (AGP)
        </ChartTitle>
        <AGPChart
          agpData={agpData}
          width={width}
          height={height}
          showTargetRange={true}
          targetRange={targetRange}
        />
        
        <View style={{ 
          marginTop: 8, 
          padding: 8, 
          backgroundColor: getDataQualityColor(dataQuality),
          borderRadius: 4 
        }}>
          <LoadingText style={{ 
            color: 'white', 
            fontSize: 12, 
            textAlign: 'center' 
          }}>
            Data Quality: {dataQuality.toUpperCase()} • {agpData.dateRange.days} days • {agpData.statistics.totalReadings} readings
          </LoadingText>
        </View>
      </ChartContainer>      
      {showLegend && (
        <AGPLegend 
          ranges={AGP_GLUCOSE_RANGES}
          horizontal={false}
        />
      )}
      
      {showStatistics && (
        <ChartContainer>
          <ChartTitle>AGP Statistics</ChartTitle>
          <AGPStatistics 
            statistics={agpData.statistics}
            showDetailed={true}
          />
        </ChartContainer>
      )}
    </ScrollView>
  );
};

export default AGPGraph;
