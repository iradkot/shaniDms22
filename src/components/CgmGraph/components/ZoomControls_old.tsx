// Zoom control buttons for chart interaction
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { ThemeType } from 'app/types/theme';
import { ZOOM_CONTROLS_CONFIG } from '../constants/zoomConfig';

// =============================================================================
// STYLED COMPONENTS
// =============================================================================

const ControlsContainer = styled.View`
  position: absolute;
  right: ${ZOOM_CONTROLS_CONFIG.POSITION.RIGHT_MARGIN}px;
  bottom: ${ZOOM_CONTROLS_CONFIG.POSITION.BOTTOM_MARGIN}px;
  flex-direction: column;
  align-items: center;
  gap: ${ZOOM_CONTROLS_CONFIG.SPACING}px;
`;

const ZoomButton = styled(TouchableOpacity)<{ 
  theme: ThemeType; 
  disabled?: boolean 
}>`
  width: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  height: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  border-radius: ${ZOOM_CONTROLS_CONFIG.BORDER_RADIUS}px;
  background-color: ${(props: { theme: ThemeType; disabled?: boolean }) => 
    props.disabled 
      ? '#E5E5E5'  // Standard disabled color
      : props.theme.backgroundColor || '#FFFFFF'
  };
  border-width: 1px;
  border-color: ${(props: { theme: ThemeType; disabled?: boolean }) => props.theme.borderColor || '#E0E0E0'};
  justify-content: center;
  align-items: center;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
  elevation: 3;
`;

const ResetButton = styled(TouchableOpacity)<{ 
  theme: ThemeType; 
  disabled?: boolean 
}>`
  width: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE + 8}px;
  height: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE - 8}px;
  border-radius: ${(ZOOM_CONTROLS_CONFIG.BUTTON_SIZE - 8) / 2}px;
  background-color: ${(props: { theme: ThemeType; disabled?: boolean }) => 
    props.disabled 
      ? '#E5E5E5'  // Standard disabled color
      : props.theme.inRangeColor || '#4CAF50'
  };
  justify-content: center;
  align-items: center;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.15;
  shadow-radius: 4px;
  elevation: 3;
  margin-top: ${ZOOM_CONTROLS_CONFIG.SPACING}px;
`;

const ButtonText = styled.Text<{ 
  theme: ThemeType; 
  disabled?: boolean 
}>`
  font-size: ${ZOOM_CONTROLS_CONFIG.ICON_SIZE}px;
  font-weight: 600;
  color: ${(props: { theme: ThemeType; disabled?: boolean }) => 
    props.disabled 
      ? '#999999'  // Standard disabled text color
      : props.theme.textColor || '#333333'
  };
`;

const ResetButtonText = styled.Text<{ 
  theme: ThemeType; 
  disabled?: boolean 
}>`
  font-size: 12px;
  font-weight: 600;
  color: ${(props: { theme: ThemeType; disabled?: boolean }) => 
    props.disabled 
      ? '#999999'  // Standard disabled text color
      : '#FFFFFF'
  };
`;

const ZoomIndicator = styled.View<{ theme: ThemeType }>`
  position: absolute;
  right: ${ZOOM_CONTROLS_CONFIG.POSITION.RIGHT_MARGIN + ZOOM_CONTROLS_CONFIG.BUTTON_SIZE + 8}px;
  bottom: ${ZOOM_CONTROLS_CONFIG.POSITION.BOTTOM_MARGIN + ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  background-color: ${(props: { theme: ThemeType }) => props.theme.backgroundColor || '#FFFFFF'};
  border-radius: 12px;
  padding: 4px 8px;
  border-width: 1px;
  border-color: ${(props: { theme: ThemeType }) => props.theme.borderColor || '#E0E0E0'};
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.1;
  shadow-radius: 2px;
  elevation: 2;
`;

const ZoomIndicatorText = styled.Text<{ theme: ThemeType }>`
  font-size: 10px;
  font-weight: 500;
  color: ${(props: { theme: ThemeType }) => props.theme.textColor || '#666666'};
`;

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

export interface ZoomControlsProps {
  // Zoom actions
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  
  // State
  canZoomIn: boolean;
  canZoomOut: boolean;
  isZoomed: boolean;
  
  // Optional zoom level display
  zoomLevel?: number;
  showZoomIndicator?: boolean;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  canZoomOut,
  isZoomed,
  zoomLevel = 1.0,
  showZoomIndicator = true
}) => {
  const theme = useTheme() as ThemeType;

  const formattedZoomLevel = Math.round(zoomLevel * 100);

  return (
    <>
      {/* Zoom level indicator */}
      {showZoomIndicator && isZoomed && (
        <ZoomIndicator theme={theme}>
          <ZoomIndicatorText theme={theme}>
            {formattedZoomLevel}%
          </ZoomIndicatorText>
        </ZoomIndicator>
      )}

      {/* Control buttons */}
      <ControlsContainer>
        {/* Zoom In */}
        <ZoomButton
          theme={theme}
          disabled={!canZoomIn}
          onPress={onZoomIn}
          activeOpacity={0.7}
          accessible={true}
          accessibilityLabel="Zoom in to examine glucose data in detail"
          accessibilityRole="button"
        >
          <ButtonText theme={theme} disabled={!canZoomIn}>
            +
          </ButtonText>
        </ZoomButton>

        {/* Zoom Out */}
        <ZoomButton
          theme={theme}
          disabled={!canZoomOut}
          onPress={onZoomOut}
          activeOpacity={0.7}
          accessible={true}
          accessibilityLabel="Zoom out to see more glucose data"
          accessibilityRole="button"
        >
          <ButtonText theme={theme} disabled={!canZoomOut}>
            −
          </ButtonText>
        </ZoomButton>

        {/* Reset Zoom */}
        {isZoomed && (
          <ResetButton
            theme={theme}
            onPress={onReset}
            activeOpacity={0.8}
            accessible={true}
            accessibilityLabel="Reset zoom to show all glucose data"
            accessibilityRole="button"
          >
            <ResetButtonText theme={theme}>
              Reset
            </ResetButtonText>
          </ResetButton>
        )}
      </ControlsContainer>
    </>
  );
};

export default ZoomControls;
