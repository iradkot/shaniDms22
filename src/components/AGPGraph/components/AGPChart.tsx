// Simplified AGP Chart Component

import React from 'react';
import { View, Text } from 'react-native';
import Svg, { G, Text as SvgText } from 'react-native-svg';
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
import { CHART_COLORS } from 'app/components/shared/GlucoseChart';
import {
  ChartFoundation,
  ChartData
} from './chart';
import { AGPTouchOverlay } from './AGPTouchOverlay';

interface AGPChartProps {
  agpData: AGPData;
  width?: number;
  height?: number;
  showGrid?: boolean;
  showTargetRange?: boolean;
  targetRange?: { min: number; max: number };
  showTooltip?: boolean;
}

const AGPChart: React.FC<AGPChartProps> = ({
  agpData,
  width = 350,
  height = 250,
  showGrid = true,
  showTargetRange = true,
  targetRange = { min: 70, max: 180 },
  showTooltip = true
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
  
  // Debug centering calculation
  const marginDifference = margin.left - margin.right;
  const centeringOffset = -Math.round(marginDifference / 2);
  console.log('[AGPChart] Centering calculation:', {
    width,
    leftMargin: margin.left,
    rightMargin: margin.right,
    marginDifference,
    centeringOffset,
    actualChartWidth: chartWidth
  });
  
  // Debug chart dimensions
  console.log('[AGPChart] Chart dimensions:', {
    totalWidth: width,
    totalHeight: height,
    margin,
    actualChartWidth: chartWidth,
    actualChartHeight: chartHeight  });  return (
    <View style={{ 
      width, 
      height
    }}>
      {showTooltip ? (
        <AGPTouchOverlay
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          marginLeft={margin.left}
          marginTop={margin.top}
          percentileData={agpData.percentiles}
          xScale={xScale}
        >
          <Svg width={width} height={height}>
            <G transform={`translate(${margin.left}, ${margin.top})`}>          
              <ChartFoundation
                width={chartWidth}
                height={chartHeight}
                gridLines={gridLines}
                timePoints={chartConfig.timePoints}
                timeLabels={timeLabels}
                xScale={xScale}
                yScale={yScale}
                showGrid={showGrid}
              />
              <ChartData
                targetRangeArea={targetRangeArea}
                targetRange={targetRange}
                percentileLines={percentileLines}
                percentileBands={percentileBands}
                yScale={yScale}
                chartWidth={chartWidth}
                agpData={agpData}
                showTargetRange={showTargetRange}
              />
            </G>
          </Svg>
        </AGPTouchOverlay>
      ) : (
        <Svg width={width} height={height}>
          <G transform={`translate(${margin.left}, ${margin.top})`}>          
            <ChartFoundation
              width={chartWidth}
              height={chartHeight}
              gridLines={gridLines}
              timePoints={chartConfig.timePoints}
              timeLabels={timeLabels}
              xScale={xScale}
              yScale={yScale}
              showGrid={showGrid}
            />
            <ChartData
              targetRangeArea={targetRangeArea}
              targetRange={targetRange}
              percentileLines={percentileLines}
              percentileBands={percentileBands}
              yScale={yScale}
              chartWidth={chartWidth}
              agpData={agpData}
              showTargetRange={showTargetRange}
            />
          </G>
        </Svg>
      )}
    </View>
  );
};

export default AGPChart;
