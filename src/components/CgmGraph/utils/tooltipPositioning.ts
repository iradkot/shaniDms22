/**
 * Smart Tooltip Positioning Utility
 * 
 * Solves finger occlusion and out-of-bounds issues for chart tooltips
 * by intelligently positioning tooltips in the best available quadrant
 * around the touch point while staying within container boundaries.
 * 
 * Medical Safety: Preserves all tooltip content and ensures critical 
 * glucose/insulin data remains clearly visible during touch interactions.
 */

/**
 * Touch and positioning constants following mobile UX guidelines
 */
export const POSITIONING_CONSTANTS = {
  // iOS HIG minimum touch target size (44pt = ~44px)
  FINGER_SIZE: 44,
  
  // Minimum distance from container edges
  TOOLTIP_MARGIN: 8,
  
  // Preferred distance from touch point (avoiding immediate contact)
  PREFERRED_OFFSET: 20,
  
  // Minimum clearance around finger to avoid occlusion
  FINGER_CLEARANCE: 50, // Slightly larger than finger for comfortable viewing
} as const;

/**
 * Available quadrants around touch point for tooltip positioning
 */
export type TooltipQuadrant = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/**
 * Quadrant preferences in order of desirability:
 * 1. top-right: Natural reading flow, away from finger
 * 2. top-left: Good alternative when right edge reached
 * 3. bottom-right: When top space unavailable
 * 4. bottom-left: Last resort (potential finger occlusion)
 */
export const QUADRANT_PREFERENCES: TooltipQuadrant[] = [
  'top-right',
  'top-left', 
  'bottom-right',
  'bottom-left'
];

/**
 * Container bounds for positioning calculations
 */
export interface ContainerBounds {
  width: number;
  height: number;
  marginTop?: number;
  marginLeft?: number;
}

/**
 * Tooltip dimensions for space calculations
 */
export interface TooltipDimensions {
  width: number;
  height: number;
}

/**
 * Touch point coordinates
 */
export interface TouchPoint {
  x: number;
  y: number;
}

/**
 * Calculated tooltip position
 */
export interface TooltipPosition {
  x: number;
  y: number;
  quadrant: TooltipQuadrant;
  clampedToBounds: boolean;
}

/**
 * Check if tooltip fits in given quadrant without going out of bounds
 */
function checkQuadrantSpace(
  touchPoint: TouchPoint,
  tooltipDimensions: TooltipDimensions,
  containerBounds: ContainerBounds,
  quadrant: TooltipQuadrant
): boolean {
  const { FINGER_CLEARANCE, TOOLTIP_MARGIN } = POSITIONING_CONSTANTS;
  const { x: touchX, y: touchY } = touchPoint;
  const { width: tooltipWidth, height: tooltipHeight } = tooltipDimensions;
  const { width: containerWidth, height: containerHeight } = containerBounds;

  let tooltipX: number;
  let tooltipY: number;

  // Calculate position for each quadrant
  switch (quadrant) {
    case 'top-right':
      tooltipX = touchX + FINGER_CLEARANCE;
      tooltipY = touchY - tooltipHeight - FINGER_CLEARANCE;
      break;
    case 'top-left':
      tooltipX = touchX - tooltipWidth - FINGER_CLEARANCE;
      tooltipY = touchY - tooltipHeight - FINGER_CLEARANCE;
      break;
    case 'bottom-right':
      tooltipX = touchX + FINGER_CLEARANCE;
      tooltipY = touchY + FINGER_CLEARANCE;
      break;
    case 'bottom-left':
      tooltipX = touchX - tooltipWidth - FINGER_CLEARANCE;
      tooltipY = touchY + FINGER_CLEARANCE;
      break;
  }

  // Check bounds
  const fitsHorizontally = 
    tooltipX >= TOOLTIP_MARGIN && 
    tooltipX + tooltipWidth <= containerWidth - TOOLTIP_MARGIN;
  
  const fitsVertically = 
    tooltipY >= TOOLTIP_MARGIN && 
    tooltipY + tooltipHeight <= containerHeight - TOOLTIP_MARGIN;

  return fitsHorizontally && fitsVertically;
}

/**
 * Calculate position for a specific quadrant
 */
function calculateQuadrantPosition(
  touchPoint: TouchPoint,
  tooltipDimensions: TooltipDimensions,
  quadrant: TooltipQuadrant
): { x: number; y: number } {
  const { FINGER_CLEARANCE } = POSITIONING_CONSTANTS;
  const { x: touchX, y: touchY } = touchPoint;
  const { width: tooltipWidth, height: tooltipHeight } = tooltipDimensions;

  switch (quadrant) {
    case 'top-right':
      return {
        x: touchX + FINGER_CLEARANCE,
        y: touchY - tooltipHeight - FINGER_CLEARANCE
      };
    case 'top-left':
      return {
        x: touchX - tooltipWidth - FINGER_CLEARANCE,
        y: touchY - tooltipHeight - FINGER_CLEARANCE
      };
    case 'bottom-right':
      return {
        x: touchX + FINGER_CLEARANCE,
        y: touchY + FINGER_CLEARANCE
      };
    case 'bottom-left':
      return {
        x: touchX - tooltipWidth - FINGER_CLEARANCE,
        y: touchY + FINGER_CLEARANCE
      };
  }
}

/**
 * Clamp tooltip position to container bounds while maintaining visibility
 */
function clampToBounds(
  position: { x: number; y: number },
  tooltipDimensions: TooltipDimensions,
  containerBounds: ContainerBounds
): { x: number; y: number; clamped: boolean } {
  const { TOOLTIP_MARGIN } = POSITIONING_CONSTANTS;
  const { width: tooltipWidth, height: tooltipHeight } = tooltipDimensions;
  const { width: containerWidth, height: containerHeight } = containerBounds;
  
  let { x, y } = position;
  let clamped = false;

  // Clamp horizontal position
  const minX = TOOLTIP_MARGIN;
  const maxX = containerWidth - tooltipWidth - TOOLTIP_MARGIN;
  if (x < minX) {
    x = minX;
    clamped = true;
  } else if (x > maxX) {
    x = maxX;
    clamped = true;
  }

  // Clamp vertical position
  const minY = TOOLTIP_MARGIN;
  const maxY = containerHeight - tooltipHeight - TOOLTIP_MARGIN;
  if (y < minY) {
    y = minY;
    clamped = true;
  } else if (y > maxY) {
    y = maxY;
    clamped = true;
  }

  return { x, y, clamped };
}

/**
 * Main function: Calculate smart tooltip position avoiding finger occlusion and bounds overflow
 * 
 * Algorithm:
 * 1. Try each quadrant in preference order
 * 2. Select first quadrant with sufficient space
 * 3. If no quadrant fits perfectly, use best option and clamp to bounds
 * 4. Fallback to top-right with clamping if all else fails
 * 
 * @param touchPoint - Where the user touched (x, y coordinates)
 * @param tooltipDimensions - Width and height of tooltip content
 * @param containerBounds - Chart container dimensions for bounds checking
 * @returns Optimal tooltip position with quadrant and clamping info
 */
export function calculateSmartTooltipPosition(
  touchPoint: TouchPoint,
  tooltipDimensions: TooltipDimensions,
  containerBounds: ContainerBounds
): TooltipPosition {
  // Try each quadrant in preference order
  for (const quadrant of QUADRANT_PREFERENCES) {
    if (checkQuadrantSpace(touchPoint, tooltipDimensions, containerBounds, quadrant)) {
      const position = calculateQuadrantPosition(touchPoint, tooltipDimensions, quadrant);
      return {
        ...position,
        quadrant,
        clampedToBounds: false
      };
    }
  }

  // No quadrant fits perfectly - use preferred quadrant (top-right) and clamp to bounds
  const fallbackQuadrant = 'top-right';
  const fallbackPosition = calculateQuadrantPosition(
    touchPoint, 
    tooltipDimensions, 
    fallbackQuadrant
  );
  
  const clampedPosition = clampToBounds(
    fallbackPosition,
    tooltipDimensions,
    containerBounds
  );

  return {
    x: clampedPosition.x,
    y: clampedPosition.y,
    quadrant: fallbackQuadrant,
    clampedToBounds: clampedPosition.clamped
  };
}

/**
 * Legacy positioning fallback - maintains current behavior as backup
 * Used when smart positioning is disabled or fails
 */
export function calculateLegacyTooltipPosition(
  touchPoint: TouchPoint,
  tooltipDimensions: TooltipDimensions,
  containerBounds: ContainerBounds
): TooltipPosition {
  const { width: tooltipWidth, height: tooltipHeight } = tooltipDimensions;
  const { width: containerWidth } = containerBounds;
  
  // Original logic: center horizontally, position above touch point
  let tooltipX = touchPoint.x - tooltipWidth / 2;
  
  // Basic horizontal bounds checking
  tooltipX = Math.max(5, tooltipX);
  if (tooltipX + tooltipWidth > containerWidth - 5) {
    tooltipX = containerWidth - tooltipWidth - 5;
  }
  
  const tooltipY = Math.max(5, touchPoint.y - tooltipHeight - 20);
  
  return {
    x: tooltipX,
    y: tooltipY,
    quadrant: 'top-right', // Approximate
    clampedToBounds: tooltipX !== (touchPoint.x - tooltipWidth / 2) || tooltipY === 5
  };
}
