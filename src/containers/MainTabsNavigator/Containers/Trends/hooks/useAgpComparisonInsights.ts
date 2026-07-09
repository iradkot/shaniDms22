import {useCallback, useMemo, useRef, useState} from 'react';

import {
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {
  AgpComparisonAnalysisResult,
  buildAgpComparisonEvidence,
  runAgpComparisonOrchestra,
} from 'app/services/agpComparisonIntelligence';
import {BgSample} from 'app/types/day_bgs.types';

type InsightState =
  | {status: 'idle'; result: null; error: null; progress: string}
  | {status: 'loading'; result: null; error: null; progress: string}
  | {
      status: 'success';
      result: AgpComparisonAnalysisResult;
      error: null;
      progress: string;
    }
  | {status: 'error'; result: null; error: string; progress: string};

export function useAgpComparisonInsights(params: {
  currentDateRange: {start: Date; end: Date};
  comparisonDateRange: {start: Date; end: Date} | null;
  currentBgData: BgSample[];
  previousBgData: BgSample[];
}) {
  const {settings: aiSettings} = useAiSettings();
  const [state, setState] = useState<InsightState>({
    status: 'idle',
    result: null,
    error: null,
    progress: '',
  });
  const runSeqRef = useRef(0);

  const provider = useMemo(() => {
    if (!aiSettings.enabled || !(aiSettings.apiKey ?? '').trim()) {
      return null;
    }
    try {
      return createLlmProvider(aiSettings);
    } catch {
      return null;
    }
  }, [aiSettings]);

  const run = useCallback(async () => {
    if (!params.comparisonDateRange) {
      return;
    }
    const runId = ++runSeqRef.current;
    setState({
      status: 'loading',
      result: null,
      error: null,
      progress: 'בונה בסיס נתונים להשוואה...',
    });

    const updateProgress = (progress: string) => {
      if (runSeqRef.current === runId) {
        setState(prev =>
          prev.status === 'loading' ? {...prev, progress} : prev,
        );
      }
    };

    try {
      updateProgress('טוען ארוחות, תיקונים ותכניות...');
      const [
        currentTreatments,
        previousTreatments,
        currentProfile,
        previousProfile,
      ] = await Promise.all([
        fetchTreatmentsForDateRangeUncached(
          params.currentDateRange.start,
          params.currentDateRange.end,
        ),
        fetchTreatmentsForDateRangeUncached(
          params.comparisonDateRange.start,
          params.comparisonDateRange.end,
        ),
        getUserProfileFromNightscout(
          params.currentDateRange.start.toISOString(),
        ).catch(() => null),
        getUserProfileFromNightscout(
          params.comparisonDateRange.start.toISOString(),
        ).catch(() => null),
      ]);

      updateProgress('מחשב ראיות לפי חלונות AGP...');
      const evidence = buildAgpComparisonEvidence({
        currentRange: params.currentDateRange,
        previousRange: params.comparisonDateRange,
        currentBgData: params.currentBgData,
        previousBgData: params.previousBgData,
        currentTreatments,
        previousTreatments,
        currentProfile,
        previousProfile,
      });

      const result = await runAgpComparisonOrchestra({
        evidence,
        provider,
        model: aiSettings.openAiModel,
        onProgress: updateProgress,
      });

      if (runSeqRef.current !== runId) {
        return;
      }
      setState({
        status: 'success',
        result,
        error: null,
        progress: '',
      });
    } catch (error: any) {
      if (runSeqRef.current !== runId) {
        return;
      }
      setState({
        status: 'error',
        result: null,
        error: error?.message ? String(error.message) : 'Analysis failed',
        progress: '',
      });
    }
  }, [
    aiSettings.openAiModel,
    params.comparisonDateRange,
    params.currentBgData,
    params.currentDateRange,
    params.previousBgData,
    provider,
  ]);

  const reset = useCallback(() => {
    runSeqRef.current += 1;
    setState({status: 'idle', result: null, error: null, progress: ''});
  }, []);

  return {
    ...state,
    canRun:
      Boolean(params.comparisonDateRange) &&
      params.currentBgData.length > 0 &&
      params.previousBgData.length > 0,
    run,
    reset,
  };
}
