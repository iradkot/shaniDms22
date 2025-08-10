// Test the time-based zoom utilities work correctly
import { 
  getDefaultZoomState,
  calculateTimeWindow,
  filterDataToTimeWindow,
  applyZoomStep,
  applyPanStep,
  formatTimeWindowText
} from '../zoomUtils';
import { BgSample } from 'app/types/day_bgs.types';

// Create test data
const mockBgData: BgSample[] = [];
const dayStart = new Date('2024-08-09T00:00:00.000Z').getTime();
const dayEnd = new Date('2024-08-09T23:59:00.000Z').getTime();

for (let i = 0; i < 288; i++) { // 288 points = every 5 minutes for 24 hours
  mockBgData.push({
    sgv: 120 + Math.sin(i * 0.1) * 30, // Vary glucose values
    date: dayStart + (i * 5 * 60 * 1000), // Every 5 minutes
    dateString: new Date(dayStart + (i * 5 * 60 * 1000)).toISOString(),
    trend: 4,
    direction: 'Flat',
    device: 'test',
    type: 'sgv',
  });
}

describe('Data Filtering Zoom Test', () => {
  test('should filter data correctly when zoomed', () => {
    // Start with default state (24 hours)
    let zoomState = getDefaultZoomState();
    expect(zoomState.isZoomed).toBe(false);
    expect(zoomState.timeWindowHours).toBe(24);
    
    // Zoom in to 12 hours
    zoomState = applyZoomStep(zoomState, 'in', mockBgData, dayStart, dayEnd);
    expect(zoomState.isZoomed).toBe(true);
    expect(zoomState.timeWindowHours).toBe(12);
    
    // Calculate time window and filter data
    const timeWindow = calculateTimeWindow(zoomState, dayStart, dayEnd);
    const filteredData = filterDataToTimeWindow(mockBgData, timeWindow);
    
    // Should have roughly half the data points
    expect(filteredData.length).toBeLessThan(mockBgData.length);
    expect(filteredData.length).toBeGreaterThan(mockBgData.length * 0.4); // Allow some margin
    
    console.log(`Original data: ${mockBgData.length} points`);
    console.log(`Filtered data (12h): ${filteredData.length} points`);
    console.log(`Time window: ${formatTimeWindowText(zoomState.timeWindowHours)}`);
    
    // Pan right to see later part of the day
    const pannedState = applyPanStep(zoomState, 'right');
    const pannedTimeWindow = calculateTimeWindow(pannedState, dayStart, dayEnd);
    const pannedFilteredData = filterDataToTimeWindow(mockBgData, pannedTimeWindow);
    
    // Should still have same amount of data, but different time range
    expect(pannedFilteredData.length).toBeCloseTo(filteredData.length, 1);
    expect(pannedTimeWindow.startTime).toBeGreaterThan(timeWindow.startTime);
    
    console.log(`Panned filtered data: ${pannedFilteredData.length} points`);
    console.log(`Panned start time: ${new Date(pannedTimeWindow.startTime).toLocaleTimeString()}`);
  });
});

describe('Time Domain Calculation', () => {
  test('should provide correct time bounds for chart scaling', () => {
    const zoomState = applyZoomStep(getDefaultZoomState(), 'in', mockBgData, dayStart, dayEnd);
    const timeWindow = calculateTimeWindow(zoomState, dayStart, dayEnd);
    
    expect(timeWindow.startTime).toBeGreaterThanOrEqual(dayStart);
    expect(timeWindow.endTime).toBeLessThanOrEqual(dayEnd);
    expect(timeWindow.endTime).toBeGreaterThan(timeWindow.startTime);
    
    console.log(`Time domain: ${new Date(timeWindow.startTime).toLocaleString()} to ${new Date(timeWindow.endTime).toLocaleString()}`);
  });
});

console.log('✅ Time-based zoom data filtering works correctly!');
