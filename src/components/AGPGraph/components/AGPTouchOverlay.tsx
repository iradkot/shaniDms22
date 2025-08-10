// AGP Touch Overlay
// Handles touch interactions for displaying tooltips

import React, { useState } from 'react';
import { View, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { AGPPercentilePoint } from '../types/agp.types';
import { AGPTooltip } from './AGPTooltip';

interface AGPTouchOverlayProps {
  chartWidth: number;
  chartHeight: number;
  marginLeft: number;
  marginTop: number;
  percentileData: AGPPercentilePoint[];
  xScale: (timeOfDay: number) => number;
  children: React.ReactNode;
}

export const AGPTouchOverlay: React.FC<AGPTouchOverlayProps> = ({
  chartWidth,
  chartHeight,
  marginLeft,
  marginTop,
  percentileData,
  xScale,
  children
}) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<AGPPercentilePoint | null>(null);
  const [tooltipX, setTooltipX] = useState(0);
  const [tooltipY, setTooltipY] = useState(0);

  const findClosestDataPoint = (chartX: number): AGPPercentilePoint | null => {
    if (!percentileData || percentileData.length === 0) return null;

    // Find the time value at this x position
    const timePoints = percentileData.map(p => p.timeOfDay).sort((a, b) => a - b);
    let closestTime = timePoints[0];
    let minDistance = Math.abs(xScale(timePoints[0]) - chartX);

    for (const time of timePoints) {
      const distance = Math.abs(xScale(time) - chartX);
      if (distance < minDistance) {
        minDistance = distance;
        closestTime = time;
      }
    }

    // Find the data point with this time
    return percentileData.find(p => p.timeOfDay === closestTime) || null;
  };

  const showTooltip = (x: number, y: number) => {
    const dataPoint = findClosestDataPoint(x);
    if (dataPoint) {
      setTooltipData(dataPoint);
      setTooltipX(x);
      setTooltipY(y);
      setTooltipVisible(true);
    }
  };

  const hideTooltip = () => {
    setTooltipVisible(false);
    setTooltipData(null);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    
    onPanResponderGrant: (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      const chartX = locationX - marginLeft;
      const chartY = locationY - marginTop;
      
      if (chartX >= 0 && chartX <= chartWidth && chartY >= 0 && chartY <= chartHeight) {
        showTooltip(chartX, chartY);
      }
    },
    
    onPanResponderMove: (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      const chartX = locationX - marginLeft;
      const chartY = locationY - marginTop;
      
      if (chartX >= 0 && chartX <= chartWidth && chartY >= 0 && chartY <= chartHeight) {
        showTooltip(chartX, chartY);
      } else {
        hideTooltip();
      }
    },
    
    onPanResponderRelease: () => {
      hideTooltip();
    },
    
    onPanResponderTerminate: () => {
      hideTooltip();
    },
  });

  return (
    <View style={{ position: 'relative' }}>
      {children}
      
      <View
        {...panResponder.panHandlers}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: chartWidth + marginLeft * 2,
          height: chartHeight + marginTop * 2,
        }}
      />

      {tooltipVisible && (
        <View style={{ position: 'absolute', left: marginLeft, top: marginTop }}>
          <AGPTooltip
            visible={tooltipVisible}
            x={tooltipX}
            y={tooltipY}
            data={tooltipData}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
          />
        </View>
      )}
    </View>
  );
};

export default AGPTouchOverlay;
