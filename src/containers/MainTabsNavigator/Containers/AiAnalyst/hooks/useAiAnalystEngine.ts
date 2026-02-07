import {useCallback, useMemo, useRef, useState} from 'react';
import {Alert, Keyboard, ScrollView, Share} from 'react-native';
import {useTheme} from 'styled-components/native';
import {useNavigation} from '@react-navigation/native';

import {ThemeType} from 'app/types/theme';
import * as SCREEN_NAMES from 'app/constants/SCREEN_NAMES';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';

import {AI_ANALYST_SYSTEM_PROMPT} from 'app/services/llm/systemPrompts';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {
  AiAnalystDataUsedItem,
  buildAiAnalystExportJson,
  buildAiAnalystExportMarkdown,
  buildAiAnalystExportPayload,
} from 'app/services/aiAnalyst/aiAnalystExport';
import {
  clearAiAnalystHistory,
  deleteAiAnalystConversation,
  loadAiAnalystHistory,
  upsertAiAnalystConversationSnapshot,
} from 'app/services/aiAnalyst/aiAnalystHistory';

import {ScreenState, AnalystMode, AiAnalystEngine} from '../types';
import {
  DISCLOSURE_TEXT,
  HYPO_DETECTIVE_RANGE_DAYS,
  HYPO_DETECTIVE_MAX_EVENTS,
  USER_BEHAVIOR_RANGE_DAYS,
  USER_BEHAVIOR_MAX_SAMPLES,
  DEFAULT_MAX_TOOL_CALLS,
  LOOP_SETTINGS_MAX_TOOL_CALLS,
  TOOL_TIMEOUT_MS,
  STOPPED_LABEL_DURATION_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  USER_BEHAVIOR_MAX_OUTPUT_TOKENS,
  LOOP_SETTINGS_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  USER_BEHAVIOR_TEMPERATURE,
  LOOP_SETTINGS_TEMPERATURE,
  SCROLL_DELAY_MS,
  MAX_EVENTS_WITH_DATES,
  MAX_EVENTS_DEFAULT,
  EMPTY_RESPONSE_FALLBACK,
  makeConversationId,
  temperatureForModel,
  maxOutputTokensForModel,
} from '../constants';
import {
  parseRangeDaysFromText,
  looksLikeHyperQuestion,
  looksLikeHypoQuestion,
  wantsCountWithDates,
  stripFillerSuffix,
} from '../helpers/textParsing';
import {DEFAULT_TOOL_SYSTEM_PROMPT, buildSystemPrompt} from '../llm/prompts';
import {runLlmToolLoop, withTimeout} from '../llm';
import {
  createMarkdownItInstance,
  createSelectableMarkdownRules,
  createMarkdownStyle,
} from '../helpers/markdownConfig';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAiAnalystEngine(): AiAnalystEngine {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation<any>();
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const hasKey = (aiSettings.apiKey ?? '').trim().length > 0;

  // ── Screen routing ──────────────────────────────────────────────────────
  const [state, setState] = useState<ScreenState>(() =>
    hasKey ? {mode: 'dashboard'} : {mode: 'locked'},
  );

  // Keep screen mode in sync with key presence.
  if (state.mode === 'locked' && hasKey) {
    setTimeout(() => setState({mode: 'dashboard'}), 0);
  }
  if (state.mode !== 'locked' && !hasKey) {
    setTimeout(() => setState({mode: 'locked'}), 0);
  }

  // ── Chat state ──────────────────────────────────────────────────────────
  const [uiMessages, setUiMessages] = useState<LlmChatMessage[]>([]);
  const [llmMessages, setLlmMessages] = useState<LlmChatMessage[]>([]);
  const [sessionDataUsed, setSessionDataUsed] = useState<AiAnalystDataUsedItem[]>([]);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);

  // ── Cancellation ────────────────────────────────────────────────────────
  const runSeqRef = useRef(0);
  const abortRef = useRef<any>(null);

  const beginRun = useCallback((label: string) => {
    runSeqRef.current += 1;
    const runId = runSeqRef.current;
    try { abortRef.current?.abort?.(); } catch {}
    abortRef.current = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setProgressText(label);
    return {runId, signal: abortRef.current?.signal};
  }, []);

  const cancelActiveRun = useCallback(() => {
    runSeqRef.current += 1;
    try { abortRef.current?.abort?.(); } catch {}
    abortRef.current = null;
    setIsBusy(false);
    setErrorText(null);
    setProgressText('Stopped');
    setTimeout(() => setProgressText(''), STOPPED_LABEL_DURATION_MS);
  }, []);

  // ── Conversation / history ──────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [analystMode, setAnalystMode] = useState<AnalystMode | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  // ── Markdown config (memoised) ──────────────────────────────────────────
  const markdownItInstance = useMemo(() => createMarkdownItInstance(), []);
  const selectableMarkdownRules = useMemo(() => createSelectableMarkdownRules(), []);
  const markdownStyle = useMemo(() => createMarkdownStyle(theme), [theme]);

  // ── LLM provider ───────────────────────────────────────────────────────
  const provider = useMemo(() => {
    try { return createLlmProvider(aiSettings); }
    catch { return null; }
  }, [aiSettings]);

  // ====================================================================
  // Navigation & persistence helpers
  // ====================================================================

  const openSettings = useCallback(() => {
    navigation.navigate(SCREEN_NAMES.SETTINGS_TAB_SCREEN);
  }, [navigation]);

  const refreshHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const items = await loadAiAnalystHistory();
      setHistoryItems(items);
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const persistHistorySnapshot = useCallback(
    async (nextMessages: LlmChatMessage[]) => {
      if (!conversationId) return;
      const mission = state.mode === 'mission' ? state.mission : undefined;
      await upsertAiAnalystConversationSnapshot({
        id: conversationId,
        mission,
        messages: (nextMessages ?? [])
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content})),
      });
    },
    [conversationId, state],
  );

  const recordDataUsed = useCallback((name: string, toolResult: any) => {
    if (!toolResult || toolResult.ok !== true) return;
    setSessionDataUsed(prev => [
      ...prev,
      {name, atIso: new Date().toISOString(), result: toolResult.result},
    ]);
  }, []);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), SCROLL_DELAY_MS);
  }, []);

  // ====================================================================
  // Shared mission initialisation
  // ====================================================================

  const initMission = useCallback(
    (label: string, mode: AnalystMode | null) => {
      setErrorText(null);
      setIsBusy(true);
      const run = beginRun(label);
      setUiMessages([]);
      setLlmMessages([]);
      setSessionDataUsed([]);
      setInput('');
      setAnalystMode(mode);
      const nextId = makeConversationId();
      setConversationId(nextId);
      return {...run, conversationId: nextId};
    },
    [beginRun],
  );

  const handleMissionError = useCallback(
    (error: any, runId: number, fallbackMessage: string) => {
      if (runSeqRef.current !== runId) return;
      const msg =
        error?.name === 'AbortError'
          ? 'Stopped'
          : error?.message
            ? String(error.message)
            : fallbackMessage;
      if (msg !== 'Stopped') setErrorText(msg);
    },
    [],
  );

  const finaliseMission = useCallback((runId: number) => {
    if (runSeqRef.current === runId) {
      setIsBusy(false);
      setProgressText('');
    }
  }, []);

  // ====================================================================
  // Export
  // ====================================================================

  const exportSession = useCallback(async () => {
    const mission = state.mode === 'mission' ? state.mission : null;
    const payload = buildAiAnalystExportPayload({
      conversationId,
      mission,
      messages: uiMessages,
      dataUsed: sessionDataUsed,
    });

    Alert.alert(
      'Export',
      'Share a summary of this discussion (and the diabetes data used).',
      [
        {
          text: 'Share Summary',
          onPress: async () => {
            const md = buildAiAnalystExportMarkdown(payload);
            await Share.share({title: 'AI Analyst Summary', message: md});
          },
        },
        {
          text: 'Share Data (JSON)',
          onPress: async () => {
            const json = buildAiAnalystExportJson(payload);
            await Share.share({title: 'AI Analyst Export (JSON)', message: json});
          },
        },
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  }, [conversationId, sessionDataUsed, state, uiMessages]);

  // ====================================================================
  // Mission starters
  // ====================================================================

  const startHypoDetective = useCallback(async () => {
    if (!provider) return;
    const {runId, signal, conversationId: nextId} = initMission('Starting…', null);

    try {
      const {contextJson} = await buildHypoDetectiveContext({
        rangeDays: HYPO_DETECTIVE_RANGE_DAYS,
        lowThreshold: glucoseSettings.severeHypo,
        maxEvents: HYPO_DETECTIVE_MAX_EVENTS,
        onProgress: s => setProgressText(s),
      });
      if (runSeqRef.current !== runId) return;

      setProgressText('Asking AI Analyst…');

      const userPrompt =
        `Mission: Hypo Detective\n\n` +
        `User question: Analyze my recent severe hypos and identify common patterns.\n\n` +
        `Disclosure: ${DISCLOSURE_TEXT}\n\n` +
        `Data (JSON):\n${JSON.stringify(contextJson)}`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const {finalText, llmMessages: updatedMessages} = await runLlmToolLoop({
        provider,
        model: aiSettings.openAiModel,
        systemPrompt: AI_ANALYST_SYSTEM_PROMPT + '\n' + DEFAULT_TOOL_SYSTEM_PROMPT,
        initialMessages: baseLlmMessages,
        maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, DEFAULT_MAX_OUTPUT_TOKENS),
        temperature: temperatureForModel(aiSettings.openAiModel, DEFAULT_TEMPERATURE),
        abortSignal: signal,
        callbacks: {
          onToolStart: name => setProgressText(`Running ${name}…`),
          isCancelled: () => runSeqRef.current !== runId,
        },
      });
      if (runSeqRef.current !== runId) return;

      const assistantMessage: LlmChatMessage = {role: 'assistant', content: finalText.trim()};
      setUiMessages([assistantMessage]);
      setLlmMessages(updatedMessages);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'hypoDetective',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'hypoDetective'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run Hypo Detective');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, glucoseSettings.severeHypo, aiSettings.openAiModel, initMission, handleMissionError, finaliseMission, scrollToEnd]);

  const startUserBehavior = useCallback(async () => {
    if (!provider) return;
    const {runId, signal, conversationId: nextId} = initMission('Starting User Behavior Analysis…', 'userBehavior');

    try {
      setProgressText('Loading CGM data…');
      const cgmResult = await runAiAnalystTool('getCgmSamples', {
        rangeDays: USER_BEHAVIOR_RANGE_DAYS,
        maxSamples: USER_BEHAVIOR_MAX_SAMPLES,
      });
      recordDataUsed('getCgmSamples', cgmResult);
      if (runSeqRef.current !== runId) return;

      setProgressText('Loading treatments…');
      const treatmentsResult = await runAiAnalystTool('getTreatments', {rangeDays: USER_BEHAVIOR_RANGE_DAYS});
      recordDataUsed('getTreatments', treatmentsResult);
      if (runSeqRef.current !== runId) return;

      const insulinResult = await runAiAnalystTool('getInsulinSummary', {rangeDays: USER_BEHAVIOR_RANGE_DAYS});
      recordDataUsed('getInsulinSummary', insulinResult);
      if (runSeqRef.current !== runId) return;

      setProgressText('Asking AI Analyst…');

      const userPrompt =
        `Mission: User Behavior Improvements\n\n` +
        `Help me identify ways I can improve my diabetes management through my own actions and habits. ` +
        `Focus on user behaviors, NOT Loop settings changes.\n\n` +
        `Disclosure: ${DISCLOSURE_TEXT}\n\n` +
        `Recent CGM Data (${USER_BEHAVIOR_RANGE_DAYS} days):\n${JSON.stringify(cgmResult.ok ? cgmResult.result : 'Data unavailable')}\n\n` +
        `Recent Treatments:\n${JSON.stringify(treatmentsResult.ok ? treatmentsResult.result : 'Data unavailable')}\n\n` +
        `Insulin Summary:\n${JSON.stringify(insulinResult.ok ? insulinResult.result : 'Data unavailable')}`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const systemPrompt = buildSystemPrompt('userBehavior', glucoseSettings);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [{role: 'system', content: systemPrompt}, ...baseLlmMessages],
        temperature: temperatureForModel(aiSettings.openAiModel, USER_BEHAVIOR_TEMPERATURE),
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, USER_BEHAVIOR_MAX_OUTPUT_TOKENS),
        abortSignal: signal,
      });
      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
      const assistantMessage: LlmChatMessage = {role: 'assistant', content: finalText};
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'userBehavior',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'userBehavior'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run User Behavior Analysis');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, aiSettings.openAiModel, glucoseSettings, recordDataUsed, initMission, handleMissionError, finaliseMission, scrollToEnd]);

  const startLoopSettingsAdvisor = useCallback(async () => {
    if (!provider) return;
    const {runId, signal, conversationId: nextId} = initMission('Starting Loop Settings Advisor…', 'loopSettings');

    try {
      setProgressText('Loading profile data…');
      const profileResult = await runAiAnalystTool('getPumpProfile', {});
      recordDataUsed('getPumpProfile', profileResult);
      console.log('[LoopSettingsAdvisor] Profile loaded:', profileResult.ok ? 'success' : 'failed');
      if (runSeqRef.current !== runId) return;

      const currentSettingsResult = await runAiAnalystTool('getCurrentProfileSettings', {});
      recordDataUsed('getCurrentProfileSettings', currentSettingsResult);
      if (runSeqRef.current !== runId) return;

      setProgressText('Asking AI Analyst…');

      const userPrompt =
        `Mission: Loop Settings Advisor\n\n` +
        `I'd like help optimizing my Loop settings.\n\n` +
        `Disclosure: ${DISCLOSURE_TEXT}\n\n` +
        `Current Pump Profile (for your reference, don't mention specifics yet):\n${JSON.stringify(profileResult.ok ? profileResult.result : 'Profile unavailable')}\n\n` +
        `Current Profile Settings (USE THESE to fill Current Value fields later):\n${JSON.stringify(
          currentSettingsResult.ok ? currentSettingsResult.result : 'Settings unavailable',
        )}\n\n` +
        `IMPORTANT: Start with a simple, friendly greeting and ask ONE open-ended question like "What's been bothering you lately?" or "What would you like to improve?"\n` +
        `DO NOT overwhelm with multiple questions in the first message.\n` +
        `After I respond, you can ask 2-3 focused follow-up questions, then use tools to analyze.\n` +
        `Do NOT ask me whether I changed settings; you can verify that yourself via getSettingsChangeHistory/getProfileChangeHistory.`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const systemPrompt = buildSystemPrompt('loopSettings', glucoseSettings);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [{role: 'system', content: systemPrompt}, ...baseLlmMessages],
        temperature: temperatureForModel(aiSettings.openAiModel, LOOP_SETTINGS_TEMPERATURE),
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, DEFAULT_MAX_OUTPUT_TOKENS),
        abortSignal: signal,
      });
      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
      const assistantMessage: LlmChatMessage = {role: 'assistant', content: finalText};
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'loopSettings',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'loopSettings'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run Loop Settings Advisor');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, aiSettings.openAiModel, glucoseSettings, recordDataUsed, initMission, handleMissionError, finaliseMission, scrollToEnd]);

  // ====================================================================
  // Follow-up (shared across all missions)
  // ====================================================================

  /** Pre-fetch glycemic events for hyper/hypo questions with a range. */
  const maybePreFetchGlycemicEvents = useCallback(
    async (
      text: string,
      messages: LlmChatMessage[],
      runId: number,
      onDataUsed: (name: string, result: any) => void,
    ): Promise<LlmChatMessage[]> => {
      const rangeDays = parseRangeDaysFromText(text);
      if (rangeDays == null) return messages;

      const isHyper = looksLikeHyperQuestion(text) && !looksLikeHypoQuestion(text);
      const isHypo = looksLikeHypoQuestion(text) && !isHyper;
      if (!isHyper && !isHypo) return messages;

      const kind = isHyper ? 'hyper' : 'hypo';
      const thresholdMgdl = isHyper ? glucoseSettings.hyper : glucoseSettings.hypo;
      const maxEvents = wantsCountWithDates(text) ? MAX_EVENTS_WITH_DATES : MAX_EVENTS_DEFAULT;

      setProgressText('Running getGlycemicEvents…');
      const toolResult = await withTimeout(
        runAiAnalystTool('getGlycemicEvents', {kind, rangeDays, thresholdMgdl, maxEvents}),
        TOOL_TIMEOUT_MS,
        'getGlycemicEvents',
      );

      if (runSeqRef.current !== runId) return messages;
      onDataUsed('getGlycemicEvents', toolResult);

      return [
        ...messages,
        {role: 'user', content: `Tool result (getGlycemicEvents):\n${JSON.stringify(toolResult)}`},
      ];
    },
    [glucoseSettings.hyper, glucoseSettings.hypo],
  );

  /** Follow-up error handler (rolls back user message for retry). */
  const handleFollowUpError = useCallback(
    (error: any, originalText: string, _runId: number) => {
      const rawMsg = error?.message ? String(error.message) : 'Failed to send message';
      const msg = error?.name === 'AbortError' ? 'Stopped' : rawMsg;
      if (msg === 'Stopped') return;

      const isEmpty = /empty response from openai/i.test(msg);
      setErrorText(
        isEmpty ? 'OpenAI returned an empty response (often transient). Tap Send to retry.' : msg,
      );

      // Roll back the last user message so retry doesn't duplicate.
      setUiMessages(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (last?.role === 'user' && last?.content === originalText) {
          const next = prev.slice(0, -1);
          void persistHistorySnapshot(next);
          return next;
        }
        return prev;
      });
      setLlmMessages(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (last?.role === 'user' && last?.content === originalText) return prev.slice(0, -1);
        return prev;
      });

      setInput(originalText);
    },
    [persistHistorySnapshot],
  );

  const sendFollowUp = useCallback(async () => {
    if (!provider) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setErrorText(null);
    setIsBusy(true);
    const {runId, signal} = beginRun('Thinking…');

    const userUiMessage: LlmChatMessage = {role: 'user', content: trimmed};
    setUiMessages(prev => {
      const next = [...prev, userUiMessage];
      void persistHistorySnapshot(next);
      return next;
    });

    let workingLlmMessages: LlmChatMessage[] = [...llmMessages, {role: 'user', content: trimmed}];
    setLlmMessages(workingLlmMessages);
    setInput('');

    try {
      workingLlmMessages = await maybePreFetchGlycemicEvents(
        trimmed, workingLlmMessages, runId, recordDataUsed,
      );
      setLlmMessages(workingLlmMessages);

      const maxToolCalls = analystMode === 'loopSettings' ? LOOP_SETTINGS_MAX_TOOL_CALLS : DEFAULT_MAX_TOOL_CALLS;
      const maxOutputTokens = maxOutputTokensForModel(
        aiSettings.openAiModel,
        analystMode === 'loopSettings' ? LOOP_SETTINGS_MAX_OUTPUT_TOKENS : DEFAULT_MAX_OUTPUT_TOKENS,
      );
      const systemPrompt = buildSystemPrompt(analystMode, glucoseSettings);

      const {finalText, llmMessages: updatedMessages} = await runLlmToolLoop({
        provider,
        model: aiSettings.openAiModel,
        systemPrompt,
        initialMessages: workingLlmMessages,
        maxToolCalls,
        maxOutputTokens,
        temperature: temperatureForModel(aiSettings.openAiModel, DEFAULT_TEMPERATURE),
        abortSignal: signal,
        callbacks: {
          onToolStart: name => setProgressText(`Running ${name}…`),
          onToolResult: recordDataUsed,
          isCancelled: () => runSeqRef.current !== runId,
        },
        isLoopSettingsMode: analystMode === 'loopSettings',
        enableExpertReflection: analystMode === 'loopSettings',
      });

      if (runSeqRef.current !== runId) return;
      setLlmMessages(updatedMessages);

      let finalOut = stripFillerSuffix(finalText);
      if (!finalOut) finalOut = EMPTY_RESPONSE_FALLBACK;

      const assistantUiMessage: LlmChatMessage = {role: 'assistant', content: finalOut};
      setUiMessages(prev => {
        const next = [...prev, assistantUiMessage];
        void persistHistorySnapshot(next);
        return next;
      });
      scrollToEnd();
    } catch (e: any) {
      if (runSeqRef.current !== runId) return;
      handleFollowUpError(e, trimmed, runId);
    } finally {
      finaliseMission(runId);
    }
  }, [
    provider, input, llmMessages, aiSettings.openAiModel, analystMode,
    glucoseSettings, persistHistorySnapshot, recordDataUsed, beginRun,
    finaliseMission, scrollToEnd, maybePreFetchGlycemicEvents, handleFollowUpError,
  ]);

  // ====================================================================
  // History actions
  // ====================================================================

  const openHistory = useCallback(async () => {
    await refreshHistory();
    setState({mode: 'history'});
  }, [refreshHistory]);

  const clearAllHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      await clearAiAnalystHistory();
      await refreshHistory();
    } finally {
      setHistoryBusy(false);
    }
  }, [refreshHistory]);

  const deleteConversation = useCallback(
    async (id: string) => {
      setHistoryBusy(true);
      try {
        await deleteAiAnalystConversation(id);
        await refreshHistory();
        setState({mode: 'history'});
      } finally {
        setHistoryBusy(false);
      }
    },
    [refreshHistory],
  );

  // ====================================================================
  // Dashboard reset
  // ====================================================================

  const goBackToDashboard = useCallback(() => {
    Keyboard.dismiss();
    setUiMessages([]);
    setLlmMessages([]);
    setState({mode: 'dashboard'});
  }, []);

  // ====================================================================
  // Return
  // ====================================================================

  return {
    state,
    setState,
    hasKey,
    isEnabled: aiSettings.enabled,

    uiMessages,
    input,
    setInput,
    isBusy,
    progressText,
    errorText,

    historyItems,
    historyBusy,

    scrollRef,

    markdown: {
      instance: markdownItInstance,
      rules: selectableMarkdownRules,
      style: markdownStyle,
    },

    openSettings,
    openHistory,
    clearHistory: clearAllHistory,
    deleteConversation,
    startHypoDetective,
    startUserBehavior,
    startLoopSettingsAdvisor,
    sendFollowUp,
    cancelActiveRun,
    goBackToDashboard,
    exportSession,
  };
}
