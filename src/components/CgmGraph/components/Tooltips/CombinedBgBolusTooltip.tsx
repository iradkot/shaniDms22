import React from 'react';
import { Text, Rect, G, Line } from 'react-native-svg';
import { BgSample } from 'app/types/day_bgs.types';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { formatDateToLocaleTimeString } from 'app/utils/datetime.utils';
import { determineBgColorByGlucoseValue } from 'app/style/styling.utils';
import { useTheme } from 'styled-components/native';
import { ThemeType } from 'app/types/theme';
import { CHART_COLORS, TOOLTIP_STYLES } from 'app/components/shared/GlucoseChart';

interface CombinedBgBolusTooltipProps {
  x: number;
  y: number;
  bgSample: BgSample;
  bolusEvent: InsulinDataEntry;
  chartWidth?: number;
}

/**
 * Combined tooltip showing both BG reading and bolus information
 * when they occur within 1 minute of each other
 */
const CombinedBgBolusTooltip: React.FC<CombinedBgBolusTooltipProps> = ({ 
  x, 
  y, 
  bgSample, 
  bolusEvent, 
  chartWidth = 350 
}) => {
  const theme = useTheme() as ThemeType;
  
  const tooltipWidth = 180;
  const tooltipHeight = 95; // Taller to accommodate both pieces of info
  
  // Position tooltip to avoid going off screen
  let tooltipX = x - tooltipWidth / 2;
  tooltipX = Math.max(5, tooltipX);
  if (tooltipX + tooltipWidth > chartWidth - 5) {
    tooltipX = chartWidth - tooltipWidth - 5;
  }
  const tooltipY = Math.max(5, y - tooltipHeight - 20);
  
  // Get BG color for styling
  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);
  
  // Parse timestamps
  const bgTimestamp = new Date(bgSample.date);
  const bolusTimestamp = new Date(bolusEvent.timestamp!);
  
  return (
    <G>
      {/* Semi-transparent background overlay for better visibility */}
      <Rect
        x={tooltipX - 2}
        y={tooltipY - 2}
        width={tooltipWidth + 4}
        height={tooltipHeight + 4}
        fill="rgba(0,0,0,0.3)"
        rx={TOOLTIP_STYLES.borderRadius + 1}
      />
      
      {/* Tooltip background with rounded corners */}
      <Rect
        x={tooltipX}
        y={tooltipY}
        width={tooltipWidth}
        height={tooltipHeight}
        fill={TOOLTIP_STYLES.backgroundColor}
        stroke={TOOLTIP_STYLES.borderColor}
        strokeWidth={1}
        rx={TOOLTIP_STYLES.borderRadius}
      />
      
      {/* BG Section */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 16}
        fontSize="12"
        fill={bgColor}
        textAnchor="start"
        fontWeight="bold"
      >
        🩸 BG: {bgSample.sgv} mg/dL
      </Text>
      
      <Text
        x={tooltipX + 8}
        y={tooltipY + 30}
        fontSize="10"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
      >
        {formatDateToLocaleTimeString(bgTimestamp)}
      </Text>
      
      {/* Separator line */}
      <Line
        x1={tooltipX + 8}
        y1={tooltipY + 38}
        x2={tooltipX + tooltipWidth - 8}
        y2={tooltipY + 38}
        stroke={CHART_COLORS.textSecondary}
        strokeWidth={0.5}
        opacity={0.5}
      />
      
      {/* Bolus Section */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 52}
        fontSize="11"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
        fontWeight="bold"
      >
        💉 Bolus: {(bolusEvent.amount || 0).toFixed(1)} units
      </Text>
      
      <Text
        x={tooltipX + 8}
        y={tooltipY + 67}
        fontSize="10"
        fill="#FFB74D" // Orange for insulin
        textAnchor="start"
      >
        {formatDateToLocaleTimeString(bolusTimestamp)}
      </Text>
      
      {/* Time difference if different */}
      {Math.abs(bgTimestamp.getTime() - bolusTimestamp.getTime()) > 10000 && (
        <Text
          x={tooltipX + 8}
          y={tooltipY + 81}
          fontSize="9"
          fill={CHART_COLORS.textSecondary}
          textAnchor="start"
          fontStyle="italic"
        >
          {Math.abs(Math.round((bgTimestamp.getTime() - bolusTimestamp.getTime()) / 1000 / 60))} min apart
        </Text>
      )}
    </G>
  );
};

export default CombinedBgBolusTooltip;
