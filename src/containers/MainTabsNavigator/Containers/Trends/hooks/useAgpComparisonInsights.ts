import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

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
import {buildLoopModeSummary} from 'app/services/aiAnalyst/loopModeSummaryTool';
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
  const inputSignature = useMemo(
    () =>
      [
        params.currentDateRange.start.getTime(),
        params.currentDateRange.end.getTime(),
        params.comparisonDateRange?.start.getTime() ?? 0,
        params.comparisonDateRange?.end.getTime() ?? 0,
        params.currentBgData.length,
        params.currentBgData[0]?.date ?? 0,
        params.currentBgData[params.currentBgData.length - 1]?.date ?? 0,
        params.previousBgData.length,
        params.previousBgData[0]?.date ?? 0,
        params.previousBgData[params.previousBgData.length - 1]?.date ?? 0,
      ].join('|'),
    [
      params.comparisonDateRange,
      params.currentBgData,
      params.currentDateRange,
      params.previousBgData,
    ],
  );
  const lastInputSignatureRef = useRef(inputSignature);

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

  useEffect(() => {
    if (lastInputSignatureRef.current === inputSignature) {
      return;
    }
    lastInputSignatureRef.current = inputSignature;
    runSeqRef.current += 1;
    setState({status: 'idle', result: null, error: null, progress: ''});
  }, [inputSignature]);

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
          prev.status === 'loading'
            ? {...prev, progress: localizeProgress(progress)}
            : prev,
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
        currentLoopMode,
        previousLoopMode,
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
          params.currentDateRange.end.toISOString(),
        ).catch(() => null),
        getUserProfileFromNightscout(
          params.comparisonDateRange.end.toISOString(),
        ).catch(() => null),
        buildLoopModeSummary({
          start: params.currentDateRange.start,
          end: params.currentDateRange.end,
          bgData: params.currentBgData,
        }).catch(() => null),
        buildLoopModeSummary({
          start: params.comparisonDateRange.start,
          end: params.comparisonDateRange.end,
          bgData: params.previousBgData,
        }).catch(() => null),
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
        currentLoopMode,
        previousLoopMode,
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

function localizeProgress(progress: string) {
  const labels: Record<string, string> = {
    'Analyzing AGP pattern': 'מנתח את צורת ה-AGP...',
    'Checking meals': 'בודק ארוחות ותזמון בולוס...',
    'Checking corrections': 'בודק תיקונים ורגישות לאינסולין...',
    'Checking Loop context': 'בודק הקשר לופ פתוח/סגור...',
    'Comparing settings': 'משווה בין התכניות...',
    'Writing final analysis': 'מסכם תובנות...',
  };
  return labels[progress] ?? progress;
}
