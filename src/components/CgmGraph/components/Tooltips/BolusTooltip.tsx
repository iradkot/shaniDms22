import React from 'react';
import { Text, Rect, G } from 'react-native-svg';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { formatDateToLocaleTimeString } from 'app/utils/datetime.utils';
import { CHART_COLORS, TOOLTIP_STYLES } from 'app/components/shared/GlucoseChart';

interface BolusTooltipProps {
  x: number;
  y: number;
  bolusEvent: InsulinDataEntry;
}

/**
 * Tooltip showing bolus details on hover/touch
 * Similar to SgvTooltip but for insulin data
 */
const BolusTooltip: React.FC<BolusTooltipProps> = ({ x, y, bolusEvent }) => {
  const tooltipWidth = 140;
  const tooltipHeight = 55;
  
  // Position tooltip to avoid going off screen - position above the bolus marker
  const tooltipX = Math.max(5, Math.min(x - tooltipWidth / 2, 350 - tooltipWidth));
  const tooltipY = Math.max(5, y - tooltipHeight - 20); // Well above the point
  
  // Parse timestamp for display
  const timestamp = new Date(bolusEvent.timestamp!);
  
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
      
      {/* Insulin icon and title */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 16}
        fontSize="11"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
        fontWeight="bold"
      >
        💉 Bolus Insulin
      </Text>
      
      {/* Amount with larger emphasis */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 32}
        fontSize="13"
        fill="#FFB74D" // Lighter orange for emphasis
        textAnchor="start"
        fontWeight="bold"
      >
        {(bolusEvent.amount || 0).toFixed(1)} units
      </Text>
      
      {/* Time */}
      <Text
        x={tooltipX + 8}
        y={tooltipY + 47}
        fontSize="10"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
      >
        {formatDateToLocaleTimeString(timestamp)}
      </Text>
    </G>
  );
};

export default BolusTooltip;
