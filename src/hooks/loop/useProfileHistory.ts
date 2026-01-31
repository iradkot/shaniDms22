/**
 * useProfileHistory Hook
 *
 * React hook for fetching and managing profile change history.
 * Provides loading state, error handling, and refresh capability.
 */

import {useCallback, useEffect, useState, useRef} from 'react';
import {
  ProfileChangeEvent,
  ProfileHistoryFilter,
  ProfileHistoryState,
} from 'app/types/loopAnalysis.types';
import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';

// =============================================================================
// HOOK OPTIONS
// =============================================================================

export interface UseProfileHistoryOptions {
  /** Filter criteria for the query. */
  filter?: ProfileHistoryFilter;
  /** Whether to fetch immediately on mount. Default: true. */
  fetchOnMount?: boolean;
  /** Polling interval in ms. Set to 0 to disable. Default: 0. */
  pollingInterval?: number;
}

// =============================================================================
// HOOK RETURN TYPE
// =============================================================================

export interface UseProfileHistoryReturn {
  /** Current loading/success/error state. */
  state: ProfileHistoryState;
  /** Convenience accessor for events (empty array if not loaded). */
  events: ProfileChangeEvent[];
  /** Whether currently loading. */
  isLoading: boolean;
  /** Error message if in error state. */
  error: string | null;
  /** Manually trigger a refresh. */
  refresh: () => Promise<void>;
  /** Reset to idle state. */
  reset: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook to fetch and manage profile change history.
 *
 * @param options - Configuration options
 * @returns Hook state and methods
 *
 * @example
 * ```tsx
 * function SettingsAuditScreen() {
 *   const {events, isLoading, error, refresh} = useProfileHistory({
 *     filter: {limit: 50},
 *   });
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error} />;
 *
 *   return (
 *     <FlatList
 *       data={events}
 *       renderItem={({item}) => <ProfileChangeCard event={item} />}
 *       onRefresh={refresh}
 *     />
 *   );
 * }
 * ```
 */
export function useProfileHistory(
  options: UseProfileHistoryOptions = {}
): UseProfileHistoryReturn {
  const {
    filter,
    fetchOnMount = true,
    pollingInterval = 0,
  } = options;

  const [state, setState] = useState<ProfileHistoryState>({status: 'idle'});
  const mountedRef = useRef(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Memoize filter to avoid unnecessary refetches
  const filterKey = JSON.stringify(filter);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    setState({status: 'loading'});

    try {
      const events = await fetchProfileChangeHistory(filter);

      if (!mountedRef.current) return;
      setState({status: 'success', events});
    } catch (err: unknown) {
      if (!mountedRef.current) return;

      const message =
        err instanceof Error ? err.message : 'Failed to load profile history';
      setState({status: 'error', error: message});
    }
  }, [filterKey]);

  const reset = useCallback(() => {
    setState({status: 'idle'});
  }, []);

  // Fetch on mount if enabled
  useEffect(() => {
    if (fetchOnMount) {
      fetchData();
    }
  }, [fetchOnMount, fetchData]);

  // Set up polling if enabled
  useEffect(() => {
    if (pollingInterval > 0) {
      pollingRef.current = setInterval(fetchData, pollingInterval);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pollingInterval, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    state,
    events: state.status === 'success' ? state.events : [],
    isLoading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    refresh: fetchData,
    reset,
  };
}
