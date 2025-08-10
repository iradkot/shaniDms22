// Time-based zoom controls with pan navigation for temporal analysis
import React from 'react';
import { TouchableOpacity } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { ThemeType } from 'app/types/theme';
import { ZOOM_CONTROLS_CONFIG } from '../constants/zoomConfig';

interface ZoomControlsProps {
  // Zoom controls
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  
  // Pan controls for time navigation
  onPanLeft: () => void;
  onPanRight: () => void;
  
  // Control states
  canZoomIn: boolean;
  canZoomOut: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  
  // Display state
  isZoomed: boolean;
  timeWindowText: string;     // "24h", "12h", "6h", "3h"
  zoomPercentage: number;     // For zoom indicator
  
  // UI options
  showZoomIndicator?: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onPanLeft,
  onPanRight,
  canZoomIn,
  canZoomOut,
  canPanLeft,
  canPanRight,
  isZoomed,
  timeWindowText,
  zoomPercentage,
  showZoomIndicator = true,
}) => {
  const theme = useTheme();

  return (
    <Container>
      {/* Time Window Indicator */}
      {isZoomed && showZoomIndicator && (
        <TimeWindowIndicator>
          <TimeWindowText theme={theme}>
            {timeWindowText}
          </TimeWindowText>
        </TimeWindowIndicator>
      )}
      
      {/* Pan Controls Row - Only show when zoomed */}
      {isZoomed && (
        <PanControlsRow>
          <PanButton
            onPress={onPanLeft}
            disabled={!canPanLeft}
            theme={theme}
            accessibilityRole="button"
            accessibilityLabel="Pan left to see earlier glucose data"
          >
            <PanButtonText theme={theme} disabled={!canPanLeft}>
              ←
            </PanButtonText>
          </PanButton>
          
          <PanButton
            onPress={onPanRight}
            disabled={!canPanRight}
            theme={theme}
            accessibilityRole="button"
            accessibilityLabel="Pan right to see later glucose data"
          >
            <PanButtonText theme={theme} disabled={!canPanRight}>
              →
            </PanButtonText>
          </PanButton>
        </PanControlsRow>
      )}
      
      {/* Zoom Controls Row */}
      <ZoomControlsRow>
        <ZoomButton
          onPress={onZoomOut}
          disabled={!canZoomOut}
          theme={theme}
          accessibilityRole="button"
          accessibilityLabel="Zoom out to see longer time period"
        >
          <ZoomButtonText theme={theme} disabled={!canZoomOut}>
            −
          </ZoomButtonText>
        </ZoomButton>
        
        <ZoomButton
          onPress={onZoomIn}
          disabled={!canZoomIn}
          theme={theme}
          accessibilityRole="button"
          accessibilityLabel="Zoom in to examine shorter time period in detail"
        >
          <ZoomButtonText theme={theme} disabled={!canZoomIn}>
            +
          </ZoomButtonText>
        </ZoomButton>
      </ZoomControlsRow>
      
      {/* Reset Button - Only show when zoomed */}
      {isZoomed && (
        <ResetButton
          onPress={onReset}
          theme={theme}
          accessibilityRole="button"
          accessibilityLabel="Reset to show full day glucose data"
        >
          <ResetButtonText theme={theme}>
            Reset
          </ResetButtonText>
        </ResetButton>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.View`
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  flex-direction: row;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 8px;
  shadow-color: #000000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
  elevation: 3;
  z-index: 100;
  gap: 8px;
`;

const TimeWindowIndicator = styled.View<{ theme: ThemeType }>`
  background-color: ${({ theme }) => theme.backgroundColor};
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 12px;
  padding: 4px 8px;
  margin-bottom: 4px;
`;

const TimeWindowText = styled.Text<{ theme: ThemeType }>`
  color: ${({ theme }) => theme.textColor};
  font-size: 12px;
  font-weight: 600;
`;

const PanControlsRow = styled.View`
  flex-direction: row;
  gap: ${ZOOM_CONTROLS_CONFIG.SPACING}px;
`;

const ZoomControlsRow = styled.View`
  flex-direction: row;
  gap: ${ZOOM_CONTROLS_CONFIG.SPACING}px;
`;

const ZoomButton = styled(TouchableOpacity)<{ theme: ThemeType; disabled: boolean }>`
  width: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  height: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  border-radius: ${ZOOM_CONTROLS_CONFIG.BORDER_RADIUS}px;
  background-color: ${({ theme, disabled }) => 
    disabled ? theme.borderColor : theme.buttonBackgroundColor};
  justify-content: center;
  align-items: center;
  elevation: 2;
  shadow-color: ${({ theme }) => theme.shadowColor};
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
`;

const ZoomButtonText = styled.Text<{ theme: ThemeType; disabled: boolean }>`
  color: ${({ theme, disabled }) => 
    disabled ? theme.textColor : theme.buttonTextColor};
  font-size: ${ZOOM_CONTROLS_CONFIG.ICON_SIZE}px;
  font-weight: 300;
  line-height: ${ZOOM_CONTROLS_CONFIG.ICON_SIZE}px;
`;

const PanButton = styled(TouchableOpacity)<{ theme: ThemeType; disabled: boolean }>`
  width: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  height: ${ZOOM_CONTROLS_CONFIG.BUTTON_SIZE}px;
  border-radius: ${ZOOM_CONTROLS_CONFIG.BORDER_RADIUS}px;
  background-color: ${({ theme, disabled }) => 
    disabled ? theme.borderColor : theme.secondaryColor};
  justify-content: center;
  align-items: center;
  elevation: 2;
  shadow-color: ${({ theme }) => theme.shadowColor};
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
`;

const PanButtonText = styled.Text<{ theme: ThemeType; disabled: boolean }>`
  color: ${({ theme, disabled }) => 
    disabled ? theme.textColor : theme.buttonTextColor};
  font-size: 18px;
  font-weight: 500;
`;

const ResetButton = styled(TouchableOpacity)<{ theme: ThemeType }>`
  background-color: ${({ theme }) => theme.accentColor};
  padding: 6px 12px;
  border-radius: 16px;
  margin-top: 4px;
  elevation: 2;
  shadow-color: ${({ theme }) => theme.shadowColor};
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
`;

const ResetButtonText = styled.Text<{ theme: ThemeType }>`
  color: ${({ theme }) => theme.buttonTextColor};
  font-size: 12px;
  font-weight: 600;
`;

export default ZoomControls;
