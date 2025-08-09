import { calculateCustomRangePercentage } from '../CustomGlucoseRangeSlider';
import { 
  validateGlucoseRange, 
  getGlucoseValueOptions,
  getGlucoseRangeInterpretation,
  GLUCOSE_RANGE_PRESETS 
} from '../utils';
import { BgSample } from 'app/types/day_bgs.types';

// Mock blood glucose data for testing
const mockBgData: BgSample[] = [
  { sgv: 60, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 80, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 100, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 120, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 140, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 180, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 200, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 250, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 300, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
  { sgv: 90, date: Date.now(), dateString: '', trend: 0, direction: 'Flat', device: 'test', type: 'sgv' },
];

describe('CustomGlucoseRangeSlider', () => {
  describe('calculateCustomRangePercentage', () => {
    it('should calculate correct percentage for standard range (70-140)', () => {
      const result = calculateCustomRangePercentage(mockBgData, 70, 140);
      // Values in range: 80, 100, 120, 140, 90 = 5 out of 10 = 50%
      expect(result).toBe(50);
    });

    it('should calculate correct percentage for tight range (80-120)', () => {
      const result = calculateCustomRangePercentage(mockBgData, 80, 120);
      // Values in range: 80, 100, 120, 90 = 4 out of 10 = 40%
      expect(result).toBe(40);
    });

    it('should return 0 for empty data', () => {
      const result = calculateCustomRangePercentage([], 70, 140);
      expect(result).toBe(0);
    });

    it('should handle edge cases correctly', () => {
      const result = calculateCustomRangePercentage(mockBgData, 300, 400);
      // Values in range: 300 = 1 out of 10 = 10%
      expect(result).toBe(10);
    });
  });

  describe('validateGlucoseRange', () => {
    it('should validate correct ranges', () => {
      const result = validateGlucoseRange(70, 140);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid ranges where min >= max', () => {
      const result = validateGlucoseRange(140, 70);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('Minimum value must be less than maximum value');
    });

    it('should reject dangerously low values', () => {
      const result = validateGlucoseRange(20, 100);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('dangerously low');
    });

    it('should reject extremely high values', () => {
      const result = validateGlucoseRange(100, 600);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('extremely high');
    });

    it('should reject ranges that are too narrow', () => {
      const result = validateGlucoseRange(100, 110);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('too narrow');
    });
  });

  describe('getGlucoseValueOptions', () => {
    it('should return appropriate values within limits', () => {
      const values = getGlucoseValueOptions(50, 200);
      expect(values).toContain(50);
      expect(values).toContain(70);
      expect(values).toContain(140);
      expect(values).toContain(200);
      expect(values[0]).toBeGreaterThanOrEqual(50);
      expect(values[values.length - 1]).toBeLessThanOrEqual(200);
    });

    it('should return sorted values', () => {
      const values = getGlucoseValueOptions(50, 300);
      const sortedValues = [...values].sort((a, b) => a - b);
      expect(values).toEqual(sortedValues);
    });
  });

  describe('getGlucoseRangeInterpretation', () => {
    it('should identify target range correctly', () => {
      const interpretation = getGlucoseRangeInterpretation(70, 140);
      expect(interpretation).toContain('Target range');
    });

    it('should identify hypoglycemia range', () => {
      const interpretation = getGlucoseRangeInterpretation(50, 65);
      expect(interpretation).toContain('hypoglycemia');
    });

    it('should identify hyperglycemia range', () => {
      const interpretation = getGlucoseRangeInterpretation(200, 250);
      expect(interpretation).toContain('hyperglycemia');
    });
  });

  describe('GLUCOSE_RANGE_PRESETS', () => {
    it('should contain standard presets', () => {
      expect(GLUCOSE_RANGE_PRESETS.STANDARD).toBeDefined();
      expect(GLUCOSE_RANGE_PRESETS.TIGHT).toBeDefined();
      expect(GLUCOSE_RANGE_PRESETS.HYPOGLYCEMIA).toBeDefined();
      expect(GLUCOSE_RANGE_PRESETS.HYPERGLYCEMIA).toBeDefined();
    });

    it('should have valid ranges in all presets', () => {
      Object.values(GLUCOSE_RANGE_PRESETS).forEach(preset => {
        expect(preset.min).toBeLessThan(preset.max);
        expect(preset.label).toBeTruthy();
        expect(typeof preset.min).toBe('number');
        expect(typeof preset.max).toBe('number');
      });
    });
  });
});
