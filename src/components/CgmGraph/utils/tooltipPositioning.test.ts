/**
 * Tests for Smart Tooltip Positioning Utility
 * 
 * Validates finger occlusion avoidance and bounds checking
 * for medical chart tooltips in various scenarios
 */

import {
  calculateSmartTooltipPosition,
  calculateLegacyTooltipPosition,
  POSITIONING_CONSTANTS,
  QUADRANT_PREFERENCES,
  ContainerBounds,
  TooltipDimensions,
  TouchPoint,
  TooltipPosition
} from './tooltipPositioning';

describe('Smart Tooltip Positioning', () => {
  // Standard test dimensions based on real tooltip sizes
  const containerBounds: ContainerBounds = {
    width: 350,  // Typical chart width
    height: 200  // Typical chart height
  };

  const tooltipDimensions: TooltipDimensions = {
    width: 160,   // SgvTooltip width
    height: 70    // SgvTooltip height
  };

  describe('calculateSmartTooltipPosition', () => {
    test('positions tooltip in top-right quadrant for center touch', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 }; // Center of chart
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.quadrant).toBe('top-right');
      expect(result.x).toBe(touchPoint.x + POSITIONING_CONSTANTS.FINGER_CLEARANCE);
      expect(result.y).toBe(touchPoint.y - tooltipDimensions.height - POSITIONING_CONSTANTS.FINGER_CLEARANCE);
      expect(result.clampedToBounds).toBe(false);
    });

    test('falls back to top-left when right edge would overflow', () => {
      const touchPoint: TouchPoint = { x: 300, y: 100 }; // Near right edge
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.quadrant).toBe('top-left');
      expect(result.x).toBe(touchPoint.x - tooltipDimensions.width - POSITIONING_CONSTANTS.FINGER_CLEARANCE);
      expect(result.y).toBe(touchPoint.y - tooltipDimensions.height - POSITIONING_CONSTANTS.FINGER_CLEARANCE);
    });

    test('falls back to bottom-right when top edge would overflow', () => {
      const touchPoint: TouchPoint = { x: 100, y: 30 }; // Near top edge
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.quadrant).toBe('bottom-right');
      expect(result.x).toBe(touchPoint.x + POSITIONING_CONSTANTS.FINGER_CLEARANCE);
      expect(result.y).toBe(touchPoint.y + POSITIONING_CONSTANTS.FINGER_CLEARANCE);
    });

    test('falls back to bottom-left when both top and right would overflow', () => {
      const touchPoint: TouchPoint = { x: 320, y: 30 }; // Near top-right corner
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.quadrant).toBe('bottom-left');
      expect(result.x).toBe(touchPoint.x - tooltipDimensions.width - POSITIONING_CONSTANTS.FINGER_CLEARANCE);
      expect(result.y).toBe(touchPoint.y + POSITIONING_CONSTANTS.FINGER_CLEARANCE);
    });

    test('clamps to bounds when no quadrant has sufficient space', () => {
      const touchPoint: TouchPoint = { x: 10, y: 10 }; // Very close to top-left corner
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      // Should attempt top-right but clamp to bounds
      expect(result.quadrant).toBe('top-right');
      expect(result.clampedToBounds).toBe(true);
      expect(result.x).toBeGreaterThanOrEqual(POSITIONING_CONSTANTS.TOOLTIP_MARGIN);
      expect(result.y).toBeGreaterThanOrEqual(POSITIONING_CONSTANTS.TOOLTIP_MARGIN);
    });

    test('maintains minimum distance from container edges', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.x).toBeGreaterThanOrEqual(POSITIONING_CONSTANTS.TOOLTIP_MARGIN);
      expect(result.y).toBeGreaterThanOrEqual(POSITIONING_CONSTANTS.TOOLTIP_MARGIN);
      expect(result.x + tooltipDimensions.width).toBeLessThanOrEqual(
        containerBounds.width - POSITIONING_CONSTANTS.TOOLTIP_MARGIN
      );
      expect(result.y + tooltipDimensions.height).toBeLessThanOrEqual(
        containerBounds.height - POSITIONING_CONSTANTS.TOOLTIP_MARGIN
      );
    });

    test('avoids finger occlusion area', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      // Tooltip should be positioned away from finger area
      const fingerRadius = POSITIONING_CONSTANTS.FINGER_SIZE / 2;
      const tooltipCenter = {
        x: result.x + tooltipDimensions.width / 2,
        y: result.y + tooltipDimensions.height / 2
      };

      const distanceFromFinger = Math.sqrt(
        Math.pow(tooltipCenter.x - touchPoint.x, 2) + 
        Math.pow(tooltipCenter.y - touchPoint.y, 2)
      );

      expect(distanceFromFinger).toBeGreaterThan(fingerRadius);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('handles very small container', () => {
      const smallContainer: ContainerBounds = { width: 100, height: 100 };
      const touchPoint: TouchPoint = { x: 50, y: 50 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        smallContainer
      );

      // Should still provide valid position within bounds
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.x + tooltipDimensions.width).toBeLessThanOrEqual(smallContainer.width);
      expect(result.y + tooltipDimensions.height).toBeLessThanOrEqual(smallContainer.height);
      expect(result.clampedToBounds).toBe(true);
    });

    test('handles very large tooltip', () => {
      const largeTooltip: TooltipDimensions = { width: 300, height: 150 };
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        largeTooltip,
        containerBounds
      );

      // Should still fit within container bounds
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.x + largeTooltip.width).toBeLessThanOrEqual(containerBounds.width);
      expect(result.y + largeTooltip.height).toBeLessThanOrEqual(containerBounds.height);
    });

    test('handles touch at exact container edge', () => {
      const touchPoint: TouchPoint = { x: 0, y: 0 }; // Exact corner
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.clampedToBounds).toBe(true);
    });
  });

  describe('Medical Safety and Performance', () => {
    test('positioning calculation completes quickly', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const startTime = performance.now();
      calculateSmartTooltipPosition(touchPoint, tooltipDimensions, containerBounds);
      const endTime = performance.now();

      // Should complete in under 1ms for responsive touch interactions
      expect(endTime - startTime).toBeLessThan(1);
    });

    test('produces consistent results for same input', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const result1 = calculateSmartTooltipPosition(touchPoint, tooltipDimensions, containerBounds);
      const result2 = calculateSmartTooltipPosition(touchPoint, tooltipDimensions, containerBounds);

      expect(result1).toEqual(result2);
    });

    test('handles extreme coordinate values gracefully', () => {
      const extremePoints: TouchPoint[] = [
        { x: -100, y: -100 },  // Negative coordinates
        { x: 1000, y: 1000 },  // Very large coordinates
        { x: 0.5, y: 0.5 },    // Fractional coordinates
      ];

      extremePoints.forEach(touchPoint => {
        expect(() => {
          calculateSmartTooltipPosition(touchPoint, tooltipDimensions, containerBounds);
        }).not.toThrow();
      });
    });
  });

  describe('Legacy Positioning Compatibility', () => {
    test('legacy positioning matches original behavior', () => {
      const touchPoint: TouchPoint = { x: 175, y: 100 };
      
      const result = calculateLegacyTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      // Should position above touch point, centered horizontally
      const expectedX = touchPoint.x - tooltipDimensions.width / 2;
      const expectedY = touchPoint.y - tooltipDimensions.height - 20;

      expect(result.x).toBeCloseTo(expectedX);
      expect(result.y).toBe(Math.max(5, expectedY));
      expect(result.quadrant).toBe('top-right');
    });

    test('legacy positioning handles horizontal bounds', () => {
      const touchPoint: TouchPoint = { x: 320, y: 100 }; // Near right edge
      
      const result = calculateLegacyTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.x + tooltipDimensions.width).toBeLessThanOrEqual(containerBounds.width - 5);
      expect(result.clampedToBounds).toBe(true);
    });
  });

  describe('Quadrant Preference Logic', () => {
    test('follows correct quadrant preference order', () => {
      expect(QUADRANT_PREFERENCES).toEqual([
        'top-right',
        'top-left',
        'bottom-right', 
        'bottom-left'
      ]);
    });

    test('selects less preferred quadrant when preferred unavailable', () => {
      // Position where top-right would overflow, but top-left fits
      const touchPoint: TouchPoint = { x: 300, y: 80 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      expect(result.quadrant).toBe('top-left'); // Second preference
      expect(result.clampedToBounds).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    test('glucose reading tooltip near chart top (reproduces user issue)', () => {
      // Simulates the scenario from the user's screenshot
      const touchPoint: TouchPoint = { x: 120, y: 30 }; // Near top of chart
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        tooltipDimensions,
        containerBounds
      );

      // Should position below touch point to avoid top overflow
      expect(result.quadrant).toBe('bottom-right');
      expect(result.y).toBeGreaterThan(touchPoint.y); // Below touch point
      expect(result.y + tooltipDimensions.height).toBeLessThanOrEqual(
        containerBounds.height - POSITIONING_CONSTANTS.TOOLTIP_MARGIN
      );
    });

    test('insulin bolus tooltip on mobile device', () => {
      // Typical mobile chart dimensions
      const mobileContainer: ContainerBounds = { width: 320, height: 180 };
      const bolusTooltip: TooltipDimensions = { width: 180, height: 95 };
      const touchPoint: TouchPoint = { x: 280, y: 40 };
      
      const result = calculateSmartTooltipPosition(
        touchPoint,
        bolusTooltip,
        mobileContainer
      );

      // Should fit within mobile viewport
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.x + bolusTooltip.width).toBeLessThanOrEqual(mobileContainer.width);
      expect(result.y + bolusTooltip.height).toBeLessThanOrEqual(mobileContainer.height);
    });
  });
});
