// AGP Tooltip Component
// Shows detailed glucose data when user touches/hovers over the chart

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOOLTIP_STYLES, GLUCOSE_RANGES, getGlucoseRangeColor } from 'app/components/shared/GlucoseChart';
import { AGPPercentilePoint } from '../types/agp.types';

interface AGPTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  data: AGPPercentilePoint | null;
  chartWidth: number;
  chartHeight: number;
}

const formatTimeOfDay = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

const formatGlucoseValue = (value: number): string => {
  return `${Math.round(value)} mg/dL`;
};

const getGlucoseRangeLabel = (value: number): string => {
  if (value < GLUCOSE_RANGES.veryLow.max) return GLUCOSE_RANGES.veryLow.label;
  if (value < GLUCOSE_RANGES.low.max) return GLUCOSE_RANGES.low.label;
  if (value <= GLUCOSE_RANGES.target.max) return GLUCOSE_RANGES.target.label;
  if (value <= GLUCOSE_RANGES.high.max) return GLUCOSE_RANGES.high.label;
  return GLUCOSE_RANGES.veryHigh.label;
};

export const AGPTooltip: React.FC<AGPTooltipProps> = ({
  visible,
  x,
  y,
  data,
  chartWidth,
  chartHeight
}) => {
  if (!visible || !data) {
    return null;
  }

  // Calculate tooltip position to keep it within bounds
  const tooltipWidth = TOOLTIP_STYLES.maxWidth;
  const tooltipHeight = 140; // Estimated height
  
  let tooltipX = x - tooltipWidth / 2;
  let tooltipY = y - tooltipHeight - 10; // 10px above touch point

  // Keep tooltip within chart bounds
  if (tooltipX < 10) tooltipX = 10;
  if (tooltipX + tooltipWidth > chartWidth - 10) tooltipX = chartWidth - tooltipWidth - 10;
  if (tooltipY < 10) tooltipY = y + 10; // Show below if no space above

  const medianColor = getGlucoseRangeColor(data.p50);

  return (
    <View
      style={[
        styles.container,
        {
          left: tooltipX,
          top: tooltipY,
        }
      ]}
    >
      {/* Header with time */}
      <View style={styles.header}>
        <Text style={styles.timeText}>{formatTimeOfDay(data.timeOfDay)}</Text>
        <Text style={styles.countText}>{data.count} readings</Text>
      </View>

      {/* Percentile values */}
      <View style={styles.percentileContainer}>
        <View style={styles.percentileRow}>
          <Text style={styles.percentileLabel}>95th:</Text>
          <Text style={[styles.percentileValue, { color: getGlucoseRangeColor(data.p95) }]}>
            {formatGlucoseValue(data.p95)}
          </Text>
        </View>
        
        <View style={styles.percentileRow}>
          <Text style={styles.percentileLabel}>75th:</Text>
          <Text style={[styles.percentileValue, { color: getGlucoseRangeColor(data.p75) }]}>
            {formatGlucoseValue(data.p75)}
          </Text>
        </View>
        
        <View style={[styles.percentileRow, styles.medianRow]}>
          <Text style={styles.percentileLabel}>Median:</Text>
          <Text style={[styles.percentileValue, styles.medianValue, { color: medianColor }]}>
            {formatGlucoseValue(data.p50)}
          </Text>
        </View>
        
        <View style={styles.percentileRow}>
          <Text style={styles.percentileLabel}>25th:</Text>
          <Text style={[styles.percentileValue, { color: getGlucoseRangeColor(data.p25) }]}>
            {formatGlucoseValue(data.p25)}
          </Text>
        </View>
        
        <View style={styles.percentileRow}>
          <Text style={styles.percentileLabel}>5th:</Text>
          <Text style={[styles.percentileValue, { color: getGlucoseRangeColor(data.p5) }]}>
            {formatGlucoseValue(data.p5)}
          </Text>
        </View>
      </View>

      {/* Range indicator */}
      <View style={styles.rangeContainer}>
        <Text style={styles.rangeText}>
          Range: {getGlucoseRangeLabel(data.p50)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: TOOLTIP_STYLES.backgroundColor,
    borderColor: TOOLTIP_STYLES.borderColor,
    borderWidth: 1,
    borderRadius: TOOLTIP_STYLES.borderRadius,
    padding: TOOLTIP_STYLES.padding,
    maxWidth: TOOLTIP_STYLES.maxWidth,
    shadowColor: TOOLTIP_STYLES.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: TOOLTIP_STYLES.borderColor,
    paddingBottom: 6,
  },
  timeText: {
    color: TOOLTIP_STYLES.textColor,
    fontSize: TOOLTIP_STYLES.fontSize + 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  countText: {
    color: TOOLTIP_STYLES.textColor,
    fontSize: TOOLTIP_STYLES.fontSize - 1,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 2,
  },
  percentileContainer: {
    marginBottom: 8,
  },
  percentileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 1,
  },
  medianRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOOLTIP_STYLES.borderColor,
    paddingVertical: 2,
    marginVertical: 2,
  },
  percentileLabel: {
    color: TOOLTIP_STYLES.textColor,
    fontSize: TOOLTIP_STYLES.fontSize,
    opacity: 0.8,
  },
  percentileValue: {
    fontSize: TOOLTIP_STYLES.fontSize,
    fontWeight: '500',
  },
  medianValue: {
    fontWeight: '600',
    fontSize: TOOLTIP_STYLES.fontSize + 1,
  },
  rangeContainer: {
    alignItems: 'center',
  },
  rangeText: {
    color: TOOLTIP_STYLES.textColor,
    fontSize: TOOLTIP_STYLES.fontSize - 1,
    opacity: 0.8,
    fontStyle: 'italic',
  },
});

export default AGPTooltip;
