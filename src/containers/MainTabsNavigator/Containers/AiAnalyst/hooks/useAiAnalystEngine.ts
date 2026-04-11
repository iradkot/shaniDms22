import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Keyboard, ScrollView, Share} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {useNavigation} from '@react-navigation/native';

import {ThemeType} from 'app/types/theme';
import * as SCREEN_NAMES from 'app/constants/SCREEN_NAMES';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

import {AI_ANALYST_SYSTEM_PROMPT} from 'app/services/llm/systemPrompts';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {
import {useAppTheme} from 'app/hooks/useAppTheme';
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
import {addMemoryEntry} from 'app/services/aiMemory/aiMemoryStore';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';

import {ScreenState, AnalystMode, AiAnalystEngine, EvidenceRequest, MissionKey, CompactKpi} from '../types';
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
  MAX_CONTEXT_MESSAGES,
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
  const theme = useAppTheme();
  const navigation = useNavigation<any>();
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();
  const {language} = useAppLanguage();

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

  const {snapshot: liveSnapshot} = useLatestNightscoutSnapshot({
    pollingEnabled: state.mode === 'mission',
  });

  // ── Chat state ──────────────────────────────────────────────────────────
  const [uiMessages, setUiMessages] = useState<LlmChatMessage[]>([]);
  const [llmMessages, setLlmMessages] = useState<LlmChatMessage[]>([]);
  const [sessionDataUsed, setSessionDataUsed] = useState<AiAnalystDataUsedItem[]>([]);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [compactKpi, setCompactKpi] = useState<CompactKpi | null>(null);

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
  const activeMissionRef = useRef<MissionKey>('openChat');

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

  const trendArrowFromDirection = useCallback((direction: unknown): string | null => {
    const d = typeof direction === 'string' ? direction : '';
    if (['DoubleUp', 'SingleUp', 'FortyFiveUp'].includes(d)) return '↑';
    if (['DoubleDown', 'SingleDown', 'FortyFiveDown'].includes(d)) return '↓';
    if (d === 'Flat') return '→';
    return null;
  }, []);

  const deriveCompactKpiFromCgmResult = useCallback((payload: any): CompactKpi | null => {
    const samples = Array.isArray(payload?.samples) ? payload.samples : [];
    if (!samples.length) return null;

    const withTs = samples
      .map((s: any) => {
        const ts =
          typeof s?.tMs === 'number'
            ? s.tMs
            : typeof s?.timestampMs === 'number'
            ? s.timestampMs
            : typeof s?.date === 'number'
            ? s.date
            : typeof s?.dateString === 'string'
            ? Date.parse(s.dateString)
            : NaN;
        return {s, ts: Number.isFinite(ts) ? ts : NaN};
      })
      .filter((x: any) => Number.isFinite(x.ts))
      .sort((a: any, b: any) => a.ts - b.ts);

    const latest = withTs.length ? withTs[withTs.length - 1].s : null;
    if (!latest) return null;

    const prev = withTs.length > 1 ? withTs[withTs.length - 2].s : null;
    const bg = typeof latest?.mgdl === 'number' ? Math.round(latest.mgdl) : null;
    const prevBg = typeof prev?.mgdl === 'number' ? Math.round(prev.mgdl) : null;

    let trend: string | null = trendArrowFromDirection(latest?.direction);
    if (bg != null && prevBg != null) {
      const d = bg - prevBg;
      trend = d >= 12 ? '↑' : d <= -12 ? '↓' : '→';
    }

    const sampleTimeMs =
      typeof latest?.tMs === 'number'
        ? latest.tMs
        : typeof latest?.timestampMs === 'number'
        ? latest.timestampMs
        : typeof latest?.date === 'number'
        ? latest.date
        : typeof latest?.dateString === 'string'
        ? Date.parse(latest.dateString)
        : null;

    return {
      bgMgdl: bg,
      trend,
      iobU: typeof latest?.iobU === 'number' ? Number(latest.iobU.toFixed(2)) : null,
      cobG: typeof latest?.cobG === 'number' ? Math.round(latest.cobG) : null,
      sampleTimeMs: Number.isFinite(sampleTimeMs as number) ? (sampleTimeMs as number) : null,
    };
  }, [trendArrowFromDirection]);

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
      tr(language, 'ai.exportTitle'),
      tr(language, 'ai.exportBody'),
      [
        {
          text: tr(language, 'ai.shareSummary'),
          onPress: async () => {
            const md = buildAiAnalystExportMarkdown(payload);
            await Share.share({title: tr(language, 'ai.shareSummaryTitle'), message: md});
          },
        },
        {
          text: tr(language, 'ai.shareDataJson'),
          onPress: async () => {
            const json = buildAiAnalystExportJson(payload);
            await Share.share({title: tr(language, 'ai.shareDataTitle'), message: json});
          },
        },
        {text: tr(language, 'common.cancel'), style: 'cancel'},
      ],
    );
  }, [conversationId, sessionDataUsed, state, uiMessages, language]);

  // ====================================================================
  // Mission starters
  // ====================================================================

  const startOpenChatInternal = useCallback(async (contextPrompt?: string) => {
    if (!provider) return;
    const {runId, signal, conversationId: nextId} = initMission(language === 'he' ? 'מכין הקשר…' : 'Preparing context…', null);

    try {
      const [cgmResult, insulinResult, profileResult] = await Promise.all([
        runAiAnalystTool('getCgmSamples', {rangeDays: 14, maxSamples: 400}),
        runAiAnalystTool('getInsulinSummary', {rangeDays: 14}),
        runAiAnalystTool('getCurrentProfileSettings', {}),
      ]);

      recordDataUsed('getCgmSamples', cgmResult);
      recordDataUsed('getInsulinSummary', insulinResult);
      recordDataUsed('getCurrentProfileSettings', profileResult);
      setCompactKpi(cgmResult?.ok ? deriveCompactKpiFromCgmResult(cgmResult.result) : null);
      if (runSeqRef.current !== runId) return;

      setProgressText(language === 'he' ? 'פותח שיחה…' : 'Starting chat…');

      const contextualSection = contextPrompt?.trim()
        ? language === 'he'
          ? `\n\nהקשר מהמלצה במסך הבית:\n${contextPrompt.trim()}\n\nתתחיל מלהתייחס להקשר הזה לפני שאלות המשך.`
          : `\n\nContext from Home recommendation:\n${contextPrompt.trim()}\n\nStart by addressing this specific context before asking follow-up questions.`
        : '';

      const languageHint =
        language === 'he'
          ? 'חשוב: כתוב למשתמש בעברית בלבד.'
          : 'Important: respond to the user in English only.';

      const userPrompt =
        (language === 'he' ? `משימה: צ׳אט פתוח\n\n` : `Mission: Open Chat\n\n`) +
        (language === 'he'
          ? `התחל בברכה קצרה וידידותית ושאלה קצרה אחת על מה המשתמש רוצה להתמקד עכשיו.\n`
          : `Start with a short, friendly greeting and one concise question asking what the user wants to focus on now.\n`) +
        (language === 'he'
          ? `אפשר לענות על שאלות מגוונות על סוכרת, אבל לבסס המלצות על הנתונים הזמינים.\n\n`
          : `You can answer broad and random diabetes questions, but ground recommendations in available data.\n\n`) +
        `${languageHint}\n\n` +
        `Disclosure: ${DISCLOSURE_TEXT}${contextualSection}\n\n` +
        `${language === 'he' ? 'תמונת CGM אחרונה (14 ימים):' : 'Recent CGM snapshot (14d):'}\n${JSON.stringify(cgmResult.ok ? cgmResult.result : language === 'he' ? 'נתונים לא זמינים' : 'Data unavailable')}\n\n` +
        `${language === 'he' ? 'סיכום אינסולין אחרון (14 ימים):' : 'Recent insulin summary (14d):'}\n${JSON.stringify(insulinResult.ok ? insulinResult.result : language === 'he' ? 'נתונים לא זמינים' : 'Data unavailable')}\n\n` +
        `${language === 'he' ? 'הגדרות פרופיל נוכחיות:' : 'Current profile settings:'}\n${JSON.stringify(profileResult.ok ? profileResult.result : language === 'he' ? 'נתונים לא זמינים' : 'Data unavailable')}`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const {finalText, llmMessages: updatedMessages} = await runLlmToolLoop({
        provider,
        model: aiSettings.openAiModel,
        systemPrompt: buildSystemPrompt(null, glucoseSettings, language),
        initialMessages: baseLlmMessages,
        maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, DEFAULT_MAX_OUTPUT_TOKENS),
        temperature: temperatureForModel(aiSettings.openAiModel, DEFAULT_TEMPERATURE),
        abortSignal: signal,
        callbacks: {
          onToolStart: name => setProgressText(`Running ${name}…`),
          onToolResult: recordDataUsed,
          isCancelled: () => runSeqRef.current !== runId,
        },
      });
      if (runSeqRef.current !== runId) return;

      const assistantMessage: LlmChatMessage = {
        role: 'assistant',
        content: sanitizeAssistantToneAndAvailability(finalText.trim()),
      };
      setUiMessages([assistantMessage]);
      setLlmMessages(updatedMessages);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'openChat',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      activeMissionRef.current = 'openChat';
      setState({mode: 'mission', mission: 'openChat'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to start Open Chat');
    } finally {
      finaliseMission(runId);
    }
  }, [
    provider,
    aiSettings.openAiModel,
    glucoseSettings,
    language,
    initMission,
    recordDataUsed,
    handleMissionError,
    finaliseMission,
    scrollToEnd,
    deriveCompactKpiFromCgmResult,
    sanitizeAssistantToneAndAvailability,
  ]);

  const startOpenChat = useCallback(async () => {
    await startOpenChatInternal();
  }, [startOpenChatInternal]);

  const startOpenChatWithContext = useCallback(async (contextPrompt: string) => {
    await startOpenChatInternal(contextPrompt);
  }, [startOpenChatInternal]);

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

      const assistantMessage: LlmChatMessage = {
        role: 'assistant',
        content: sanitizeAssistantToneAndAvailability(finalText.trim()),
      };
      setUiMessages([assistantMessage]);
      setLlmMessages(updatedMessages);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'hypoDetective',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      activeMissionRef.current = 'hypoDetective';
      setState({mode: 'mission', mission: 'hypoDetective'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run Hypo Detective');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, glucoseSettings.severeHypo, aiSettings.openAiModel, initMission, handleMissionError, finaliseMission, scrollToEnd, sanitizeAssistantToneAndAvailability]);

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
      setCompactKpi(cgmResult?.ok ? deriveCompactKpiFromCgmResult(cgmResult.result) : null);
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

      const systemPrompt = buildSystemPrompt('userBehavior', glucoseSettings, language);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [{role: 'system', content: systemPrompt}, ...baseLlmMessages],
        temperature: temperatureForModel(aiSettings.openAiModel, USER_BEHAVIOR_TEMPERATURE),
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, USER_BEHAVIOR_MAX_OUTPUT_TOKENS),
        abortSignal: signal,
      });
      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
      const assistantMessage: LlmChatMessage = {
        role: 'assistant',
        content: sanitizeAssistantToneAndAvailability(finalText),
      };
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'userBehavior',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      activeMissionRef.current = 'userBehavior';
      setState({mode: 'mission', mission: 'userBehavior'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run User Behavior Analysis');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, aiSettings.openAiModel, glucoseSettings, language, recordDataUsed, initMission, handleMissionError, finaliseMission, scrollToEnd, deriveCompactKpiFromCgmResult, sanitizeAssistantToneAndAvailability]);

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

      const systemPrompt = buildSystemPrompt('loopSettings', glucoseSettings, language);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [{role: 'system', content: systemPrompt}, ...baseLlmMessages],
        temperature: temperatureForModel(aiSettings.openAiModel, LOOP_SETTINGS_TEMPERATURE),
        maxOutputTokens: maxOutputTokensForModel(aiSettings.openAiModel, DEFAULT_MAX_OUTPUT_TOKENS),
        abortSignal: signal,
      });
      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
      const assistantMessage: LlmChatMessage = {
        role: 'assistant',
        content: sanitizeAssistantToneAndAvailability(finalText),
      };
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'loopSettings',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      activeMissionRef.current = 'loopSettings';
      setState({mode: 'mission', mission: 'loopSettings'});
      setProgressText('');
      scrollToEnd();
    } catch (e: any) {
      handleMissionError(e, runId, 'Failed to run Loop Settings Advisor');
    } finally {
      finaliseMission(runId);
    }
  }, [provider, aiSettings.openAiModel, glucoseSettings, language, recordDataUsed, initMission, handleMissionError, finaliseMission, scrollToEnd, sanitizeAssistantToneAndAvailability]);

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

  /** Keep only recent context to reduce latency/cost while preserving tool results. */
  const buildContextWindow = useCallback((messages: LlmChatMessage[]): LlmChatMessage[] => {
    if (!Array.isArray(messages) || messages.length <= MAX_CONTEXT_MESSAGES) return messages;

    const recent = messages.slice(-MAX_CONTEXT_MESSAGES);
    const hasToolResultsInRecent = recent.some(
      m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('Tool result ('),
    );

    if (hasToolResultsInRecent) return recent;

    const latestToolResult = [...messages]
      .reverse()
      .find(
        m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('Tool result ('),
      );

    return latestToolResult ? [latestToolResult, ...recent] : recent;
  }, []);

  const maybeInjectEvidenceTag = useCallback((userText: string, assistantText: string): string => {
    const lower = String(userText || '').toLowerCase();
    const assistantLower = String(assistantText || '').toLowerCase();
    const alreadyHasTag = /\[\[\s*evidence\s*:/i.test(assistantText);

    const rangeDays = parseRangeDaysFromText(lower) ?? 14;

    const asksAgp =
      /\bagp\b/.test(lower) ||
      (lower.includes('ambulatory') && lower.includes('profile')) ||
      lower.includes('אייג׳יפי');
    const asksTir =
      lower.includes('time in range') ||
      lower.includes('tir') ||
      (lower.includes('in range') && lower.includes('time')) ||
      lower.includes('בטווח') ||
      lower.includes('זמן בטווח');
    const asksMealEvidence =
      lower.includes('meal') ||
      lower.includes('carb') ||
      lower.includes('ratio') ||
      lower.includes('post meal') ||
      lower.includes('after meal') ||
      lower.includes('ארוחה') ||
      lower.includes('פחמ') ||
      lower.includes('בולוס') ||
      lower.includes('היפו');

    const assistantMentionsMealLogic =
      assistantLower.includes('bolus') ||
      assistantLower.includes('temp basal') ||
      assistantLower.includes('stack') ||
      assistantLower.includes('carb') ||
      assistantLower.includes('ארוחה') ||
      assistantLower.includes('בולוס') ||
      assistantLower.includes('היפו');

    if (!alreadyHasTag) {
      if (asksAgp) return `${assistantText}\n\n[[evidence:agp:${rangeDays}]]`;
      if (asksTir) return `${assistantText}\n\n[[evidence:tir:${rangeDays}]]`;
      if (asksMealEvidence || assistantMentionsMealLogic) {
        return `${assistantText}\n\n[[evidence:meal:${Math.min(rangeDays, 14)}]]\n[[evidence:agp:14]]`;
      }

      const asksEvidenceForRecommendation =
        (lower.includes('recommend') || lower.includes('advice') || lower.includes('הוכח') || lower.includes('הוכחות')) &&
        (lower.includes('evidence') || lower.includes('prove') || lower.includes('proof') || lower.includes('show'));

      if (asksEvidenceForRecommendation) {
        return `${assistantText}\n\n[[evidence:meal:7]]\n[[evidence:agp:14]]`;
      }
    }

    return assistantText;
  }, []);

  const sanitizeAssistantToneAndAvailability = useCallback((text: string): string => {
    if (!text) return text;

    let out = text;

    const mentionsCarbRatio = /carb ratio|carbohydrate ratio|cr\b/i.test(out);
    const hasPercent = /\b\d{1,2}\s*%/.test(out);
    const hasRatioExample = /\b\d+\s*:\s*\d+(\.\d+)?\b/.test(out);
    if (mentionsCarbRatio && !hasPercent && !hasRatioExample) {
      out += '\n\nPractical starting point: consider a conservative carb-ratio adjustment of about 5-10%, then monitor meal responses for 3-7 days.';
    }

    out = out.replace(
      /\b(discuss|review|check)\b[^.\n]*(clinician|doctor|care team|healthcare provider)[^.\n]*\.?/gi,
      'review this in-app and adjust your self-management plan based on the data shown.',
    );

    const hasEvidenceTag = /\[\[\s*evidence\s*:/i.test(out);
    const saysNoData =
      /don['’]t have[^.\n]*(data|agp|time in range|tir|absorption)/i.test(out) ||
      /data (is|are) unavailable/i.test(out) ||
      /unable to (find|access).*(data|agp|tir|absorption)/i.test(out);

    if (hasEvidenceTag && saysNoData) {
      out = out.replace(
        /(i currently don['’]t have[^.\n]*\.?|you may want to check[^.\n]*\.?|data (is|are) unavailable[^.\n]*\.?)/gi,
        '',
      );
      out = `I pulled your data and prepared the requested view.\n\n${out}`.replace(/\n{3,}/g, '\n\n').trim();
    }

    return out;
  }, []);

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
      try {
        const kpiRes = await runAiAnalystTool('getCgmSamples', {rangeDays: 1, maxSamples: 80, includeDeviceStatus: true});
        if (kpiRes?.ok) setCompactKpi(deriveCompactKpiFromCgmResult(kpiRes.result));
      } catch {}

      workingLlmMessages = await maybePreFetchGlycemicEvents(
        trimmed, workingLlmMessages, runId, recordDataUsed,
      );
      setLlmMessages(workingLlmMessages);

      const maxToolCalls = analystMode === 'loopSettings' ? LOOP_SETTINGS_MAX_TOOL_CALLS : DEFAULT_MAX_TOOL_CALLS;
      const maxOutputTokens = maxOutputTokensForModel(
        aiSettings.openAiModel,
        analystMode === 'loopSettings' ? LOOP_SETTINGS_MAX_OUTPUT_TOKENS : DEFAULT_MAX_OUTPUT_TOKENS,
      );
      const systemPrompt = buildSystemPrompt(analystMode, glucoseSettings, language);

      const contextWindowMessages = buildContextWindow(workingLlmMessages);

      const {finalText, llmMessages: updatedMessages} = await runLlmToolLoop({
        provider,
        model: aiSettings.openAiModel,
        systemPrompt,
        initialMessages: contextWindowMessages,
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
      finalOut = maybeInjectEvidenceTag(trimmed, finalOut);
      finalOut = sanitizeAssistantToneAndAvailability(finalOut);

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
    buildContextWindow, maybeInjectEvidenceTag, deriveCompactKpiFromCgmResult,
    language, sanitizeAssistantToneAndAvailability,
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

  const resumeConversation = useCallback(
    async (id: string) => {
      const items = historyItems.length ? historyItems : await loadAiAnalystHistory();
      const selected = (items ?? []).find((x: any) => x.id === id);
      if (!selected) return;

      const mission =
        selected?.mission === 'hypoDetective' ||
        selected?.mission === 'userBehavior' ||
        selected?.mission === 'loopSettings' ||
        selected?.mission === 'openChat'
          ? (selected.mission as MissionKey)
          : 'openChat';

      const restoredUiMessages: LlmChatMessage[] = (selected.messages ?? [])
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m: any) => ({role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '')}))
        .filter((m: LlmChatMessage) => m.content.trim().length > 0);

      setConversationId(selected.id);
      setUiMessages(restoredUiMessages);
      setLlmMessages(restoredUiMessages);
      setErrorText(null);
      setProgressText('');
      setInput('');
      setState({mode: 'mission', mission});
      activeMissionRef.current = mission;
      scrollToEnd();
    },
    [historyItems, scrollToEnd],
  );

  const onAttachMealImage = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      if (res.didCancel) return;
      const asset = (res.assets ?? [])[0];
      const uri = asset?.uri ?? '';
      const fileName = asset?.fileName ?? null;
      const fileSize = asset?.fileSize ?? null;

      await addMemoryEntry({
        type: 'episode',
        tags: ['meal', 'photo_input', 'user_provided'],
        textSummary: language === 'he' ? 'המשתמש צירף תמונת ארוחה לניתוח.' : 'User attached a meal photo for analysis.',
        facts: {uri, fileName, fileSize},
        source: 'user',
        confidence: 0.9,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      setInput(
        language === 'he'
          ? `צירפתי תמונת ארוחה${fileName ? ` (${fileName})` : ''}. תתחיל בהערכת פחמימות וטווח השפעה (1-8 שעות, ויותר אם הדפוס מצביע על כך), תשווה לארוחות דומות אחרונות, ותסביר מה לתת ללופ לנהל לפני תיקון.`
          : `I attached a meal photo${fileName ? ` (${fileName})` : ''}. Start with carb estimate and expected impact window (1-8h, and longer if pattern suggests), compare to similar recent meals, and explain what to let Loop handle before any correction.`,
      );
    } catch {
      // no-op
    }
  }, [language]);

  const onAssistantFeedback = useCallback(
    async ({content, helpful}: {content: string; helpful: boolean}) => {
      try {
        await addMemoryEntry({
          type: 'chat_summary',
          tags: ['assistant_feedback', helpful ? 'helpful' : 'not_helpful'],
          textSummary: content,
          facts: {
            mission: state.mode === 'mission' ? state.mission : 'unknown',
            helpful,
            at: new Date().toISOString(),
          },
          source: 'user',
          confidence: 0.95,
          expiresAt: Date.now() + 120 * 24 * 60 * 60 * 1000,
        });
      } catch {
        // no-op
      }
    },
    [state],
  );

  useEffect(() => {
    if (state.mode !== 'mission') return;

    const bg = liveSnapshot?.enrichedBg ?? null;
    if (!bg) return;

    setCompactKpi({
      bgMgdl: typeof bg.sgv === 'number' ? Math.round(bg.sgv) : null,
      trend: trendArrowFromDirection(bg.direction),
      iobU: typeof bg.iob === 'number' ? Number(bg.iob.toFixed(2)) : null,
      cobG: typeof bg.cob === 'number' ? Math.round(bg.cob) : null,
      sampleTimeMs: typeof bg.date === 'number' ? bg.date : null,
    });
  }, [liveSnapshot?.enrichedBg, state.mode, trendArrowFromDirection]);

  // ====================================================================
  // Evidence navigation
  // ====================================================================

  const openEvidence = useCallback((request: EvidenceRequest) => {
    setState({mode: 'evidence', mission: activeMissionRef.current, request});
  }, []);

  const backToMissionFromEvidence = useCallback(() => {
    setState({mode: 'mission', mission: activeMissionRef.current});
  }, []);

  // ====================================================================
  // Dashboard reset
  // ====================================================================

  const goBackToDashboard = useCallback(() => {
    Keyboard.dismiss();
    setUiMessages([]);
    setLlmMessages([]);
    setCompactKpi(null);
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
    compactKpi,

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
    resumeConversation,
    startOpenChat,
    startOpenChatWithContext,
    startHypoDetective,
    startUserBehavior,
    startLoopSettingsAdvisor,
    sendFollowUp,
    onAttachMealImage,
    onAssistantFeedback,
    openEvidence,
    backToMissionFromEvidence,
    cancelActiveRun,
    goBackToDashboard,
    exportSession,
  };
}




