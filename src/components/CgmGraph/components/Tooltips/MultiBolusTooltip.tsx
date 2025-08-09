import React from 'react';
import { Text, Rect, G, Line } from 'react-native-svg';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { formatDateToLocaleTimeString } from 'app/utils/datetime.utils';
import { CHART_COLORS, TOOLTIP_STYLES } from 'app/components/shared/GlucoseChart';

interface MultiBolusTooltipProps {
  x: number;
  y: number;
  bolusEvents: InsulinDataEntry[];
  chartWidth?: number;
}

/**
 * Tooltip showing multiple bolus events when they occur within the detection window
 * This helps when multiple corrections happen within a few minutes
 */
const MultiBolusTooltip: React.FC<MultiBolusTooltipProps> = ({ 
  x, 
  y, 
  bolusEvents, 
  chartWidth = 350 
}) => {
  if (!bolusEvents || bolusEvents.length === 0) {
    return null;
  }

  // Calculate total insulin amount
  const totalUnits = bolusEvents.reduce((sum, bolus) => sum + (bolus.amount || 0), 0);
  
  // Dynamic tooltip height based on number of bolus events
  const baseHeight = 50;
  const itemHeight = 18;
  const totalHeight = baseHeight + (bolusEvents.length * itemHeight);
  const tooltipWidth = 200;
  
  // Position tooltip to avoid going off screen
  let tooltipX = x - tooltipWidth / 2;
  tooltipX = Math.max(5, tooltipX);
  if (tooltipX + tooltipWidth > chartWidth - 5) {
    tooltipX = chartWidth - tooltipWidth - 5;
  }
  const tooltipY = Math.max(5, y - totalHeight - 20);
  
  return (
    <G>
      {/* Semi-transparent background overlay for better visibility */}
      <Rect
        x={tooltipX - 2}
        y={tooltipY - 2}
        width={tooltipWidth + 4}
        height={totalHeight + 4}
        fill="rgba(0,0,0,0.3)"
        rx={TOOLTIP_STYLES.borderRadius + 1}
      />
      
      {/* Tooltip background with rounded corners */}
      <Rect
        x={tooltipX}
        y={tooltipY}
        width={tooltipWidth}
        height={totalHeight}
        fill={TOOLTIP_STYLES.backgroundColor}
        stroke={TOOLTIP_STYLES.borderColor}
        strokeWidth={1}
        rx={TOOLTIP_STYLES.borderRadius}
      />
      
      {/* Header with total insulin amount */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 16}
        fontSize="12"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
        fontWeight="bold"
      >
        💉 {bolusEvents.length > 1 ? `${bolusEvents.length} Bolus Events` : 'Bolus Insulin'}
      </Text>
      
      <Text
        x={tooltipX + 8}
        y={tooltipY + 32}
        fontSize="14"
        fill="#FFB74D" // Orange for emphasis
        textAnchor="start"
        fontWeight="bold"
      >
        Total: {totalUnits.toFixed(1)} units
      </Text>
      
      {/* Separator line if multiple events */}
      {bolusEvents.length > 1 && (
        <Line
          x1={tooltipX + 8}
          y1={tooltipY + 40}
          x2={tooltipX + tooltipWidth - 8}
          y2={tooltipY + 40}
          stroke={CHART_COLORS.textSecondary}
          strokeWidth={0.5}
          opacity={0.5}
        />
      )}
      
      {/* Individual bolus events */}
      {bolusEvents.map((bolus, index) => {
        const itemY = tooltipY + 50 + (index * itemHeight);
        const timestamp = new Date(bolus.timestamp!);
        
        return (
          <G key={`${bolus.timestamp}-${index}`}>
            <Text
              x={tooltipX + 12}
              y={itemY}
              fontSize="10"
              fill={TOOLTIP_STYLES.textColor}
              textAnchor="start"
            >
              • {(bolus.amount || 0).toFixed(1)}U at {formatDateToLocaleTimeString(timestamp)}
            </Text>
          </G>
        );
      })}
      
      {/* Time range if multiple events */}
      {bolusEvents.length > 1 && (
        <Text
          x={tooltipX + 8}
          y={tooltipY + totalHeight - 8}
          fontSize="9"
          fill={CHART_COLORS.textSecondary}
          textAnchor="start"
          fontStyle="italic"
        >
          {(() => {
            const firstTime = new Date(bolusEvents[0].timestamp!).getTime();
            const lastTime = new Date(bolusEvents[bolusEvents.length - 1].timestamp!).getTime();
            const diffMinutes = Math.round((lastTime - firstTime) / 1000 / 60);
            return diffMinutes > 0 ? `Over ${diffMinutes} minutes` : 'Same minute';
          })()}
        </Text>
      )}
    </G>
  );
};

export default MultiBolusTooltip;
