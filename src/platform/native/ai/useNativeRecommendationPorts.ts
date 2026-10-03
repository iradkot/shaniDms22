import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSyncExternalStore} from 'react';
import {
  getNightscoutConfigurationRevision,
  subscribeNightscoutConfiguration,
} from '../../../api/shaniNightscoutInstances';
import {useAiSettings} from '../../../contexts/AiSettingsContext';
import {decodeAiConversationHistory} from '../../../modules/ai';
import type {RecommendationRuntimePorts} from '../../../product/ai/useRecommendationRuntime';
import {recommendationRangeDays} from '../../../services/aiRecommendations/recommendationOrchestrator';
import {recommendationEvidenceRange} from '../../../services/aiRecommendations/recommendationEvidenceRange';
import {loadNativeRecordedTreatmentSummary} from '../../../services/aiRecommendations/nativeEvidence';
import type {AiWorkspaceScope} from '../../../services/aiMemory/aiWorkspaceScope';
import {aiWorkspaceStorageKey} from '../../../services/aiMemory/aiWorkspaceScope';
import {loadAiAnalystHistory} from '../../../services/aiAnalyst/aiAnalystHistory';
import {createLlmProvider} from '../../../services/llm/llmClient';
import {buildNativeRecommendationEvidence} from './nativeRecommendationEvidence';
import {nativeCurrentDataSource} from '../../../services/currentData/nativeCurrentDataSource';

// Keep the existing native data graph behind its established runtime boundary.
const localTools =
  require('../../../services/aiAnalyst/aiAnalystLocalTools') as {
    runAiAnalystTool(
      scope: AiWorkspaceScope,
      name: string,
      args: Record<string, unknown>,
    ): Promise<
      {ok: true; result: Record<string, unknown>} | {ok: false; error: string}
    >;
  };

export function useNativeRecommendationPorts(
  workspace: AiWorkspaceScope | null,
  locale: 'he' | 'en',
): RecommendationRuntimePorts {
  const {settings} = useAiSettings();
  const configurationRevision = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutConfigurationRevision,
    getNightscoutConfigurationRevision,
  );
  const assertCurrentSource = () => {
    if (configurationRevision !== getNightscoutConfigurationRevision()) {
      throw new Error('Nightscout source changed during recommendation.');
    }
  };
  return {
    locale,
    scopeId: workspace
      ? aiWorkspaceStorageKey('recommendations', workspace)
      : null,
    storage: AsyncStorage,
    chat: async (messages, signal) => {
      assertCurrentSource();
      if (!workspace || !settings.enabled) {
        throw new Error('AI unavailable');
      }
      const result = await createLlmProvider(settings).sendChat({
        model: settings.openAiModel,
        messages: [...messages],
        maxOutputTokens: 2500,
        abortSignal: signal,
      });
      assertCurrentSource();
      if (!result.content.trim()) {
        throw new Error('Empty recommendation');
      }
      return result.content;
    },
    loadLegacyHistory: async () =>
      workspace
        ? decodeAiConversationHistory(await loadAiAnalystHistory(workspace))
        : [],
    loadEvidence: async (input, signal) => {
      assertCurrentSource();
      if (!workspace || signal.aborted) {
        throw new Error('Workspace unavailable');
      }
      const days = recommendationRangeDays(input.request);
      const period = recommendationEvidenceRange(input, Date.now());
      const {startMs: start, endMs: end} = period;
      const results = await Promise.all([
        nativeCurrentDataSource.loadCurrent({signal}),
        localTools.runAiAnalystTool(workspace, 'getGlucoseStats', {
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
        }),
        period.explicitPeriod
          ? loadNativeRecordedTreatmentSummary(start, end)
          : localTools.runAiAnalystTool(workspace, 'getInsulinSummary', {
              rangeDays: days,
            }),
      ]);
      assertCurrentSource();
      if (signal.aborted) {
        throw new Error('Cancelled');
      }
      const [current, stats, insulin] = results;
      const evidence = buildNativeRecommendationEvidence({
        current,
        stats,
        insulin,
        startMs: start,
        endMs: end,
        observedAtMs: Date.now(),
        days: period.days,
      });
      return {
        ...(evidence.currentFactsExpireAtMs === undefined
          ? {}
          : {currentFactsExpireAtMs: evidence.currentFactsExpireAtMs}),
        text: `${
          locale === 'he'
            ? 'נתונים ששימשו להמלצה'
            : 'Evidence used for this recommendation'
        }\n${JSON.stringify(evidence, null, 2)}`,
      };
    },
  };
}
