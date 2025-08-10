import { findClosestBolus, formatBolusType, getTimeSinceBolus } from '../bolusUtils';
import { InsulinDataEntry } from 'app/types/insulin.types';

describe('bolusUtils', () => {
  const mockBolusEvents: InsulinDataEntry[] = [
    {
      type: 'bolus',
      amount: 5.0,
      timestamp: '2025-08-09T12:00:00.000Z'
    },
    {
      type: 'bolus', 
      amount: 2.5,
      timestamp: '2025-08-09T14:30:00.000Z'
    },
    {
      type: 'tempBasal',
      rate: 1.2,
      duration: 60,
      timestamp: '2025-08-09T13:00:00.000Z'
    }
  ];

  describe('findClosestBolus', () => {
    it('should find the closest bolus to a target time', () => {
      const targetTime = new Date('2025-08-09T12:15:00.000Z').getTime();
      const result = findClosestBolus(targetTime, mockBolusEvents);
      
      expect(result).toBeTruthy();
      expect(result?.amount).toBe(5.0);
      expect(result?.timestamp).toBe('2025-08-09T12:00:00.000Z');
    });

    it('should return null if no bolus events are close enough', () => {
      const targetTime = new Date('2025-08-09T10:00:00.000Z').getTime(); // 2 hours before first bolus
      const result = findClosestBolus(targetTime, mockBolusEvents);
      
      expect(result).toBeNull();
    });

    it('should ignore non-bolus events', () => {
      const targetTime = new Date('2025-08-09T13:00:00.000Z').getTime();
      const result = findClosestBolus(targetTime, mockBolusEvents);
      
      expect(result).toBeTruthy();
      expect(result?.type).toBe('bolus');
      expect(result?.amount).toBe(5.0); // Should be the 12:00 bolus, not the 13:00 temp basal
    });
  });

  describe('formatBolusType', () => {
    it('should format various bolus types correctly', () => {
      expect(formatBolusType('Meal Bolus')).toBe('Meal');
      expect(formatBolusType('Correction Bolus')).toBe('Correction');
      expect(formatBolusType('Combo Bolus')).toBe('Combo');
      expect(formatBolusType('Bolus')).toBe('Bolus');
      expect(formatBolusType(undefined)).toBe('Bolus');
    });
  });

  describe('getTimeSinceBolus', () => {
    beforeAll(() => {
      // Mock current time to be 2025-08-09T15:00:00.000Z
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-08-09T15:00:00.000Z'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should format time differences correctly', () => {
      // 3 hours ago
      expect(getTimeSinceBolus('2025-08-09T12:00:00.000Z')).toBe('3h 0m ago');
      
      // 30 minutes ago  
      expect(getTimeSinceBolus('2025-08-09T14:30:00.000Z')).toBe('30m ago');
      
      // Just now (less than 1 minute)
      expect(getTimeSinceBolus('2025-08-09T14:59:30.000Z')).toBe('just now');
    });
  });
});
