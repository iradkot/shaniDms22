import React, { useState, useCallback, useMemo } from 'react';
import styled, { useTheme } from 'styled-components/native';
import { View, Text, PanResponder, Dimensions } from 'react-native';
import { BgSample } from 'app/types/day_bgs.types';
import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';
import { ThemeType } from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';
import { getGlucoseRangeInterpretation } from './utils';

// =============================================================================
// CONSTANTS
// =============================================================================

// Use reasonable glucose range based on medical constants
const MIN_GLUCOSE = 40; // Below SEVERE_HYPO for extreme low analysis
const MAX_GLUCOSE = 200; // Above HYPER for practical high glucose analysis (not extreme like 600)
const SLIDER_WIDTH = Dimensions.get('window').width - 80; // Account for padding
const KNOB_SIZE = 24;

// =============================================================================
// STYLED COMPONENTS
// =============================================================================

const Container = styled.View<{ theme: ThemeType }>`
  background-color: ${(props: { theme: ThemeType }) => props.theme.backgroundColor};
  padding: 20px;
  border-radius: 15px;
  margin: 10px 0;
`;

const HeaderContainer = styled.View`
  align-items: center;
  margin-bottom: 30px;
`;

const PercentageDisplay = styled.View<{ theme: ThemeType }>`
  background-color: ${(props: { theme: ThemeType }) => props.theme.inRangeColor || '#4CAF50'};
  border-radius: 30px;
  padding: 20px 30px;
  margin-bottom: 15px;
`;

const PercentageText = styled.Text`
  font-size: 32px;
  font-weight: bold;
  color: white;
  text-align: center;
`;

const RangeText = styled.Text<{ theme: ThemeType }>`
  font-size: 18px;
  color: ${(props: { theme: ThemeType }) => props.theme.textColor || '#333'};
  font-weight: 600;
  text-align: center;
  margin-bottom: 8px;
`;

const InterpretationText = styled.Text<{ theme: ThemeType }>`
  font-size: 14px;
  color: ${(props: { theme: ThemeType }) => props.theme.textColor || '#666'};
  text-align: center;
  font-style: italic;
`;

const SliderContainer = styled.View`
  height: 80px;
  justify-content: center;
  margin: 20px 0;
`;

const SliderTrack = styled.View<{ theme: ThemeType }>`
  height: 8px;
  background-color: ${(props: { theme: ThemeType }) => props.theme.borderColor || '#E0E0E0'};
  border-radius: 4px;
  position: relative;
`;

const SliderRange = styled.View<{ left: number; width: number; theme: ThemeType }>`
  position: absolute;
  height: 8px;
  background-color: ${(props: { theme: ThemeType }) => props.theme.inRangeColor || '#4CAF50'};
  border-radius: 4px;
  left: ${(props: { left: number }) => props.left}px;
  width: ${(props: { width: number }) => props.width}px;
`;

const Knob = styled.View<{ left: number; theme: ThemeType }>`
  position: absolute;
  width: ${KNOB_SIZE}px;
  height: ${KNOB_SIZE}px;
  border-radius: ${KNOB_SIZE / 2}px;
  background-color: ${(props: { theme: ThemeType }) => props.theme.inRangeColor || '#4CAF50'};
  border: 3px solid white;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.25;
  shadow-radius: 4px;
  elevation: 5;
  left: ${(props: { left: number }) => props.left - KNOB_SIZE / 2}px;
  top: ${-KNOB_SIZE / 2 + 4}px;
`;

const ValuesRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: 20px;
  padding: 0 ${KNOB_SIZE / 2}px;
`;

const ValueLabel = styled.Text<{ theme: ThemeType }>`
  font-size: 16px;
  font-weight: 600;
  color: ${(props: { theme: ThemeType }) => props.theme.textColor || '#333'};
`;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate the percentage of blood glucose readings within a custom range
 */
const calculateCustomRangePercentage = (
  bgData: BgSample[],
  minValue: number,
  maxValue: number
): number => {
  if (!bgData || bgData.length === 0) return 0;
  
  const inRangeCount = bgData.filter(bg => 
    bg.sgv >= minValue && bg.sgv <= maxValue
  ).length;
  
  return Math.round((inRangeCount / bgData.length) * 100);
};

/**
 * Convert position to glucose value
 */
const positionToValue = (position: number, sliderWidth: number): number => {
  const ratio = Math.max(0, Math.min(1, position / sliderWidth));
  return Math.round(MIN_GLUCOSE + ratio * (MAX_GLUCOSE - MIN_GLUCOSE));
};

/**
 * Convert glucose value to position
 */
const valueToPosition = (value: number, sliderWidth: number): number => {
  const ratio = (value - MIN_GLUCOSE) / (MAX_GLUCOSE - MIN_GLUCOSE);
  return ratio * sliderWidth;
};

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

interface CustomGlucoseRangeSliderProps {
  bgData: BgSample[];
  onRangeChange?: (minValue: number, maxValue: number, percentage: number) => void;
  initialMinValue?: number;
  initialMaxValue?: number;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const CustomGlucoseRangeSlider: React.FC<CustomGlucoseRangeSliderProps> = ({
  bgData,
  onRangeChange,
  initialMinValue = GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min,
  initialMaxValue = GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max, // 180 instead of HYPER
}) => {
  const theme = useTheme();
  
  // State for the range values
  const [minValue, setMinValue] = useState(initialMinValue);
  const [maxValue, setMaxValue] = useState(initialMaxValue);
  
  // Calculate percentage for current range
  const percentage = calculateCustomRangePercentage(bgData, minValue, maxValue);
  
  // Get clinical interpretation of current range
  const interpretation = useMemo(() => 
    getGlucoseRangeInterpretation(minValue, maxValue), 
    [minValue, maxValue]
  );
  
  // Calculate positions for knobs
  const minPosition = valueToPosition(minValue, SLIDER_WIDTH);
  const maxPosition = valueToPosition(maxValue, SLIDER_WIDTH);
  
  // Pan responder for left knob (minimum value)
  const minPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (event, gestureState) => {
      const newPosition = Math.max(0, Math.min(SLIDER_WIDTH, minPosition + gestureState.dx));
      const newValue = positionToValue(newPosition, SLIDER_WIDTH);
      
      if (newValue < maxValue) {
        setMinValue(newValue);
        const newPercentage = calculateCustomRangePercentage(bgData, newValue, maxValue);
        onRangeChange?.(newValue, maxValue, newPercentage);
      }
    },
  });
  
  // Pan responder for right knob (maximum value)
  const maxPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (event, gestureState) => {
      const newPosition = Math.max(0, Math.min(SLIDER_WIDTH, maxPosition + gestureState.dx));
      const newValue = positionToValue(newPosition, SLIDER_WIDTH);
      
      if (newValue > minValue) {
        setMaxValue(newValue);
        const newPercentage = calculateCustomRangePercentage(bgData, minValue, newValue);
        onRangeChange?.(minValue, newValue, newPercentage);
      }
    },
  });

  return (
    <DropShadow
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <Container>
        <HeaderContainer>
          <PercentageDisplay>
            <PercentageText>{percentage}%</PercentageText>
          </PercentageDisplay>
          <RangeText>
            Time in Range: {minValue} - {maxValue} mg/dL
          </RangeText>
          <InterpretationText>
            {interpretation}
          </InterpretationText>
        </HeaderContainer>

        <SliderContainer>
          <SliderTrack>
            {/* Range highlight */}
            <SliderRange
              left={minPosition}
              width={maxPosition - minPosition}
            />
            
            {/* Left knob (min value) */}
            <Knob 
              left={minPosition} 
              {...minPanResponder.panHandlers}
            />
            
            {/* Right knob (max value) */}
            <Knob 
              left={maxPosition} 
              {...maxPanResponder.panHandlers}
            />
          </SliderTrack>
          
          {/* Value labels */}
          <ValuesRow>
            <ValueLabel>≤{MIN_GLUCOSE}</ValueLabel>
            <ValueLabel>≥{MAX_GLUCOSE}</ValueLabel>
          </ValuesRow>
        </SliderContainer>
      </Container>
    </DropShadow>
  );
};

export default CustomGlucoseRangeSlider;
export { calculateCustomRangePercentage };
export type { CustomGlucoseRangeSliderProps };
