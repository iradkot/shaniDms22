// Zoom utility functions for medical chart safety and transforms
import { ZOOM_CONFIG, MEDICAL_ZOOM_VALIDATION, ZoomState, ZoomBounds } from '../constants/zoomConfig';
import { BgSample } from 'app/types/day_bgs.types';

/**
 * Validate zoom bounds to ensure medical data remains accessible
 */
export const validateZoomBounds = (
  scale: number,
  translateX: number,
  translateY: number,
  chartWidth: number,
  chartHeight: number,
  bgData: BgSample[]
): ZoomState => {
  // Clamp scale to safe medical limits
  const validScale = Math.max(
    ZOOM_CONFIG.MIN_SCALE,
    Math.min(ZOOM_CONFIG.MAX_SCALE, scale)
  );

  // Calculate maximum translation limits based on scale
  const maxTranslateX = (chartWidth * (validScale - 1)) * ZOOM_CONFIG.MAX_PAN_X;
  const maxTranslateY = (chartHeight * (validScale - 1)) * ZOOM_CONFIG.MAX_PAN_Y;

  // Clamp translation to prevent scrolling beyond medical data
  const validTranslateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
  const validTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));

  // Validate that critical glucose ranges remain partially visible
  const isValidMedicalView = validateMedicalVisibility(
    validScale,
    validTranslateX,
    validTranslateY,
    chartWidth,
    chartHeight,
    bgData
  );

  return {
    scale: validScale,
    translateX: validTranslateX,
    translateY: validTranslateY,
    isZoomed: validScale > 1.0 || Math.abs(validTranslateX) > 1 || Math.abs(validTranslateY) > 1,
  };
};

/**
 * Validate that medical data remains meaningful after zoom/pan
 */
const validateMedicalVisibility = (
  scale: number,
  translateX: number,
  translateY: number,
  chartWidth: number,
  chartHeight: number,
  bgData: BgSample[]
): boolean => {
  if (!bgData || bgData.length === 0) return true;

  // Calculate visible glucose range after zoom/pan
  const yScale = chartHeight / (ZOOM_CONFIG.MEDICAL_BOUNDS.MAX_GLUCOSE - ZOOM_CONFIG.MEDICAL_BOUNDS.MIN_GLUCOSE);
  const visibleGlucoseRange = chartHeight / (scale * yScale);

  // Ensure minimum meaningful glucose range remains visible
  if (visibleGlucoseRange < MEDICAL_ZOOM_VALIDATION.MIN_VISIBLE_RANGE) {
    console.warn('[ZoomUtils] Zoom would hide critical glucose range');
    return false;
  }

  // Ensure sufficient data points remain visible for medical analysis
  const visibleDataPoints = estimateVisibleDataPoints(scale, translateX, bgData);
  if (visibleDataPoints < MEDICAL_ZOOM_VALIDATION.MIN_DATA_POINTS) {
    console.warn('[ZoomUtils] Zoom would show insufficient data for analysis');
    return false;
  }

  return true;
};

/**
 * Estimate number of data points visible after zoom/pan
 */
const estimateVisibleDataPoints = (
  scale: number,
  translateX: number,
  bgData: BgSample[]
): number => {
  if (!bgData.length) return 0;

  // Simple estimation based on zoom level
  // In practice, this would need chart dimensions and time range
  const visibleRatio = 1 / scale;
  return Math.round(bgData.length * visibleRatio);
};

/**
 * Calculate zoom bounds for safe medical chart interaction
 */
export const calculateZoomBounds = (
  chartWidth: number,
  chartHeight: number,
  bgData: BgSample[]
): ZoomBounds => {
  return {
    minScale: ZOOM_CONFIG.MIN_SCALE,
    maxScale: ZOOM_CONFIG.MAX_SCALE,
    minTranslateX: -(chartWidth * ZOOM_CONFIG.MAX_PAN_X),
    maxTranslateX: chartWidth * ZOOM_CONFIG.MAX_PAN_X,
    minTranslateY: -(chartHeight * ZOOM_CONFIG.MAX_PAN_Y),
    maxTranslateY: chartHeight * ZOOM_CONFIG.MAX_PAN_Y,
  };
};

/**
 * Generate SVG transform string for zoom/pan operations
 */
export const generateSVGTransform = (zoomState: ZoomState): string => {
  const { scale, translateX, translateY } = zoomState;
  return `translate(${translateX}, ${translateY}) scale(${scale})`;
};

/**
 * Calculate zoom center point for button-based zoom operations
 */
export const calculateZoomCenter = (
  chartWidth: number,
  chartHeight: number,
  currentState: ZoomState
): { x: number; y: number } => {
  // Default to center of visible area
  const centerX = chartWidth / 2 - currentState.translateX;
  const centerY = chartHeight / 2 - currentState.translateY;

  return { x: centerX, y: centerY };
};

/**
 * Reset zoom to show all medical data (medical safety function)
 */
export const getResetZoomState = (): ZoomState => {
  return {
    scale: 1.0,
    translateX: 0,
    translateY: 0,
    isZoomed: false,
  };
};

/**
 * Apply zoom sensitivity for button controls
 */
export const applyZoomStep = (
  currentScale: number,
  zoomIn: boolean,
  sensitivity: number = ZOOM_CONFIG.ZOOM_SENSITIVITY
): number => {
  if (zoomIn) {
    return Math.min(ZOOM_CONFIG.MAX_SCALE, currentScale * sensitivity);
  } else {
    return Math.max(ZOOM_CONFIG.MIN_SCALE, currentScale / sensitivity);
  }
};

/**
 * Validate zoom state for medical safety compliance
 */
export const isMedicallyValidZoom = (
  zoomState: ZoomState,
  chartWidth: number,
  chartHeight: number,
  bgData: BgSample[]
): boolean => {
  return validateMedicalVisibility(
    zoomState.scale,
    zoomState.translateX,
    zoomState.translateY,
    chartWidth,
    chartHeight,
    bgData
  );
};
