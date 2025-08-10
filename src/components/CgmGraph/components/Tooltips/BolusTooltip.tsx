import React from 'react';
import { Text, Rect, G } from 'react-native-svg';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { formatDateToLocaleTimeString } from 'app/utils/datetime.utils';
import { CHART_COLORS, TOOLTIP_STYLES } from 'app/components/shared/GlucoseChart';
import { calculateSmartTooltipPosition } from '../../utils/tooltipPositioning';

interface BolusTooltipProps {
  x: number;
  y: number;
  bolusEvent: InsulinDataEntry;
  chartWidth?: number;
  chartHeight?: number;
}

/**
 * Tooltip showing bolus details on hover/touch
 * Similar to SgvTooltip but for insulin data
 */
const BolusTooltip: React.FC<BolusTooltipProps> = ({ 
  x, 
  y, 
  bolusEvent,
  chartWidth = 350,
  chartHeight = 200
}) => {
  const tooltipWidth = 140;
  const tooltipHeight = 55;
  
  // Calculate smart position to avoid finger occlusion and bounds overflow
  const position = calculateSmartTooltipPosition(
    { x, y },
    { width: tooltipWidth, height: tooltipHeight },
    { width: chartWidth, height: chartHeight }
  );
  
  // Parse timestamp for display
  const timestamp = new Date(bolusEvent.timestamp!);
  
  return (
    <G>
      {/* Semi-transparent background overlay for better visibility */}
      <Rect
        x={position.x - 2}
        y={position.y - 2}
        width={tooltipWidth + 4}
        height={tooltipHeight + 4}
        fill="rgba(0,0,0,0.3)"
        rx={TOOLTIP_STYLES.borderRadius + 1}
      />
      
      {/* Tooltip background with rounded corners */}
      <Rect
        x={position.x}
        y={position.y}
        width={tooltipWidth}
        height={tooltipHeight}
        fill={TOOLTIP_STYLES.backgroundColor}
        stroke={TOOLTIP_STYLES.borderColor}
        strokeWidth={1}
        rx={TOOLTIP_STYLES.borderRadius}
      />
      
      {/* Insulin icon and title */}
      <Text
        x={position.x + 8}
        y={position.y + 16}
        fontSize="11"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
        fontWeight="bold"
      >
        💉 Bolus Insulin
      </Text>
      
      {/* Amount with larger emphasis */}
      <Text
        x={position.x + 8}
        y={position.y + 32}
        fontSize="13"
        fill="#FFB74D" // Lighter orange for emphasis
        textAnchor="start"
        fontWeight="bold"
      >
        {(bolusEvent.amount || 0).toFixed(1)} units
      </Text>
      
      {/* Time */}
      <Text
        x={position.x + 8}
        y={position.y + 47}
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
