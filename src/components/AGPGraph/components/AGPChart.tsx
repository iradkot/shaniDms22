// Simplified AGP Chart Component

import React from 'react';
import { View, Text } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { AGPData } from '../types/agp.types';
import { 
  useChartConfig, 
  useTimeAxisLabels, 
  useGlucoseGridLines,
  usePercentileLines,
  usePercentileBands,
  useTargetRangeArea
} from '../hooks/useChartConfig';
import { AGP_COLORS } from '../utils/constants';
import {
  ChartBackground,
  ChartGrid,
  ChartGradients,
  ChartAxes,
  ChartBorder,
  TargetRange,
  PercentileBands,
  PercentileLines
} from './chart';

interface AGPChartProps {
  agpData: AGPData;
  width?: number;
  height?: number;
  showGrid?: boolean;
  showTargetRange?: boolean;
  targetRange?: { min: number; max: number };
}

const AGPChart: React.FC<AGPChartProps> = ({
  agpData,
  width = 350,
  height = 250,
  showGrid = true,
  showTargetRange = true,
  targetRange = { min: 70, max: 180 }
}) => {
  const chartConfig = useChartConfig({ width, height, agpData });
  const timeLabels = useTimeAxisLabels(chartConfig);
  const gridLines = useGlucoseGridLines(chartConfig);
  const percentileLines = usePercentileLines(chartConfig, agpData);
  const percentileBands = usePercentileBands(chartConfig, agpData);
  const targetRangeArea = useTargetRangeArea(chartConfig, targetRange);
  
  if (!chartConfig || !percentileLines || !percentileBands) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: AGP_COLORS.textSecondary }}>No data available</Text>
      </View>
    );
  }
    const { margin, xScale, yScale } = chartConfig;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Debug chart dimensions
  console.log('[AGPChart] Chart dimensions:', {
    totalWidth: width,
    totalHeight: height,
    margin,
    actualChartWidth: chartWidth,
    actualChartHeight: chartHeight
  });
  
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <ChartGradients />
        
        <G transform={`translate(${margin.left}, ${margin.top})`}>
          <ChartBackground 
            width={chartWidth} 
            height={chartHeight} 
          />
          
          {showTargetRange && (
            <TargetRange
              targetRangeArea={targetRangeArea}
              targetRange={targetRange}
              yScale={yScale}
              chartWidth={chartWidth}
            />
          )}
          
          {showGrid && (
            <ChartGrid
              gridLines={gridLines}
              timePoints={chartConfig.timePoints}
              xScale={xScale}
              yScale={yScale}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
            />
          )}
            <PercentileBands 
            percentileBands={percentileBands}
            agpData={agpData}
          />
          
          <PercentileLines 
            percentileLines={percentileLines} 
            agpData={agpData}
          />
            <ChartAxes
            gridLines={gridLines}
            timeLabels={timeLabels}
            timePoints={chartConfig.timePoints}
            xScale={xScale}
            yScale={yScale}
            chartHeight={chartHeight}
            chartWidth={chartWidth}
          />
        </G>
        
        <ChartBorder
          x={margin.left}
          y={margin.top}
          width={chartWidth}
          height={chartHeight}
        />
      </Svg>
    </View>
  );
};

export default AGPChart;
