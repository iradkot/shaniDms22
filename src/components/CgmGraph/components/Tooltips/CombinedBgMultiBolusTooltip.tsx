import React from 'react';
import { Text, Rect, G, Line } from 'react-native-svg';
import { BgSample } from 'app/types/day_bgs.types';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { formatDateToLocaleTimeString } from 'app/utils/datetime.utils';
import { determineBgColorByGlucoseValue } from 'app/style/styling.utils';
import { useTheme } from 'styled-components/native';
import { ThemeType } from 'app/types/theme';
import { CHART_COLORS, TOOLTIP_STYLES } from 'app/components/shared/GlucoseChart';
import { calculateSmartTooltipPosition } from '../../utils/tooltipPositioning';

interface CombinedBgMultiBolusTooltipProps {
  x: number;
  y: number;
  bgSample: BgSample;
  bolusEvents: InsulinDataEntry[];
  chartWidth?: number;
  chartHeight?: number;
}

/**
 * Combined tooltip showing BG reading and multiple bolus events
 * when they occur within the configured time window
 */
const CombinedBgMultiBolusTooltip: React.FC<CombinedBgMultiBolusTooltipProps> = ({ 
  x, 
  y, 
  bgSample, 
  bolusEvents, 
  chartWidth = 350,
  chartHeight = 200
}) => {
  const theme = useTheme() as ThemeType;
  
  // Calculate total insulin amount
  const totalUnits = bolusEvents.reduce((sum, bolus) => sum + (bolus.amount || 0), 0);
  
  // Dynamic tooltip height
  const baseHeight = 80; // Space for BG + separator + total insulin
  const itemHeight = 16; // Height per bolus event
  const totalHeight = baseHeight + (bolusEvents.length * itemHeight);
  const tooltipWidth = 200;
  
  // Calculate smart position to avoid finger occlusion and bounds overflow
  const position = calculateSmartTooltipPosition(
    { x, y },
    { width: tooltipWidth, height: totalHeight },
    { width: chartWidth, height: chartHeight }
  );
  
  // Get BG color for styling
  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);
  
  // Parse timestamps
  const bgTimestamp = new Date(bgSample.date);
  
  return (
    <G>
      {/* Semi-transparent background overlay for better visibility */}
      <Rect
        x={position.x - 2}
        y={position.y - 2}
        width={tooltipWidth + 4}
        height={totalHeight + 4}
        fill="rgba(0,0,0,0.3)"
        rx={TOOLTIP_STYLES.borderRadius + 1}
      />
      
      {/* Tooltip background with rounded corners */}
      <Rect
        x={position.x}
        y={position.y}
        width={tooltipWidth}
        height={totalHeight}
        fill={TOOLTIP_STYLES.backgroundColor}
        stroke={TOOLTIP_STYLES.borderColor}
        strokeWidth={1}
        rx={TOOLTIP_STYLES.borderRadius}
      />
      
      {/* BG Section */}
      <Text
        x={position.x + 8}
        y={position.y + 16}
        fontSize="12"
        fill={bgColor}
        textAnchor="start"
        fontWeight="bold"
      >
        🩸 BG: {bgSample.sgv} mg/dL
      </Text>
      
      <Text
        x={position.x + 8}
        y={position.y + 30}
        fontSize="10"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
      >
        {formatDateToLocaleTimeString(bgTimestamp)}
      </Text>
      
      {/* Separator line */}
      <Line
        x1={position.x + 8}
        y1={position.y + 38}
        x2={position.x + tooltipWidth - 8}
        y2={position.y + 38}
        stroke={CHART_COLORS.textSecondary}
        strokeWidth={0.5}
        opacity={0.5}
      />
      
      {/* Insulin Section Header */}
      <Text
        x={position.x + 8}
        y={position.y + 52}
        fontSize="11"
        fill={TOOLTIP_STYLES.textColor}
        textAnchor="start"
        fontWeight="bold"
      >
        💉 {bolusEvents.length > 1 ? `${bolusEvents.length} Bolus Events` : 'Bolus'}
      </Text>
      
      <Text
        x={position.x + 8}
        y={position.y + 66}
        fontSize="12"
        fill="#FFB74D" // Orange for insulin
        textAnchor="start"
        fontWeight="bold"
      >
        Total: {totalUnits.toFixed(1)} units
      </Text>
      
      {/* Individual bolus events */}
      {bolusEvents.map((bolus, index) => {
        const itemY = position.y + 80 + (index * itemHeight);
        const timestamp = new Date(bolus.timestamp!);
        
        return (
          <Text
            key={`${bolus.timestamp}-${index}`}
            x={position.x + 12}
            y={itemY}
            fontSize="9"
            fill={TOOLTIP_STYLES.textColor}
            textAnchor="start"
          >
            • {(bolus.amount || 0).toFixed(1)}U at {formatDateToLocaleTimeString(timestamp)}
          </Text>
        );
      })}
    </G>
  );
};

export default CombinedBgMultiBolusTooltip;
