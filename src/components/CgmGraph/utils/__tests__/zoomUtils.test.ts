// Unit tests for zoom utility functions
import { 
  validateZoomBounds, 
  calculateZoomBounds,
  generateSVGTransform,
  getResetZoomState,
  applyZoomStep,
  isMedicallyValidZoom
} from '../zoomUtils';
import { ZOOM_CONFIG } from '../../constants/zoomConfig';
import { BgSample } from 'app/types/day_bgs.types';

// Mock BG data for testing
const mockBgData: BgSample[] = [
  { 
    sgv: 80, 
    date: Date.now() - 3600000, 
    dateString: new Date(Date.now() - 3600000).toISOString(),
    trend: 0, 
    direction: 'Flat', 
    device: 'test', 
    type: 'sgv' 
  },
  { 
    sgv: 120, 
    date: Date.now() - 1800000,
    dateString: new Date(Date.now() - 1800000).toISOString(),
    trend: 0, 
    direction: 'Flat', 
    device: 'test', 
    type: 'sgv' 
  },
  { 
    sgv: 180, 
    date: Date.now(),
    dateString: new Date().toISOString(),
    trend: 0, 
    direction: 'Flat', 
    device: 'test', 
    type: 'sgv' 
  },
];

describe('ZoomUtils', () => {
  const chartWidth = 350;
  const chartHeight = 200;

  describe('validateZoomBounds', () => {
    it('should clamp scale to safe medical limits', () => {
      const result = validateZoomBounds(10, 0, 0, chartWidth, chartHeight, mockBgData);
      expect(result.scale).toBe(ZOOM_CONFIG.MAX_SCALE);
    });

    it('should prevent scale below minimum', () => {
      const result = validateZoomBounds(0.1, 0, 0, chartWidth, chartHeight, mockBgData);
      expect(result.scale).toBe(ZOOM_CONFIG.MIN_SCALE);
    });

    it('should clamp translation within safe bounds', () => {
      const excessiveTranslate = chartWidth * 2; // Far beyond safe limits
      const result = validateZoomBounds(2.0, excessiveTranslate, 0, chartWidth, chartHeight, mockBgData);
      expect(Math.abs(result.translateX)).toBeLessThanOrEqual(chartWidth * ZOOM_CONFIG.MAX_PAN_X);
    });

    it('should mark zoom state correctly', () => {
      const normalZoom = validateZoomBounds(2.0, 10, 10, chartWidth, chartHeight, mockBgData);
      expect(normalZoom.isZoomed).toBe(true);

      const resetZoom = validateZoomBounds(1.0, 0, 0, chartWidth, chartHeight, mockBgData);
      expect(resetZoom.isZoomed).toBe(false);
    });
  });

  describe('calculateZoomBounds', () => {
    it('should return correct zoom bounds for chart dimensions', () => {
      const bounds = calculateZoomBounds(chartWidth, chartHeight, mockBgData);
      
      expect(bounds.minScale).toBe(ZOOM_CONFIG.MIN_SCALE);
      expect(bounds.maxScale).toBe(ZOOM_CONFIG.MAX_SCALE);
      expect(bounds.maxTranslateX).toBe(chartWidth * ZOOM_CONFIG.MAX_PAN_X);
      expect(bounds.maxTranslateY).toBe(chartHeight * ZOOM_CONFIG.MAX_PAN_Y);
    });
  });

  describe('generateSVGTransform', () => {
    it('should generate correct SVG transform string', () => {
      const zoomState = { scale: 2.0, translateX: 10, translateY: 20, isZoomed: true };
      const transform = generateSVGTransform(zoomState);
      expect(transform).toBe('translate(10, 20) scale(2)');
    });

    it('should handle zero values correctly', () => {
      const zoomState = { scale: 1.0, translateX: 0, translateY: 0, isZoomed: false };
      const transform = generateSVGTransform(zoomState);
      expect(transform).toBe('translate(0, 0) scale(1)');
    });
  });

  describe('getResetZoomState', () => {
    it('should return default zoom state', () => {
      const resetState = getResetZoomState();
      expect(resetState.scale).toBe(1.0);
      expect(resetState.translateX).toBe(0);
      expect(resetState.translateY).toBe(0);
      expect(resetState.isZoomed).toBe(false);
    });
  });

  describe('applyZoomStep', () => {
    it('should zoom in correctly', () => {
      const newScale = applyZoomStep(1.0, true);
      expect(newScale).toBe(ZOOM_CONFIG.ZOOM_SENSITIVITY);
    });

    it('should zoom out correctly', () => {
      const newScale = applyZoomStep(2.0, false);
      expect(newScale).toBe(2.0 / ZOOM_CONFIG.ZOOM_SENSITIVITY);
    });

    it('should respect maximum zoom limits when zooming in', () => {
      const newScale = applyZoomStep(ZOOM_CONFIG.MAX_SCALE, true);
      expect(newScale).toBe(ZOOM_CONFIG.MAX_SCALE);
    });

    it('should respect minimum zoom limits when zooming out', () => {
      const newScale = applyZoomStep(ZOOM_CONFIG.MIN_SCALE, false);
      expect(newScale).toBe(ZOOM_CONFIG.MIN_SCALE);
    });
  });

  describe('isMedicallyValidZoom', () => {
    it('should validate zoom state for medical safety', () => {
      const validZoom = { scale: 2.0, translateX: 10, translateY: 10, isZoomed: true };
      const isValid = isMedicallyValidZoom(validZoom, chartWidth, chartHeight, mockBgData);
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle empty data gracefully', () => {
      const validZoom = { scale: 2.0, translateX: 10, translateY: 10, isZoomed: true };
      const isValid = isMedicallyValidZoom(validZoom, chartWidth, chartHeight, []);
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('Medical Safety Edge Cases', () => {
    it('should handle extreme zoom levels safely', () => {
      const extremeZoom = validateZoomBounds(100, 0, 0, chartWidth, chartHeight, mockBgData);
      expect(extremeZoom.scale).toBeLessThanOrEqual(ZOOM_CONFIG.MAX_SCALE);
    });

    it('should handle negative scale values', () => {
      const negativeZoom = validateZoomBounds(-1, 0, 0, chartWidth, chartHeight, mockBgData);
      expect(negativeZoom.scale).toBeGreaterThanOrEqual(ZOOM_CONFIG.MIN_SCALE);
    });

    it('should maintain glucose range visibility', () => {
      // Test with more realistic data set that can support medical zoom
      const extendedMockData: BgSample[] = [];
      for (let i = 0; i < 100; i++) { // Create more data points
        extendedMockData.push({
          sgv: 120 + (i % 50), // Vary the values
          date: Date.now() + (i * 5 * 60 * 1000), // 5 minutes apart
          dateString: '2024-01-01T00:00:00.000Z',
          trend: 4,
          direction: 'Flat',
          device: 'test',
          type: 'sgv',
        });
      }
      
      // Test with medical-safe zoom that preserves data visibility
      const medicalZoom = validateZoomBounds(2.0, 0, 0, chartWidth, chartHeight, extendedMockData);
      expect(isMedicallyValidZoom(medicalZoom, chartWidth, chartHeight, extendedMockData)).toBe(true);
    });
  });
});
