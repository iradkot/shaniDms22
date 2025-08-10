/**
 * Test file for the simplified CustomGlucoseRangeSlider with draggable knobs
 */

import { calculateCustomRangePercentage } from '../CustomGlucoseRangeSlider';
import { BgSample } from 'app/types/day_bgs.types';

// Mock blood glucose data for testing
const mockBgData: BgSample[] = [
  { sgv: 60, date: new Date('2023-01-01T08:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T08:00:00', trend: 4, device: 'test' },
  { sgv: 80, date: new Date('2023-01-01T09:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T09:00:00', trend: 4, device: 'test' },
  { sgv: 120, date: new Date('2023-01-01T10:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T10:00:00', trend: 4, device: 'test' },
  { sgv: 150, date: new Date('2023-01-01T11:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T11:00:00', trend: 4, device: 'test' },
  { sgv: 200, date: new Date('2023-01-01T12:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T12:00:00', trend: 4, device: 'test' },
  { sgv: 100, date: new Date('2023-01-01T13:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T13:00:00', trend: 4, device: 'test' },
  { sgv: 90, date: new Date('2023-01-01T14:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T14:00:00', trend: 4, device: 'test' },
  { sgv: 110, date: new Date('2023-01-01T15:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T15:00:00', trend: 4, device: 'test' },
  { sgv: 130, date: new Date('2023-01-01T16:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T16:00:00', trend: 4, device: 'test' },
  { sgv: 95, date: new Date('2023-01-01T17:00:00').getTime(), direction: 'Flat', type: 'sgv', dateString: '2023-01-01T17:00:00', trend: 4, device: 'test' },
];

describe('CustomGlucoseRangeSlider - Simplified Version', () => {
  describe('calculateCustomRangePercentage', () => {
    it('should calculate percentage correctly for standard range (70-140)', () => {
      // Values in range: 80, 120, 100, 90, 110, 130, 95 = 7 out of 10 = 70%
      const percentage = calculateCustomRangePercentage(mockBgData, 70, 140);
      expect(percentage).toBe(70);
    });

    it('should calculate percentage correctly for tight range (80-120)', () => {
      // Values in range: 80, 120, 100, 90, 110, 95 = 6 out of 10 = 60%
      const percentage = calculateCustomRangePercentage(mockBgData, 80, 120);
      expect(percentage).toBe(60);
    });

    it('should calculate percentage correctly for wide range (50-250)', () => {
      // All values should be in range = 10 out of 10 = 100%
      const percentage = calculateCustomRangePercentage(mockBgData, 50, 250);
      expect(percentage).toBe(100);
    });

    it('should calculate percentage correctly for narrow range (100-110)', () => {
      // Values in range: 100, 110 = 2 out of 10 = 20%
      const percentage = calculateCustomRangePercentage(mockBgData, 100, 110);
      expect(percentage).toBe(20);
    });

    it('should return 0% for empty data', () => {
      const percentage = calculateCustomRangePercentage([], 70, 140);
      expect(percentage).toBe(0);
    });

    it('should return 0% for impossible range', () => {
      // No values between 300-400
      const percentage = calculateCustomRangePercentage(mockBgData, 300, 400);
      expect(percentage).toBe(0);
    });
  });
});

// Test the slider range (40-200 mg/dL)
describe('Slider Range Tests', () => {
  it('should work with full slider range (40-200)', () => {
    const percentage = calculateCustomRangePercentage(mockBgData, 40, 200);
    expect(percentage).toBe(100); // All mock data should be in this range
  });

  it('should work with extreme low values', () => {
    const percentage = calculateCustomRangePercentage(mockBgData, 40, 70);
    expect(percentage).toBe(10); // Only the 60 mg/dL value = 1 out of 10 = 10%
  });

  it('should work with high values in practical range', () => {
    const percentage = calculateCustomRangePercentage(mockBgData, 180, 200);
    expect(percentage).toBe(10); // Only the 200 mg/dL value = 1 out of 10 = 10%
  });

  it('should handle values at the slider boundaries', () => {
    // Test that 200 mg/dL is included (our max boundary)
    const percentageIncluding200 = calculateCustomRangePercentage(mockBgData, 190, 200);
    expect(percentageIncluding200).toBe(10); // Should include the 200 mg/dL reading
    
    // Test that 40 mg/dL would be included (our min boundary)
    const percentageIncluding40 = calculateCustomRangePercentage(mockBgData, 40, 50);
    expect(percentageIncluding40).toBe(0); // No readings this low in our mock data
  });
});
