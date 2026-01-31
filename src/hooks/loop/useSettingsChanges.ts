/**
 * useSettingsChanges Hook
 *
 * React hook for fetching settings changes with infinite scroll support.
 * Fetches at least 20 events initially, and loads more on demand.
 * Supports filtering by change type (CR, ISF, Targets, Basal, etc.).
 */

import {useCallback, useState, useRef, useEffect, useMemo} from 'react';
import {
  SettingsChangeEvent,
  SettingsChangeType,
  detectSettingsChanges,
  hasMoreSettingsChanges,
} from 'app/services/loopAnalysis/settingsChangeDetection';

// =============================================================================
// TYPES
// =============================================================================

/** Filter options for change types */
export type ChangeTypeFilter = 'all' | 'carb_ratio' | 'isf' | 'targets' | 'basal' | 'dia';

export interface UseSettingsChangesOptions {
  /** Filter by change type */
  typeFilter?: ChangeTypeFilter;
}

export interface UseSettingsChangesReturn {
  /** List of detected settings changes (filtered) */
  events: SettingsChangeEvent[];
  /** All events (unfiltered) - for stats */
  allEvents: SettingsChangeEvent[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more events */
  isLoadingMore: boolean;
  /** Whether there are more events to load */
  hasMore: boolean;
  /** Error message if any */
  error: string | null;
  /** Load more events (for infinite scroll) */
  loadMore: () => Promise<void>;
  /** Refresh from the beginning */
  refresh: () => Promise<void>;
}

/**
 * Check if an event matches the type filter
 */
function eventMatchesFilter(event: SettingsChangeEvent, filter: ChangeTypeFilter): boolean {
  if (filter === 'all') return true;
  
  if (filter === 'targets') {
    // Targets filter matches both target_low and target_high
    return event.changeTypes.some(t => t === 'target_low' || t === 'target_high');
  }
  
  return event.changeTypes.includes(filter as SettingsChangeType);
}

// =============================================================================
// HOOK
// =============================================================================

export function useSettingsChanges(
  options?: UseSettingsChangesOptions,
): UseSettingsChangesReturn {
  const typeFilter = options?.typeFilter ?? 'all';
  
  const [allEvents, setAllEvents] = useState<SettingsChangeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  // Filter events by type (client-side for responsiveness)
  const events = useMemo(() => {
    return allEvents.filter(e => eventMatchesFilter(e, typeFilter));
  }, [allEvents, typeFilter]);

  const loadInitial = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const initialEvents = await detectSettingsChanges({
        minEvents: 20,
      });

      if (!mountedRef.current) return;

      setAllEvents(initialEvents);

      // Check if there are more
      if (initialEvents.length > 0) {
        const lastTimestamp = initialEvents[initialEvents.length - 1].timestamp;
        const more = await hasMoreSettingsChanges(lastTimestamp);
        if (mountedRef.current) {
          setHasMore(more);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load settings changes');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    loadInitial();

    return () => {
      mountedRef.current = false;
    };
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || allEvents.length === 0) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const lastTimestamp = allEvents[allEvents.length - 1].timestamp;
      const moreEvents = await detectSettingsChanges({
        minEvents: 20,
        beforeTimestamp: lastTimestamp,
      });

      if (!mountedRef.current) return;

      if (moreEvents.length > 0) {
        // Filter out any duplicates
        const existingIds = new Set(allEvents.map(e => e.id));
        const newEvents = moreEvents.filter(e => !existingIds.has(e.id));

        setAllEvents(prev => [...prev, ...newEvents]);

        // Check for more
        const lastNewTimestamp = moreEvents[moreEvents.length - 1].timestamp;
        const more = await hasMoreSettingsChanges(lastNewTimestamp);
        if (mountedRef.current) {
          setHasMore(more);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load more');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingMore(false);
      }
      loadingRef.current = false;
    }
  }, [allEvents, hasMore]);

  const refresh = useCallback(async () => {
    setAllEvents([]);
    setHasMore(true);
    await loadInitial();
  }, [loadInitial]);

  return {
    events,
    allEvents,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
