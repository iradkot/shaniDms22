// Zoom context hook for managing chart zoom state
import { useState, useCallback, useMemo } from 'react';
import { Animated } from 'react-native';
import { BgSample } from 'app/types/day_bgs.types';
import { 
  ZoomState, 
  ZOOM_CONFIG, 
  ZOOM_CONTROLS_CONFIG 
} from '../constants/zoomConfig';
import { 
  validateZoomBounds, 
  calculateZoomBounds, 
  generateSVGTransform,
  getResetZoomState,
  applyZoomStep,
  isMedicallyValidZoom
} from '../utils/zoomUtils';

export interface ZoomContextValue {
  // Current zoom state
  zoomState: ZoomState;
  
  // Transform string for SVG
  svgTransform: string;
  
  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  
  // Gesture handlers
  handlePinchGesture: (scale: number, translateX: number, translateY: number) => void;
  
  // Validation
  isValidZoom: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  
  // Animation values (for smooth transitions)
  animatedScale: Animated.Value;
  animatedTranslateX: Animated.Value;
  animatedTranslateY: Animated.Value;
}

export const useZoomContext = (
  chartWidth: number,
  chartHeight: number,
  bgData: BgSample[]
): ZoomContextValue => {
  // Core zoom state
  const [zoomState, setZoomState] = useState<ZoomState>(getResetZoomState());
  
  // Animated values for smooth transitions
  const animatedScale = useMemo(() => new Animated.Value(1), []);
  const animatedTranslateX = useMemo(() => new Animated.Value(0), []);
  const animatedTranslateY = useMemo(() => new Animated.Value(0), []);

  // Validate current zoom state for medical safety
  const isValidZoom = useMemo(() => {
    return isMedicallyValidZoom(zoomState, chartWidth, chartHeight, bgData);
  }, [zoomState, chartWidth, chartHeight, bgData]);

  // Check zoom limits
  const canZoomIn = useMemo(() => {
    return zoomState.scale < ZOOM_CONFIG.MAX_SCALE;
  }, [zoomState.scale]);

  const canZoomOut = useMemo(() => {
    return zoomState.scale > ZOOM_CONFIG.MIN_SCALE;
  }, [zoomState.scale]);

  // Generate SVG transform string
  const svgTransform = useMemo(() => {
    return generateSVGTransform(zoomState);
  }, [zoomState]);

  // Update zoom state with validation
  const updateZoomState = useCallback((
    newScale: number,
    newTranslateX: number,
    newTranslateY: number,
    animate: boolean = true
  ) => {
    const validatedState = validateZoomBounds(
      newScale,
      newTranslateX,
      newTranslateY,
      chartWidth,
      chartHeight,
      bgData
    );

    setZoomState(validatedState);

    // Animate to new position for smooth UX
    if (animate) {
      const duration = validatedState.isZoomed 
        ? ZOOM_CONFIG.ZOOM_ANIMATION_DURATION 
        : ZOOM_CONFIG.RESET_ANIMATION_DURATION;

      Animated.parallel([
        Animated.timing(animatedScale, {
          toValue: validatedState.scale,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(animatedTranslateX, {
          toValue: validatedState.translateX,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(animatedTranslateY, {
          toValue: validatedState.translateY,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Immediate update for gesture tracking
      animatedScale.setValue(validatedState.scale);
      animatedTranslateX.setValue(validatedState.translateX);
      animatedTranslateY.setValue(validatedState.translateY);
    }
  }, [chartWidth, chartHeight, bgData, animatedScale, animatedTranslateX, animatedTranslateY]);

  // Button-based zoom in
  const zoomIn = useCallback(() => {
    const newScale = applyZoomStep(zoomState.scale, true);
    updateZoomState(newScale, zoomState.translateX, zoomState.translateY);
    
    // Optional haptic feedback for mobile
    if (ZOOM_CONTROLS_CONFIG.HAPTIC_ENABLED) {
      // Note: Would need react-native-haptic-feedback for production
      console.log('[ZoomContext] Haptic feedback: zoom in');
    }
  }, [zoomState, updateZoomState]);

  // Button-based zoom out
  const zoomOut = useCallback(() => {
    const newScale = applyZoomStep(zoomState.scale, false);
    updateZoomState(newScale, zoomState.translateX, zoomState.translateY);
    
    // Optional haptic feedback for mobile
    if (ZOOM_CONTROLS_CONFIG.HAPTIC_ENABLED) {
      console.log('[ZoomContext] Haptic feedback: zoom out');
    }
  }, [zoomState, updateZoomState]);

  // Reset to show all medical data
  const resetZoom = useCallback(() => {
    const resetState = getResetZoomState();
    updateZoomState(resetState.scale, resetState.translateX, resetState.translateY);
    
    // Optional haptic feedback for mobile
    if (ZOOM_CONTROLS_CONFIG.HAPTIC_ENABLED) {
      console.log('[ZoomContext] Haptic feedback: reset zoom');
    }
  }, [updateZoomState]);

  // Handle pinch gesture from react-native-gesture-handler
  const handlePinchGesture = useCallback((
    scale: number,
    translateX: number,
    translateY: number
  ) => {
    // Apply pinch gesture with real-time validation
    updateZoomState(scale, translateX, translateY, false);
  }, [updateZoomState]);

  return {
    zoomState,
    svgTransform,
    zoomIn,
    zoomOut,
    resetZoom,
    handlePinchGesture,
    isValidZoom,
    canZoomIn,
    canZoomOut,
    animatedScale,
    animatedTranslateX,
    animatedTranslateY,
  };
};
