// Time-based zoom context hook for X-axis temporal analysis
import { useState, useCallback, useMemo } from 'react';
import { Animated } from 'react-native';
import { BgSample } from 'app/types/day_bgs.types';
import { 
  ZoomState, 
  TimeWindow,
  ZOOM_CONFIG 
} from '../constants/zoomConfig';
import { 
  getDefaultZoomState,
  validateZoomState, 
  calculateTimeWindow,
  calculateZoomedTimeDomain,
  resetZoomState,
  applyZoomStep,
  applyPanStep,
  canZoomIn,
  canZoomOut,
  canPanLeft,
  canPanRight,
  filterDataToTimeWindow,
  formatTimeWindowText
} from '../utils/zoomUtils';

export interface ZoomContextValue {
  // Current zoom state
  zoomState: ZoomState;
  
  // Time window information
  timeWindow: TimeWindow;
  filteredData: BgSample[];  // Filtered data instead of all data + transform
  timeDomain: [number, number];  // New time domain for xScale
  
  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  
  // Pan controls for horizontal navigation
  panLeft: () => void;
  panRight: () => void;
  
  // Validation states
  canZoomIn: boolean;
  canZoomOut: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  
  // Display information for UI
  zoomPercentage: number;
  timeWindowText: string;
}

export const useZoomContext = (
  chartWidth: number,
  bgData: BgSample[],
  dayStartTime: number,  // Start of day timestamp
  dayEndTime: number     // End of day timestamp
): ZoomContextValue => {
  // Core zoom state - time-based
  const [zoomState, setZoomState] = useState<ZoomState>(getDefaultZoomState());
  
  // Calculate current time window
  const timeWindow = useMemo(() => 
    calculateTimeWindow(zoomState, dayStartTime, dayEndTime),
    [zoomState, dayStartTime, dayEndTime]
  );
  
  // Filter data to visible time window instead of using transforms
  const filteredData = useMemo(() => 
    filterDataToTimeWindow(bgData, timeWindow),
    [bgData, timeWindow]
  );
  
  // Calculate new time domain for filtered data
  const timeDomain = useMemo(() => 
    calculateZoomedTimeDomain(timeWindow),
    [timeWindow]
  );
  
  // Zoom control functions
  const zoomIn = useCallback(() => {
    setZoomState(current => 
      applyZoomStep(current, 'in', bgData, dayStartTime, dayEndTime)
    );
  }, [bgData, dayStartTime, dayEndTime]);
  
  const zoomOut = useCallback(() => {
    setZoomState(current => 
      applyZoomStep(current, 'out', bgData, dayStartTime, dayEndTime)
    );
  }, [bgData, dayStartTime, dayEndTime]);
  
  const resetZoom = useCallback(() => {
    setZoomState(resetZoomState());
  }, []);
  
  // Pan control functions for horizontal navigation
  const panLeft = useCallback(() => {
    setZoomState(current => applyPanStep(current, 'left'));
  }, []);
  
  const panRight = useCallback(() => {
    setZoomState(current => applyPanStep(current, 'right'));
  }, []);
  
  // Pinch gesture handler (for future implementation)
  const handlePinchGesture = useCallback((scale: number, translateX: number) => {
    // Convert pinch gesture to time-based zoom
    const newZoomLevel = Math.max(1, scale);
    const newPanPosition = Math.max(0, Math.min(1, -translateX / (chartWidth * (scale - 1))));
    
    setZoomState(current => 
      validateZoomState(
        {
          ...current,
          zoomLevel: newZoomLevel,
          panPosition: newPanPosition,
        },
        bgData,
        dayStartTime,
        dayEndTime
      )
    );
  }, [chartWidth, bgData, dayStartTime, dayEndTime]);
  
  // Control validation states
  const controlStates = useMemo(() => ({
    canZoomIn: canZoomIn(zoomState),
    canZoomOut: canZoomOut(zoomState),
    canPanLeft: canPanLeft(zoomState),
    canPanRight: canPanRight(zoomState),
  }), [zoomState]);
  
  // Display information for UI
  const zoomPercentage = useMemo(() => {
    return Math.round((100 * ZOOM_CONFIG.TIME_WINDOWS.FULL_DAY) / zoomState.timeWindowHours);
  }, [zoomState.timeWindowHours]);
  
  const timeWindowText = useMemo(() => 
    formatTimeWindowText(zoomState.timeWindowHours), 
    [zoomState.timeWindowHours]
  );
  
  return {
    zoomState,
    timeWindow,
    filteredData,
    timeDomain,
    zoomIn,
    zoomOut,
    resetZoom,
    panLeft,
    panRight,
    canZoomIn: controlStates.canZoomIn,
    canZoomOut: controlStates.canZoomOut,
    canPanLeft: controlStates.canPanLeft,
    canPanRight: controlStates.canPanRight,
    zoomPercentage,
    timeWindowText,
  };
};
