import { InsulinDataEntry } from 'app/types/insulin.types';
import { BOLUS_HOVER_CONFIG, DETECTION_WINDOW_MS } from '../constants/bolusHoverConfig';

/**
 * Find the closest bolus event to a given timestamp
 * Similar to findClosestBgSample but for insulin data
 * @param x - timestamp as number (milliseconds)
 * @param bolusEvents - array of insulin data entries
 */
export const findClosestBolus = (
  x: number,
  bolusEvents: InsulinDataEntry[]
): InsulinDataEntry | null => {
  if (!bolusEvents || bolusEvents.length === 0) {
    return null;
  }

  // Filter for bolus events only
  const boluses = bolusEvents.filter(
    (event) => event.type === 'bolus' && event.timestamp && event.amount
  );

  if (boluses.length === 0) {
    return null;
  }

  let closestBolus = boluses[0];
  let minTimeDifference = Math.abs(
    new Date(closestBolus.timestamp!).getTime() - x
  );

  for (const bolus of boluses) {
    const bolusTime = new Date(bolus.timestamp!).getTime();
    const timeDifference = Math.abs(bolusTime - x);

    if (timeDifference < minTimeDifference) {
      minTimeDifference = timeDifference;
      closestBolus = bolus;
    }
  }

  // Only return if within reasonable proximity (e.g., within 30 minutes for better touch detection)
  const maxProximity = 30 * 60 * 1000; // 30 minutes in milliseconds (increased for better touch responsiveness)
  if (minTimeDifference <= maxProximity) {
    return closestBolus;
  }

  return null;
};

/**
 * Find all bolus events within a configurable time window around the touch point
 * This allows catching multiple bolus events in one tooltip when they're close together
 * @param touchX - touch X position in chart coordinates 
 * @param touchY - touch Y position in chart coordinates
 * @param touchTime - timestamp at touch position
 * @param bolusEvents - array of insulin data entries
 * @param xScale - D3 scale for X axis
 * @param yScale - D3 scale for Y axis
 * @returns array of bolus events within the detection window, sorted by time
 */
export const findBolusEventsInWindow = (
  touchX: number,
  touchY: number,
  touchTime: number,
  bolusEvents: InsulinDataEntry[],
  xScale: any,
  yScale: any
): InsulinDataEntry[] => {
  if (!bolusEvents || bolusEvents.length === 0) {
    return [];
  }

  // Filter for bolus events only
  const boluses = bolusEvents.filter(
    (event) => event.type === 'bolus' && event.timestamp && event.amount
  );

  if (boluses.length === 0) {
    return [];
  }

  const matchingBoluses: InsulinDataEntry[] = [];
  const spatialRadius = BOLUS_HOVER_CONFIG.SPATIAL_DETECTION_RADIUS;

  for (const bolus of boluses) {
    const bolusTime = new Date(bolus.timestamp!).getTime();
    const bolusX = xScale(new Date(bolusTime));
    const bolusY = yScale(50); // Fixed Y position where bolus markers are placed

    // Check both time window AND spatial proximity
    const timeDistance = Math.abs(bolusTime - touchTime);
    const pixelDistance = Math.sqrt(
      Math.pow(touchX - bolusX, 2) + Math.pow(touchY - bolusY, 2)
    );

    // FIXED: Use stricter logic - bolus must be within time window FIRST
    // Then we can be more lenient with spatial detection for events within that time window
    const withinTimeWindow = timeDistance <= DETECTION_WINDOW_MS;
    const withinSpatialRadius = pixelDistance <= spatialRadius;

    // Debug logging to understand what's happening
    console.log(`Bolus ${bolus.amount}U at ${new Date(bolus.timestamp!).toLocaleTimeString()}:`);
    console.log(`  Time distance: ${Math.round(timeDistance / 1000 / 60)} minutes`);
    console.log(`  Pixel distance: ${Math.round(pixelDistance)}px`);
    console.log(`  Within time window (${BOLUS_HOVER_CONFIG.DETECTION_WINDOW_MINUTES}min): ${withinTimeWindow}`);
    console.log(`  Within spatial radius (${spatialRadius}px): ${withinSpatialRadius}`);

    // Include bolus only if it's within the time window
    // Spatial proximity is secondary and should not override time constraints
    if (withinTimeWindow) {
      console.log(`  ✅ Added: within ${BOLUS_HOVER_CONFIG.DETECTION_WINDOW_MINUTES} minute window`);
      matchingBoluses.push(bolus);
    }
    // Alternative: if very close spatially, allow slightly longer time window
    else if (withinSpatialRadius && timeDistance <= (DETECTION_WINDOW_MS * 2)) {
      // Allow up to 2x the time window if very close spatially (for edge cases)
      console.log(`  ⚠️ Added: close spatially, within ${BOLUS_HOVER_CONFIG.DETECTION_WINDOW_MINUTES * 2} minute extended window`);
      matchingBoluses.push(bolus);
    } else {
      console.log(`  ❌ Excluded: too far in time and space`);
    }
  }

  // Sort by timestamp (oldest first)
  matchingBoluses.sort((a, b) => 
    new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
  );

  // Debug: Show final results
  if (matchingBoluses.length > 0) {
    console.log(`\n📊 Final result: Found ${matchingBoluses.length} bolus events:`);
    matchingBoluses.forEach((bolus, index) => {
      console.log(`  ${index + 1}. ${bolus.amount}U at ${new Date(bolus.timestamp!).toLocaleTimeString()}`);
    });
    if (matchingBoluses.length > 1) {
      const firstTime = new Date(matchingBoluses[0].timestamp!).getTime();
      const lastTime = new Date(matchingBoluses[matchingBoluses.length - 1].timestamp!).getTime();
      const spanMinutes = Math.round((lastTime - firstTime) / 1000 / 60);
      console.log(`  📏 Time span: ${spanMinutes} minutes`);
    }
    console.log('');
  }

  // Limit to max events to prevent tooltip overflow
  return matchingBoluses.slice(0, BOLUS_HOVER_CONFIG.MAX_BOLUS_EVENTS_IN_TOOLTIP);
};

/**
 * Find the closest bolus event considering both time and spatial proximity
 * This provides better hover detection by considering actual pixel distance
 * @param touchX - touch X position in chart coordinates 
 * @param touchY - touch Y position in chart coordinates
 * @param touchTime - timestamp at touch position
 * @param bolusEvents - array of insulin data entries
 * @param xScale - D3 scale for X axis
 * @param yScale - D3 scale for Y axis
 */
export const findClosestBolusWithSpatialProximity = (
  touchX: number,
  touchY: number,
  touchTime: number,
  bolusEvents: InsulinDataEntry[],
  xScale: any,
  yScale: any
): InsulinDataEntry | null => {
  const matchingBoluses = findBolusEventsInWindow(
    touchX, touchY, touchTime, bolusEvents, xScale, yScale
  );
  
  // Return the closest one by time if any found
  if (matchingBoluses.length === 0) return null;
  
  // Find the one closest to touch time
  let closest = matchingBoluses[0];
  let minTimeDiff = Math.abs(new Date(closest.timestamp!).getTime() - touchTime);
  
  for (const bolus of matchingBoluses) {
    const timeDiff = Math.abs(new Date(bolus.timestamp!).getTime() - touchTime);
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      closest = bolus;
    }
  }
  
  return closest;
};

/**
 * Format bolus type for display
 */
export const formatBolusType = (eventType?: string): string => {
  if (!eventType) return 'Bolus';
  
  switch (eventType.toLowerCase()) {
    case 'meal bolus':
      return 'Meal';
    case 'correction bolus':
      return 'Correction';
    case 'combo bolus':
      return 'Combo';
    default:
      return 'Bolus';
  }
};

/**
 * Calculate time since bolus for display
 */
export const getTimeSinceBolus = (bolusTimestamp: string): string => {
  const bolusTime = new Date(bolusTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - bolusTime.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  
  if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes % 60}m ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'just now';
  }
};
