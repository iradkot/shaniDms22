/**
 * Profile History Service
 *
 * Fetches and normalizes profile change events from Nightscout.
 * Supports DIY Loop (iOS), AndroidAPS, and OpenAPS.
 */

import {fetchTreatmentsForDateRangeUncached} from 'app/api/apiRequests';
import {
  ProfileChangeEvent,
  ProfileHistoryFilter,
} from 'app/types/loopAnalysis.types';
import {parseProfileChangesFromTreatments} from './profileParsing.utils';

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 180;
const MAX_EVENTS = 100;

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Fetches profile change history from Nightscout.
 *
 * @param filter - Optional filter criteria
 * @returns Array of ProfileChangeEvent objects, sorted by timestamp descending
 *
 * @example
 * ```typescript
 * // Fetch last 90 days of changes
 * const events = await fetchProfileChangeHistory({
 *   startMs: Date.now() - 90 * 24 * 60 * 60 * 1000,
 *   limit: 50,
 * });
 * ```
 */
export async function fetchProfileChangeHistory(
  filter?: ProfileHistoryFilter
): Promise<ProfileChangeEvent[]> {
  const endMs = filter?.endMs ?? Date.now();
  const startMs = filter?.startMs ?? endMs - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY;
  const limit = filter?.limit ?? MAX_EVENTS;

  // Fetch all treatments for the date range
  const treatments = await fetchTreatmentsForDateRangeUncached(
    new Date(startMs),
    new Date(endMs)
  );

  // Parse into ProfileChangeEvents
  let events = parseProfileChangesFromTreatments(treatments);

  // Apply source filter
  if (filter?.source) {
    events = events.filter(e => e.source === filter.source);
  }

  // Exclude temporary profiles if requested
  if (filter?.excludeTemporary) {
    events = events.filter(e => !e.durationMinutes || e.durationMinutes === 0);
  }

  // Apply limit
  return events.slice(0, limit);
}

/**
 * Finds the nearest profile change event to a given timestamp.
 * Useful for LLM tool integration where user specifies approximate date.
 *
 * @param targetTimestamp - Target timestamp (ms)
 * @param maxDistanceMs - Maximum distance to search (default: 24 hours)
 * @returns The nearest ProfileChangeEvent or null if none found
 */
export async function findNearestProfileChange(
  targetTimestamp: number,
  maxDistanceMs: number = MS_PER_DAY
): Promise<ProfileChangeEvent | null> {
  const events = await fetchProfileChangeHistory({
    startMs: targetTimestamp - maxDistanceMs,
    endMs: targetTimestamp + maxDistanceMs,
    limit: 10,
  });

  if (events.length === 0) return null;

  // Find the event closest to target timestamp
  let nearest: ProfileChangeEvent | null = null;
  let minDistance = Infinity;

  for (const event of events) {
    const distance = Math.abs(event.timestamp - targetTimestamp);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = event;
    }
  }

  return nearest;
}

/**
 * Counts profile changes within a date range.
 * Useful for validating analysis windows (e.g., warning if multiple changes).
 *
 * @param startMs - Start of range (ms)
 * @param endMs - End of range (ms)
 * @returns Number of profile changes in the range
 */
export async function countProfileChangesInRange(
  startMs: number,
  endMs: number
): Promise<number> {
  const events = await fetchProfileChangeHistory({
    startMs,
    endMs,
    limit: 100,
  });

  return events.length;
}
