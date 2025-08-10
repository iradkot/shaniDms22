// Data-filtering zoom utilities for clean temporal analysis
import { ZOOM_CONFIG, MEDICAL_ZOOM_VALIDATION, ZoomState, ZoomBounds, TimeWindow } from '../constants/zoomConfig';
import { BgSample } from 'app/types/day_bgs.types';

/**
 * Create default zoom state (full 24-hour view)
 */
export const getDefaultZoomState = (): ZoomState => ({
  timeWindowHours: ZOOM_CONFIG.TIME_WINDOWS.FULL_DAY, // 24 hours
  panPosition: 0, // Start at beginning of day
  zoomLevel: 1,   // 1x zoom (full day)
  isZoomed: false,
});

/**
 * Calculate time window boundaries from zoom state
 */
export const calculateTimeWindow = (
  zoomState: ZoomState,
  dayStartTime: number, // Start of the day in milliseconds
  dayEndTime: number    // End of the day in milliseconds
): TimeWindow => {
  const dayDurationMs = dayEndTime - dayStartTime;
  const windowDurationMs = (zoomState.timeWindowHours / 24) * dayDurationMs;
  
  // Calculate start position based on pan
  const maxPanMs = dayDurationMs - windowDurationMs;
  const startOffsetMs = zoomState.panPosition * maxPanMs;
  
  const startTime = dayStartTime + startOffsetMs;
  const endTime = Math.min(startTime + windowDurationMs, dayEndTime);
  
  return {
    startTime,
    endTime,
    durationHours: zoomState.timeWindowHours,
  };
};

/**
 * Filter BG samples to only include data within the current time window
 * This is the core of proper zoom - show fewer, clearer data points
 */
export const filterDataToTimeWindow = (
  bgData: BgSample[],
  timeWindow: TimeWindow
): BgSample[] => {
  return bgData.filter(sample => 
    sample.date >= timeWindow.startTime && sample.date <= timeWindow.endTime
  );
};

/**
 * Calculate the new time domain for the filtered data
 * This replaces SVG transforms - we recreate the chart with new bounds
 */
export const calculateZoomedTimeDomain = (
  timeWindow: TimeWindow
): [number, number] => {
  return [timeWindow.startTime, timeWindow.endTime];
};

/**
 * Validate zoom state for medical safety and data availability
 */
export const validateZoomState = (
  zoomState: ZoomState,
  bgData: BgSample[],
  dayStartTime: number,
  dayEndTime: number
): ZoomState => {
  // Clamp zoom level to valid range
  const clampedZoomLevel = Math.max(
    ZOOM_CONFIG.MIN_ZOOM, 
    Math.min(ZOOM_CONFIG.MAX_ZOOM, zoomState.zoomLevel)
  );
  
  // Calculate time window hours from zoom level
  const timeWindowHours = ZOOM_CONFIG.TIME_WINDOWS.FULL_DAY / clampedZoomLevel;
  
  // Clamp pan position to valid range
  const clampedPanPosition = Math.max(0, Math.min(1, zoomState.panPosition));
  
  // Validate medical requirements
  const timeWindow = calculateTimeWindow(
    { ...zoomState, zoomLevel: clampedZoomLevel, panPosition: clampedPanPosition, timeWindowHours },
    dayStartTime,
    dayEndTime
  );
  
  const validatedState: ZoomState = {
    timeWindowHours,
    panPosition: clampedPanPosition,
    zoomLevel: clampedZoomLevel,
    isZoomed: clampedZoomLevel > 1,
  };
  
  // Check if we have enough data in the time window
  if (!hasMinimumDataForAnalysis(bgData, timeWindow)) {
    console.warn('[ZoomUtils] Insufficient glucose data in time window for medical analysis');
  }
  
  return validatedState;
};

/**
 * Check if time window has sufficient data for medical analysis
 */
const hasMinimumDataForAnalysis = (bgData: BgSample[], timeWindow: TimeWindow): boolean => {
  const dataInWindow = filterDataToTimeWindow(bgData, timeWindow);
  const requiredReadings = timeWindow.durationHours * MEDICAL_ZOOM_VALIDATION.MIN_READINGS_PER_HOUR;
  return dataInWindow.length >= requiredReadings;
};

/**
 * Apply zoom step (zoom in or out)
 */
export const applyZoomStep = (
  currentState: ZoomState,
  direction: 'in' | 'out',
  bgData: BgSample[],
  dayStartTime: number,
  dayEndTime: number
): ZoomState => {
  const newZoomLevel = direction === 'in' 
    ? currentState.zoomLevel * ZOOM_CONFIG.ZOOM_STEP
    : currentState.zoomLevel / ZOOM_CONFIG.ZOOM_STEP;
  
  return validateZoomState(
    {
      ...currentState,
      zoomLevel: newZoomLevel,
    },
    bgData,
    dayStartTime,
    dayEndTime
  );
};

/**
 * Apply horizontal pan (left or right navigation)
 */
export const applyPanStep = (
  currentState: ZoomState,
  direction: 'left' | 'right',
  stepSize: number = 0.1 // 10% of available pan range
): ZoomState => {
  const panDelta = direction === 'right' ? stepSize : -stepSize;
  const newPanPosition = currentState.panPosition + panDelta;
  
  return {
    ...currentState,
    panPosition: Math.max(0, Math.min(1, newPanPosition)),
  };
};

/**
 * Reset to full day view
 */
export const resetZoomState = (): ZoomState => getDefaultZoomState();

/**
 * Calculate zoom bounds for UI controls
 */
export const calculateZoomBounds = (
  currentState: ZoomState,
  bgData: BgSample[],
  dayStartTime: number,
  dayEndTime: number
): ZoomBounds => {
  const timeWindow = calculateTimeWindow(currentState, dayStartTime, dayEndTime);
  
  return {
    minZoom: ZOOM_CONFIG.MIN_ZOOM,
    maxZoom: ZOOM_CONFIG.MAX_ZOOM,
    minPan: 0,
    maxPan: 1,
    timeWindow,
  };
};

/**
 * Check if zoom level can be increased (zoom in)
 */
export const canZoomIn = (currentState: ZoomState): boolean => {
  return currentState.zoomLevel < ZOOM_CONFIG.MAX_ZOOM;
};

/**
 * Check if zoom level can be decreased (zoom out)
 */
export const canZoomOut = (currentState: ZoomState): boolean => {
  return currentState.zoomLevel > ZOOM_CONFIG.MIN_ZOOM;
};

/**
 * Check if can pan left
 */
export const canPanLeft = (currentState: ZoomState): boolean => {
  return currentState.panPosition > 0;
};

/**
 * Check if can pan right
 */
export const canPanRight = (currentState: ZoomState): boolean => {
  return currentState.panPosition < 1 && currentState.isZoomed;
};

/**
 * Format time window for display
 */
export const formatTimeWindowText = (timeWindowHours: number): string => {
  if (timeWindowHours >= 24) return '24h';
  if (timeWindowHours >= 12) return '12h';
  if (timeWindowHours >= 6) return '6h';
  if (timeWindowHours >= 3) return '3h';
  if (timeWindowHours >= 1) return `${Math.round(timeWindowHours)}h`;
  return `${Math.round(timeWindowHours * 60)}m`;
};
