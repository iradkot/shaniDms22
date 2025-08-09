import React, { useContext } from 'react';
import { G, Circle } from 'react-native-svg';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { GraphStyleContext } from '../../contextStores/GraphStyleContext';
import { colors } from 'app/style/colors';
import { CHART_COLORS } from 'app/components/shared/GlucoseChart';

interface BolusItemProps {
  bolusEvent: InsulinDataEntry;
  isFocused: boolean;
  setFocusedBolus: (
    bolus: (prevFocusedBolus: InsulinDataEntry | null) => InsulinDataEntry | null
  ) => void;
}

/**
 * Individual bolus marker on the chart
 * Renders as a distinct diamond/square shape at consistent Y-level
 */
const BolusItem: React.FC<BolusItemProps> = ({
  bolusEvent,
  isFocused,
  setFocusedBolus,
}) => {
  const [{ xScale, yScale }] = useContext(GraphStyleContext);

  // Parse timestamp
  const timestamp = new Date(bolusEvent.timestamp!);
  
  // Position: X based on time, Y at fixed level (50 mg/dL equivalent)
  const x = xScale(timestamp);
  const y = yScale(50); // Fixed position at bottom of chart for clarity
  
  // Visual properties based on bolus amount
  const bolusColor = colors.orange[500]; // Insulin-specific color (distinct from BG/food)
  const baseRadius = 3;
  // Scale radius based on bolus amount (3-7px range for 0.5-10+ units)
  const scaledRadius = Math.max(3, Math.min(7, baseRadius + (bolusEvent.amount || 0) * 0.3));
  const radius = isFocused ? scaledRadius + 1 : scaledRadius;
  const strokeWidth = isFocused ? 2 : 1;
  
  return (
    <G>
      {/* Main bolus marker - diamond/square shape using transform */}
      <Circle
        cx={x}
        cy={y}
        r={radius}
        fill={bolusColor}
        stroke={CHART_COLORS.background}
        strokeWidth={strokeWidth}
        transform={`rotate(45 ${x} ${y})`} // Rotate to create diamond shape
      />
      
      {/* Additional visual indicator when focused */}
      {isFocused && (
        <Circle
          cx={x}
          cy={y}
          r={radius + 2}
          fill="none"
          stroke={bolusColor}
          strokeWidth={1}
          strokeDasharray="2,2"
          transform={`rotate(45 ${x} ${y})`}
        />
      )}
    </G>
  );
};

export default BolusItem;
