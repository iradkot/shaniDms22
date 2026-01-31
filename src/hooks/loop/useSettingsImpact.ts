/**
 * useSettingsImpact Hook
 *
 * React hook for analyzing the impact of a specific settings change.
 * Exposes the same logic used by the LLM tool for consistent results.
 */

import {useCallback, useState, useRef} from 'react';
import {
  ImpactAnalysisResult,
  ImpactAnalysisState,
  ProfileChangeEvent,
  ComparisonWindowOption,
} from 'app/types/loopAnalysis.types';
import {useProfileHistory} from './useProfileHistory';
import {
  analyzeSettingsImpact,
  validateAnalysisWindow,
} from 'app/services/loopAnalysis/impactAnalysisService';

// =============================================================================
// HOOK RETURN TYPE
// =============================================================================

export interface UseSettingsImpactReturn {
  /** Current loading/success/error state. */
  state: ImpactAnalysisState;
  /** Convenience accessor for result (null if not loaded). */
  result: ImpactAnalysisResult | null;
  /** Whether currently loading. */
  isLoading: boolean;
  /** Error message if in error state. */
  error: string | null;
  /** Trigger analysis for an event. Returns the result or throws. */
  analyze: (
    event: ProfileChangeEvent,
    windowDays?: ComparisonWindowOption
  ) => Promise<ImpactAnalysisResult>;
  /** Reset to idle state. */
  reset: () => void;
  /** Validate if analysis can be performed (without fetching data). */
  canAnalyze: (
    changeTimestamp: number,
    windowDays: ComparisonWindowOption
  ) => {isValid: boolean; warnings: string[]};
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook to analyze the impact of a specific settings change.
 *
 * @returns Hook state and methods
 *
 * @example
 * ```tsx
 * function ImpactDetailScreen({event}: {event: ProfileChangeEvent}) {
 *   const [windowDays, setWindowDays] = useState<ComparisonWindowOption>(7);
 *   const {result, isLoading, error, analyze} = useSettingsImpact();
 *
 *   useEffect(() => {
 *     analyze(event, windowDays);
 *   }, [event, windowDays]);
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error} />;
 *   if (!result) return null;
 *
 *   return (
 *     <View>
 *       <ImpactSummaryCard
 *         preChange={result.preChange}
 *         postChange={result.postChange}
 *         deltas={result.deltas}
 *       />
 *       <GhostChart
 *         preHourly={result.preHourlyAggregates}
 *         postHourly={result.postHourlyAggregates}
 *       />
 *     </View>
 *   );
 * }
 * ```
 */
export function useSettingsImpact(): UseSettingsImpactReturn {
  const [state, setState] = useState<ImpactAnalysisState>({status: 'idle'});
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (
      event: ProfileChangeEvent,
      windowDays: ComparisonWindowOption = 7
    ): Promise<ImpactAnalysisResult> => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      setState({status: 'loading'});

      try {
        // Validate first
        const validation = validateAnalysisWindow(event.timestamp, windowDays);
        if (!validation.isValid) {
          throw new Error(validation.warnings[0] || 'Cannot analyze this change.');
        }

        const result = await analyzeSettingsImpact({
          changeEvent: event,
          windowDays,
        });

        if (!mountedRef.current) {
          throw new Error('Component unmounted');
        }

        setState({status: 'success', result});
        return result;
      } catch (err: unknown) {
        if (!mountedRef.current) {
          throw err;
        }

        const message =
          err instanceof Error ? err.message : 'Analysis failed';
        setState({status: 'error', error: message});
        throw err;
      }
    },
    []
  );

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState({status: 'idle'});
  }, []);

  const canAnalyze = useCallback(
    (changeTimestamp: number, windowDays: ComparisonWindowOption) => {
      return validateAnalysisWindow(changeTimestamp, windowDays);
    },
    []
  );

  // Cleanup on unmount
  useState(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  });

  return {
    state,
    result: state.status === 'success' ? state.result : null,
    isLoading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    analyze,
    reset,
    canAnalyze,
  };
}

// =============================================================================
// COMBINED HOOK FOR CONVENIENCE
// =============================================================================

export interface UseLoopAnalysisOptions {
  /** Initial filter for profile history. */
  historyFilter?: {
    startMs?: number;
    endMs?: number;
    limit?: number;
  };
  /** Default comparison window. */
  defaultWindowDays?: ComparisonWindowOption;
}

/**
 * Combined hook for both profile history and impact analysis.
 * Useful for screens that need both capabilities.
 */
export function useLoopAnalysis(options: UseLoopAnalysisOptions = {}) {
  const history = useProfileHistory({filter: options.historyFilter});
  const impact = useSettingsImpact();

  const analyzeEvent = useCallback(
    async (event: ProfileChangeEvent, windowDays?: ComparisonWindowOption) => {
      return impact.analyze(event, windowDays ?? options.defaultWindowDays ?? 7);
    },
    [impact, options.defaultWindowDays]
  );

  return {
    // History
    events: history.events,
    isLoadingHistory: history.isLoading,
    historyError: history.error,
    refreshHistory: history.refresh,

    // Impact
    analysisResult: impact.result,
    isAnalyzing: impact.isLoading,
    analysisError: impact.error,
    analyzeEvent,
    resetAnalysis: impact.reset,
    canAnalyze: impact.canAnalyze,
  };
}
