// Quick test for new time-based zoom functionality
import {
  getDefaultZoomState,
  calculateTimeWindow,
  validateZoomState,
  applyZoomStep,
  canZoomIn,
  canZoomOut,
  generateTimeZoomTransform,
} from '../zoomUtils';
import { BgSample } from 'app/types/day_bgs.types';

// Mock data for testing
const createMockBgData = (count: number): BgSample[] => {
  const data: BgSample[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    data.push({
      sgv: 120 + (i % 30), // Vary glucose values
      date: startTime + (i * 5 * 60 * 1000), // 5 minutes apart
      dateString: new Date(startTime + (i * 5 * 60 * 1000)).toISOString(),
      trend: 4,
      direction: 'Flat',
      device: 'test',
      type: 'sgv',
    });
  }
  
  return data;
};

describe('Time-based Zoom Utils', () => {
  const mockBgData = createMockBgData(100); // 100 data points over ~8 hours
  const dayStartTime = mockBgData[0].date;
  const dayEndTime = mockBgData[mockBgData.length - 1].date;
  const chartWidth = 400;

  describe('Basic Functionality', () => {
    it('should create default zoom state', () => {
      const defaultState = getDefaultZoomState();
      
      expect(defaultState.timeWindowHours).toBe(24);
      expect(defaultState.panPosition).toBe(0);
      expect(defaultState.zoomLevel).toBe(1);
      expect(defaultState.isZoomed).toBe(false);
    });

    it('should calculate time window correctly', () => {
      const zoomState = {
        timeWindowHours: 12,
        panPosition: 0,
        zoomLevel: 2,
        isZoomed: true,
      };
      
      const timeWindow = calculateTimeWindow(zoomState, dayStartTime, dayEndTime);
      
      expect(timeWindow.durationHours).toBe(12);
      expect(timeWindow.startTime).toBe(dayStartTime);
      expect(timeWindow.endTime).toBeLessThanOrEqual(dayEndTime);
    });

    it('should validate zoom state within bounds', () => {
      const invalidZoomState = {
        timeWindowHours: 24,
        panPosition: 2, // Invalid - should be 0-1
        zoomLevel: 100, // Invalid - too high
        isZoomed: true,
      };
      
      const validatedState = validateZoomState(
        invalidZoomState,
        mockBgData,
        dayStartTime,
        dayEndTime
      );
      
      expect(validatedState.panPosition).toBeLessThanOrEqual(1);
      expect(validatedState.panPosition).toBeGreaterThanOrEqual(0);
      expect(validatedState.zoomLevel).toBeLessThanOrEqual(8); // MAX_ZOOM
    });
  });

  describe('Zoom Controls', () => {
    it('should zoom in correctly', () => {
      const initialState = getDefaultZoomState();
      const zoomedState = applyZoomStep(
        initialState, 
        'in', 
        mockBgData, 
        dayStartTime, 
        dayEndTime
      );
      
      expect(zoomedState.zoomLevel).toBeGreaterThan(initialState.zoomLevel);
      expect(zoomedState.isZoomed).toBe(true);
      expect(zoomedState.timeWindowHours).toBeLessThan(24);
    });

    it('should zoom out correctly', () => {
      const zoomedInState = {
        timeWindowHours: 6,
        panPosition: 0,
        zoomLevel: 4,
        isZoomed: true,
      };
      
      const zoomedOutState = applyZoomStep(
        zoomedInState, 
        'out', 
        mockBgData, 
        dayStartTime, 
        dayEndTime
      );
      
      expect(zoomedOutState.zoomLevel).toBeLessThan(zoomedInState.zoomLevel);
      expect(zoomedOutState.timeWindowHours).toBeGreaterThan(6);
    });

    it('should check zoom capability correctly', () => {
      const defaultState = getDefaultZoomState();
      expect(canZoomIn(defaultState)).toBe(true);
      expect(canZoomOut(defaultState)).toBe(false);
      
      const maxZoomedState = {
        timeWindowHours: 3,
        panPosition: 0,
        zoomLevel: 8, // MAX_ZOOM
        isZoomed: true,
      };
      
      expect(canZoomIn(maxZoomedState)).toBe(false);
      expect(canZoomOut(maxZoomedState)).toBe(true);
    });
  });

  describe('SVG Transform Generation', () => {
    it('should generate correct transform for default state', () => {
      const defaultState = getDefaultZoomState();
      const transform = generateTimeZoomTransform(defaultState, chartWidth);
      
      expect(transform).toBe('translate(0,0) scale(1,1)');
    });

    it('should generate X-axis only transform when zoomed', () => {
      const zoomedState = {
        timeWindowHours: 12,
        panPosition: 0.5, // Pan to middle
        zoomLevel: 2,
        isZoomed: true,
      };
      
      const transform = generateTimeZoomTransform(zoomedState, chartWidth);
      
      // Should contain scale with X > 1, Y = 1
      expect(transform).toMatch(/scale\(2,1\)/);
      // Should contain translate with negative X (pan effect)
      expect(transform).toMatch(/translate\(-\d+,0\)/);
    });
  });

  describe('Medical Safety', () => {
    it('should warn when insufficient data in time window', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const smallDataSet = createMockBgData(2); // Very small dataset
      const extremeZoomState = {
        timeWindowHours: 1, // Very small window
        panPosition: 0,
        zoomLevel: 8,
        isZoomed: true,
      };
      
      validateZoomState(
        extremeZoomState,
        smallDataSet,
        smallDataSet[0].date,
        smallDataSet[1].date
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ZoomUtils] Insufficient glucose data in time window')
      );
      
      consoleSpy.mockRestore();
    });
  });
});

console.log('✅ Time-based zoom utils test created');
