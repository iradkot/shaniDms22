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
    actualChartHeight: chartHeight
  });  return (
    <View style={{ 
      width, 
      height
    }}>      
    <Svg width={width} height={height}>
        <G>
          {gridLines.major.map(glucose => {
            const yPos = yScale(glucose) + margin.top;
            return (
              <SvgText
                key={`ylabel-${glucose}`}
                x={margin.left - 10}
                y={yPos}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize={11}
                fill={CHART_COLORS.text}
                fontWeight="500"
              >
                {glucose}
              </SvgText>
            );
          })}
        </G>
        
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
    </View>
  );
};

export default AGPChart;
