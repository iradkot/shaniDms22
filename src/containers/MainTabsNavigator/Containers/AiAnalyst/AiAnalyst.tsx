import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';
import Markdown, {MarkdownIt} from 'react-native-markdown-display';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import * as SCREEN_NAMES from 'app/constants/SCREEN_NAMES';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {addOpacity} from 'app/style/styling.utils';

import {
  AI_ANALYST_SYSTEM_PROMPT,
  USER_BEHAVIOR_SYSTEM_PROMPT,
  LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT,
  LOOP_SETTINGS_TOOLS_DESCRIPTION,
} from 'app/services/llm/systemPrompts';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';
import {AiAnalystToolName, runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
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

const Container = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

const Header = styled.View`
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
`;

const Title = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xl}px;
  font-weight: 700;
`;

const Subtle = styled.Text`
  margin-top: 6px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.75)};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
`;

const Card = styled.View`
  margin: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.1)};
`;

const CardRow = styled(Pressable).attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
`;

const CardIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 21px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.12)};
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

const CardTitle = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.md}px;
  font-weight: 700;
`;

const CardSubtitle = styled.Text`
  margin-top: 2px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
`;

const Button = styled(Pressable).attrs({collapsable: false})`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
  align-items: center;
`;

const ButtonText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.white};
  font-weight: 800;
`;

const MessageBubble = styled.View<{role: 'user' | 'assistant'}>`
  align-self: ${({role}: {role: 'user' | 'assistant'}) =>
    role === 'user' ? 'flex-end' : 'flex-start'};
  max-width: 88%;
  margin: 6px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: ${({theme, role}: {theme: ThemeType; role: 'user' | 'assistant'}) =>
    role === 'user' ? addOpacity(theme.accentColor, 0.14) : addOpacity(theme.textColor, 0.06)};
`;

const MessageText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.md}px;
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  gap: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const ChatInput = styled(TextInput).attrs({multiline: true})`
  flex: 1;
  min-height: 44px;
  max-height: 120px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.18)};
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  padding: 10px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const SendButton = styled(Pressable)`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
`;

type MissionKey = 'hypoDetective' | 'userBehavior' | 'loopSettings';

type AnalystMode = 'userBehavior' | 'loopSettings';

type ScreenState =
  | {mode: 'locked'}
  | {mode: 'dashboard'}
  | {mode: 'modeSelection'}
  | {mode: 'history'}
  | {mode: 'historyDetail'; id: string}
  | {mode: 'mission'; mission: MissionKey};

type ToolEnvelope =
  | {type: 'tool_call'; name: AiAnalystToolName; args?: any}
  | {type: 'final'; content: string};

function tryParseToolEnvelope(text: string): ToolEnvelope | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // Accept fenced JSON blocks.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Best effort: extract a single top-level JSON object.
  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null;
  const candidate = unfenced.slice(firstBrace, lastBrace + 1).trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;
  try {
    const obj = JSON.parse(candidate);
    if (obj?.type === 'tool_call' && typeof obj?.name === 'string') {
      return {type: 'tool_call', name: obj.name, args: obj.args};
    }
    // Back-compat: some older code emitted `tool_name` instead of `name`.
    if (obj?.type === 'tool_call' && typeof obj?.tool_name === 'string') {
      return {type: 'tool_call', name: obj.tool_name, args: obj.args};
    }
    if (obj?.type === 'final' && typeof obj?.content === 'string') {
      return {type: 'final', content: obj.content};
    }

    // Back-compat: some models emit the tool name directly in `type`.
    // Example: {"type":"analyze_time_in_range","args":{...}}
    if (
      typeof obj?.type === 'string' &&
      obj.type !== 'tool_call' &&
      obj.type !== 'final' &&
      obj?.args !== undefined
    ) {
      return {type: 'tool_call', name: obj.type, args: obj.args};
    }

    // Back-compat: some models omit `type` and only provide {"name":"tool","args":{...}}.
    if (typeof obj?.name === 'string' && obj?.args !== undefined) {
      return {type: 'tool_call', name: obj.name, args: obj.args};
    }
    return null;
  } catch {
    return null;
  }
}

function makeDisclosureText() {
  return 'AI Analyst sends your diabetes data (BG, treatments, device status) to an external LLM provider to generate insights.';
}

function makeConversationId(): string {
  return `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseRangeDaysFromText(text: string): number | null {
  const t = (text ?? '').toLowerCase();

  const month = t.match(/(\d{1,2})\s*(month|months)/);
  if (month) return Math.max(1, Math.min(180, Number(month[1]) * 30));

  const week = t.match(/(\d{1,2})\s*(week|weeks)/);
  if (week) return Math.max(1, Math.min(180, Number(week[1]) * 7));

  const day = t.match(/(\d{1,3})\s*(day|days)/);
  if (day) return Math.max(1, Math.min(180, Number(day[1])));

  // Basic Hebrew support: "חודש" / "חודשים".
  const hebMonth = (text ?? '').match(/(\d{1,2})\s*(חודש|חודשים)/);
  if (hebMonth) return Math.max(1, Math.min(180, Number(hebMonth[1]) * 30));

  return null;
}

function looksLikeHyperQuestion(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return (
    t.includes('hyper') ||
    t.includes('hypers') ||
    t.includes('high') ||
    t.includes('highs') ||
    t.includes('above range') ||
    t.includes('היפר') ||
    t.includes('גבוה')
  );
}

function looksLikeHypoQuestion(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return t.includes('hypo') || t.includes('hypos') || t.includes('low') || t.includes('lows') || t.includes('היפו') || t.includes('נמוך');
}

function wantsCountWithDates(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return t.includes('how many') || t.includes('count') || t.includes('כמה') || t.includes('מתי') || t.includes('dates') || t.includes('תאריכים');
}

function looksLikeBasalRecommendation(text: string): boolean {
  return /\b(basal|basal rate|scheduled basal|u\/hr)\b/i.test(text ?? '');
}

function looksLikePlaceholderValues(text: string): boolean {
  return /\[(x|y|your current|adjust to|suggested value|current value)[^\]]*\]/i.test(text ?? '');
}

function getMissionTitle(mission: string | undefined): string {
  if (mission === 'loopSettings') return 'Loop Settings Advisor';
  if (mission === 'userBehavior') return 'User Behavior Tips';
  return 'Hypo Detective';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });

  return (Promise.race([promise, timeout]) as Promise<T>).then(
    v => {
      if (timer) clearTimeout(timer);
      return v;
    },
    e => {
      if (timer) clearTimeout(timer);
      throw e;
    },
  );
}

const AiAnalyst: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation<any>();

  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const hasKey = (aiSettings.apiKey ?? '').trim().length > 0;

  const [state, setState] = useState<ScreenState>(() =>
    hasKey ? {mode: 'dashboard'} : {mode: 'locked'},
  );

  // Keep screen mode in sync with key presence.
  if (state.mode === 'locked' && hasKey) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setTimeout(() => setState({mode: 'dashboard'}), 0);
  }
  if (state.mode !== 'locked' && !hasKey) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setTimeout(() => setState({mode: 'locked'}), 0);
  }

  const [uiMessages, setUiMessages] = useState<LlmChatMessage[]>([]);
  const [llmMessages, setLlmMessages] = useState<LlmChatMessage[]>([]);
  const [sessionDataUsed, setSessionDataUsed] = useState<AiAnalystDataUsedItem[]>([]);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Cancellation: allow users to stop a long-running analysis.
  // We abort in-flight LLM fetches where possible, and ignore in-flight tool results.
  const runSeqRef = useRef(0);
  const abortRef = useRef<any>(null);

  const beginRun = useCallback((label: string) => {
    runSeqRef.current += 1;
    const runId = runSeqRef.current;

    // Abort any previous LLM request.
    try {
      abortRef.current?.abort?.();
    } catch {}
    abortRef.current = typeof AbortController !== 'undefined' ? new AbortController() : null;

    setProgressText(label);
    return {runId, signal: abortRef.current?.signal};
  }, []);

  const cancelActiveRun = useCallback(() => {
    runSeqRef.current += 1;
    try {
      abortRef.current?.abort?.();
    } catch {}
    abortRef.current = null;

    setIsBusy(false);
    setErrorText(null);
    setProgressText('Stopped');
    setTimeout(() => setProgressText(''), 1200);
  }, []);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [analystMode, setAnalystMode] = useState<AnalystMode | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const markdownItInstance = useMemo(() => {
    // Disable images for privacy/safety (avoid remote fetches in chat).
    return MarkdownIt({typographer: true}).disable(['image']);
  }, []);

  const selectableMarkdownRules: any = useMemo(
    () => ({
      text: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => (
        <Text key={node.key} selectable style={[inheritedStyles, styles.text]}>
          {node.content}
        </Text>
      ),
      textgroup: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.textgroup}>
          {children}
        </Text>
      ),
      strong: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.strong}>
          {children}
        </Text>
      ),
      em: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.em}>
          {children}
        </Text>
      ),
      s: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.s}>
          {children}
        </Text>
      ),
      code_inline: (
        node: any,
        _children: any,
        _parent: any,
        styles: any,
        inheritedStyles: any = {},
      ) => (
        <Text key={node.key} selectable style={[inheritedStyles, styles.code_inline]}>
          {node.content}
        </Text>
      ),
      code_block: (
        node: any,
        _children: any,
        _parent: any,
        styles: any,
        inheritedStyles: any = {},
      ) => {
        let content = node.content;
        if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
          content = content.substring(0, content.length - 1);
        }
        return (
          <Text key={node.key} selectable style={[inheritedStyles, styles.code_block]}>
            {content}
          </Text>
        );
      },
      fence: (
        node: any,
        _children: any,
        _parent: any,
        styles: any,
        inheritedStyles: any = {},
      ) => {
        let content = node.content;
        if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
          content = content.substring(0, content.length - 1);
        }
        return (
          <Text key={node.key} selectable style={[inheritedStyles, styles.fence]}>
            {content}
          </Text>
        );
      },
      inline: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.inline}>
          {children}
        </Text>
      ),
      span: (node: any, children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.span}>
          {children}
        </Text>
      ),
      hardbreak: (node: any, _children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.hardbreak}>
          {'\n'}
        </Text>
      ),
      softbreak: (node: any, _children: any, _parent: any, styles: any) => (
        <Text key={node.key} selectable style={styles.softbreak}>
          {'\n'}
        </Text>
      ),
    }),
    [],
  );

  const markdownStyle = useMemo(
    () => ({
      body: {
        color: theme.textColor,
        fontSize: theme.typography.size.md,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 8,
      },
      text: {
        color: theme.textColor,
        fontSize: theme.typography.size.md,
      },
      code_inline: {
        backgroundColor: addOpacity(theme.textColor, 0.06),
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      },
      code_block: {
        backgroundColor: addOpacity(theme.textColor, 0.06),
        borderRadius: 8,
        padding: 10,
      },
      fence: {
        backgroundColor: addOpacity(theme.textColor, 0.06),
        borderRadius: 8,
        padding: 10,
      },
      link: {
        color: theme.accentColor,
      },
    }),
    [theme],
  );

  const provider = useMemo(() => {
    try {
      return createLlmProvider(aiSettings);
    } catch {
      return null;
    }
  }, [aiSettings]);

  const toolSystemPrompt = useMemo(
    () =>
      `Tooling (optional):\n` +
      `You can request additional app data via LOCAL TOOLS. Use tools when the user asks for more CGM/insulin/treatments data or when needed to answer accurately.\n\n` +
      `If the user asks about a different time window than the data you currently have (e.g. "last 5 months"), call an appropriate tool first.\n\n` +
      `Available tools (use exactly these names):\n` +
      `- getCgmData (alias of getCgmSamples): {rangeDays: number (1-180), maxSamples?: number (50-2000), includeDeviceStatus?: boolean}\n` +
      `- getCgmSamples: {rangeDays: number (1-180), maxSamples?: number (50-2000), includeDeviceStatus?: boolean}\n` +
      `- getTreatments: {rangeDays: number (1-180)}\n` +
      `- getInsulinSummary: {rangeDays: number (1-90)}\n` +
      `- getPumpProfile: {dateIso?: string}\n` +
      `- getHypoDetectiveContext: {rangeDays: number (1-180), lowThresholdMgdl?: number, maxEvents?: number}\n\n` +
      `- getGlycemicEvents: {kind: "hypo"|"hyper", rangeDays: number (1-180), thresholdMgdl: number, maxEvents?: number}\n\n` +
      `Tool choice guidance:\n` +
      `- If the user asks about hypers/highs, do NOT call getHypoDetectiveContext. Use getGlycemicEvents(kind="hyper") or getCgmData.\n` +
      `- If the user asks about hypos/lows, use getGlycemicEvents(kind="hypo") or getHypoDetectiveContext (only for the Hypo Detective mission).\n\n` +
      `How to call a tool:\n` +
      `- Respond with ONLY a single-line JSON object: {"type":"tool_call","name":"getCgmSamples","args":{...}}\n` +
      `- After you receive a message starting with "Tool result (NAME):", respond with ONLY: {"type":"final","content":"..."}.\n` +
      `- If you don't need a tool, respond with {"type":"final","content":"..."}.\n` +
      `- Content may include Markdown.\n`,
    [],
  );

  // Loop Settings Advisor uses extended tools for settings analysis
  const loopSettingsToolSystemPrompt = useMemo(
    () =>
      `Tooling (REQUIRED for Loop Settings Advisor):\n` +
      `You MUST use tools to gather data and verify your findings. Use at least 3 tool calls before making any recommendation.\n` +
      `CRITICAL: Do NOT ask the user whether they changed settings (ISF/CR/targets/basal/DIA). Verify with tools (especially getSettingsChangeHistory / getProfileChangeHistory).\n` +
      `Ask the user only for context that tools cannot provide (sleep/dinner/exercise/alcohol/illness).\n` +
      `To reduce truncation, keep each assistant message short (aim <150 words). Prefer bullets over long paragraphs.\n\n` +
      `Suggested early tool sequence for overnight issues:\n` +
      `1) getSettingsChangeHistory(daysBack=60, changeType="all")\n` +
      `2) analyzeTimeInRange(timeOfDay="overnight") or getGlucoseStats(timeOfDay="overnight")\n` +
      `3) getGlucosePatterns(daysBack=30, focusTime="overnight")\n` +
      `4) comparePeriods (if the user says it used to be better)\n\n` +
      LOOP_SETTINGS_TOOLS_DESCRIPTION +
      `\nAdditional tools available:\n` +
      `- getCgmData: {rangeDays: number (1-180), maxSamples?: number (50-2000)}\n` +
      `- getTreatments: {rangeDays: number (1-180)}\n` +
      `- getPumpProfile: {dateIso?: string}\n` +
      `- getCurrentProfileSettings: {dateIso?: string}\n` +
      `- getGlucoseStats: {startDate: ISO date string, endDate: ISO date string, timeOfDay?: "all"|"overnight"|"morning"|"afternoon"|"evening"}\n` +
      `- getMonthlyGlucoseSummary: {monthsBack: number (1-24), timeOfDay?: "all"|"overnight"|"morning"|"afternoon"|"evening"}\n` +
      `- getSettingsChangeHistory: {daysBack: number (1-180), changeType?: "all"|"carb_ratio"|"isf"|"targets"|"basal"|"dia"}\n` +
      `- getProfileChangeHistory: {rangeDays: number (7-180), maxEvents?: number (1-50)}\n` +
      `- analyzeSettingsImpact: {changeDate: ISO string, windowDays: number (1-30)}\n\n` +
      `Naming note: snake_case aliases like get_settings_change_history are accepted, but prefer the camelCase names listed here when possible.\n\n` +
      `How to call a tool:\n` +
      `- Respond with ONLY a single-line JSON object: {"type":"tool_call","name":"getGlucosePatterns","args":{...}}\n` +
      `- After you receive a message starting with "Tool result (NAME):", either call another tool or respond with {"type":"final","content":"..."}.\n` +
      `- You may call up to 20 tools per conversation.\n` +
      `- Content may include Markdown.\n`,
    [],
  );

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
      {
        name,
        atIso: new Date().toISOString(),
        result: toolResult.result,
      },
    ]);
  }, []);

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

  const startHypoDetective = useCallback(async () => {
    if (!provider) return;
    setErrorText(null);
    setIsBusy(true);
    const {runId, signal} = beginRun('Starting…');
    setUiMessages([]);
    setLlmMessages([]);
    setSessionDataUsed([]);
    setInput('');
    setAnalystMode(null);
    const nextId = makeConversationId();
    setConversationId(nextId);

    try {
      const {contextJson} = await buildHypoDetectiveContext({
        rangeDays: 60,
        lowThreshold: glucoseSettings.severeHypo,
        maxEvents: 12,
        onProgress: s => setProgressText(s),
      });

      if (runSeqRef.current !== runId) return;

      setProgressText('Asking AI Analyst…');

      const disclosure = makeDisclosureText();
      const userPrompt =
        `Mission: Hypo Detective\n\n` +
        `User question: Analyze my recent severe hypos and identify common patterns.\n\n` +
        `Disclosure: ${disclosure}\n\n` +
        `Data (JSON):\n${JSON.stringify(contextJson)}`;

      // Keep the full mission context in the LLM conversation so follow-ups stay grounded.
      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const MAX_TOOL_CALLS = 4;
      let toolCalls = 0;
      let finalText: string | null = null;
      let workingLlmMessages: LlmChatMessage[] = [...baseLlmMessages];

      while (finalText == null) {
        const temp = aiSettings.openAiModel.trim().startsWith('o') ? undefined : 0.2;
        const res = await provider.sendChat({
          model: aiSettings.openAiModel,
          messages: [
            {role: 'system', content: AI_ANALYST_SYSTEM_PROMPT + '\n' + toolSystemPrompt},
            ...workingLlmMessages,
          ],
          temperature: temp,
          maxOutputTokens: 800,
          abortSignal: signal,
        });

        if (runSeqRef.current !== runId) return;

        const raw = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
        const env = tryParseToolEnvelope(raw);

        if (env?.type === 'tool_call' && toolCalls < MAX_TOOL_CALLS) {
          toolCalls += 1;
          setProgressText(`Running ${env.name}…`);

          const toolResult = await runAiAnalystTool(env.name, env.args);
          if (runSeqRef.current !== runId) return;
          workingLlmMessages = [
            ...workingLlmMessages,
            {role: 'assistant', content: raw},
            {
              role: 'user',
              content: `Tool result (${env.name}):\n${JSON.stringify(toolResult)}`,
            },
          ];
          setLlmMessages(workingLlmMessages);
          continue;
        }

        if (env?.type === 'tool_call' && toolCalls >= MAX_TOOL_CALLS) {
          finalText =
            'I tried to fetch additional data, but hit the tool-call limit. Please try again (or ask for a smaller time range).';
        } else {
          finalText = env?.type === 'final' ? env.content : raw;
        }

        workingLlmMessages = [...workingLlmMessages, {role: 'assistant', content: finalText.trim()}];
        setLlmMessages(workingLlmMessages);
      }

      const assistantMessage = {
        role: 'assistant',
        content: (finalText ?? '').trim(),
      } satisfies LlmChatMessage;
      setUiMessages([assistantMessage]);
      setLlmMessages([...workingLlmMessages]);

      // Snapshot text-only UI messages (no JSON/tool payloads).
      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'hypoDetective',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'hypoDetective'});
      setProgressText('');

      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      if (runSeqRef.current !== runId) return;
      const msg = e?.name === 'AbortError' ? 'Stopped' : e?.message ? String(e.message) : 'Failed to run Hypo Detective';
      if (msg !== 'Stopped') setErrorText(msg);
    } finally {
      if (runSeqRef.current === runId) {
        setIsBusy(false);
        setProgressText('');
      }
    }
  }, [provider, glucoseSettings.severeHypo, aiSettings.openAiModel, toolSystemPrompt]);

  // ==========================================================================
  // USER BEHAVIOR MISSION
  // ==========================================================================
  const startUserBehavior = useCallback(async () => {
    if (!provider) return;
    setErrorText(null);
    setIsBusy(true);
    const {runId, signal} = beginRun('Starting User Behavior Analysis…');
    setUiMessages([]);
    setLlmMessages([]);
    setSessionDataUsed([]);
    setInput('');
    setAnalystMode('userBehavior');
    const nextId = makeConversationId();
    setConversationId(nextId);

    try {
      // Fetch recent CGM and treatment data for behavior analysis
      setProgressText('Loading CGM data…');
      const cgmResult = await runAiAnalystTool('getCgmSamples', {rangeDays: 14, maxSamples: 1000});
      recordDataUsed('getCgmSamples', cgmResult);
      if (runSeqRef.current !== runId) return;
      setProgressText('Loading treatments…');
      const treatmentsResult = await runAiAnalystTool('getTreatments', {rangeDays: 14});
      recordDataUsed('getTreatments', treatmentsResult);
      if (runSeqRef.current !== runId) return;
      const insulinResult = await runAiAnalystTool('getInsulinSummary', {rangeDays: 14});
      recordDataUsed('getInsulinSummary', insulinResult);
      if (runSeqRef.current !== runId) return;

      setProgressText('Asking AI Analyst…');

      const disclosure = makeDisclosureText();
      const userPrompt =
        `Mission: User Behavior Improvements\n\n` +
        `Help me identify ways I can improve my diabetes management through my own actions and habits. ` +
        `Focus on user behaviors, NOT Loop settings changes.\n\n` +
        `Disclosure: ${disclosure}\n\n` +
        `Recent CGM Data (14 days):\n${JSON.stringify(cgmResult.ok ? cgmResult.result : 'Data unavailable')}\n\n` +
        `Recent Treatments:\n${JSON.stringify(treatmentsResult.ok ? treatmentsResult.result : 'Data unavailable')}\n\n` +
        `Insulin Summary:\n${JSON.stringify(insulinResult.ok ? insulinResult.result : 'Data unavailable')}`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [
          {role: 'system', content: USER_BEHAVIOR_SYSTEM_PROMPT},
          ...baseLlmMessages,
        ],
        temperature: aiSettings.openAiModel.trim().startsWith('o') ? undefined : 0.4,
        maxOutputTokens: 1200,
        abortSignal: signal,
      });

      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');

      const assistantMessage = {
        role: 'assistant',
        content: finalText,
      } satisfies LlmChatMessage;
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'userBehavior',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'userBehavior'});
      setProgressText('');

      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      if (runSeqRef.current !== runId) return;
      const msg = e?.name === 'AbortError' ? 'Stopped' : e?.message ? String(e.message) : 'Failed to run User Behavior Analysis';
      if (msg !== 'Stopped') setErrorText(msg);
    } finally {
      if (runSeqRef.current === runId) {
        setIsBusy(false);
        setProgressText('');
      }
    }
  }, [provider, aiSettings.openAiModel, recordDataUsed]);

  // ==========================================================================
  // LOOP SETTINGS ADVISOR MISSION
  // ==========================================================================
  const startLoopSettingsAdvisor = useCallback(async () => {
    if (!provider) return;
    setErrorText(null);
    setIsBusy(true);
    const {runId, signal} = beginRun('Starting Loop Settings Advisor…');
    setUiMessages([]);
    setLlmMessages([]);
    setSessionDataUsed([]);
    setInput('');
    setAnalystMode('loopSettings');
    const nextId = makeConversationId();
    setConversationId(nextId);

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

      const disclosure = makeDisclosureText();
      // For loop settings advisor, we start with a simple greeting
      // The LLM will ask ONE question first, then follow-up after user responds
      const userPrompt =
        `Mission: Loop Settings Advisor\n\n` +
        `I'd like help optimizing my Loop settings.\n\n` +
        `Disclosure: ${disclosure}\n\n` +
        `Current Pump Profile (for your reference, don't mention specifics yet):\n${JSON.stringify(profileResult.ok ? profileResult.result : 'Profile unavailable')}\n\n` +
        `Current Profile Settings (USE THESE to fill Current Value fields later):\n${JSON.stringify(
          currentSettingsResult.ok ? currentSettingsResult.result : 'Settings unavailable'
        )}\n\n` +
        `IMPORTANT: Start with a simple, friendly greeting and ask ONE open-ended question like "What's been bothering you lately?" or "What would you like to improve?"\n` +
        `DO NOT overwhelm with multiple questions in the first message.\n` +
        `After I respond, you can ask 2-3 focused follow-up questions, then use tools to analyze.\n` +
        `Do NOT ask me whether I changed settings; you can verify that yourself via getSettingsChangeHistory/getProfileChangeHistory.`;

      const baseLlmMessages: LlmChatMessage[] = [{role: 'user', content: userPrompt}];
      setLlmMessages(baseLlmMessages);

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [
          {
            role: 'system',
            content:
              LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT +
              '\n' +
              loopSettingsToolSystemPrompt +
              `\n\n## User glucose thresholds + night window (from app settings)\n` +
              `- Severe low (<=): ${glucoseSettings.severeHypo} mg/dL\n` +
              `- Low (<): ${glucoseSettings.hypo} mg/dL\n` +
              `- High (>): ${glucoseSettings.hyper} mg/dL\n` +
              `- Severe high (>=): ${glucoseSettings.severeHyper} mg/dL\n` +
              `- Overnight window (local): ${String(glucoseSettings.nightStartHour).padStart(2, '0')}:00–${String(glucoseSettings.nightEndHour).padStart(2, '0')}:00` +
              (glucoseSettings.nightStartHour > glucoseSettings.nightEndHour ? ' (wraps midnight)' : '') +
              `\n`,
          },
          ...baseLlmMessages,
        ],
        temperature: aiSettings.openAiModel.trim().startsWith('o') ? undefined : 0.3,
        maxOutputTokens: 800,
        abortSignal: signal,
      });

      if (runSeqRef.current !== runId) return;

      const finalText = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');

      const assistantMessage = {
        role: 'assistant',
        content: finalText,
      } satisfies LlmChatMessage;
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

      await upsertAiAnalystConversationSnapshot({
        id: nextId,
        mission: 'loopSettings',
        messages: [{role: 'assistant', content: assistantMessage.content}],
      });

      setState({mode: 'mission', mission: 'loopSettings'});
      setProgressText('');

      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      if (runSeqRef.current !== runId) return;
      const msg = e?.name === 'AbortError' ? 'Stopped' : e?.message ? String(e.message) : 'Failed to run Loop Settings Advisor';
      if (msg !== 'Stopped') setErrorText(msg);
    } finally {
      if (runSeqRef.current === runId) {
        setIsBusy(false);
        setProgressText('');
      }
    }
  }, [provider, aiSettings.openAiModel, loopSettingsToolSystemPrompt, recordDataUsed, glucoseSettings.severeHypo, glucoseSettings.hypo, glucoseSettings.hyper, glucoseSettings.severeHyper, glucoseSettings.nightStartHour, glucoseSettings.nightEndHour]);

  const sendFollowUp = useCallback(async () => {
    if (!provider) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setErrorText(null);
    setIsBusy(true);
    const {runId, signal} = beginRun('Thinking…');

    // Always show the user's message immediately.
    const userUiMessage = {role: 'user', content: trimmed} satisfies LlmChatMessage;
    setUiMessages(prev => {
      const next = [...prev, userUiMessage];
      // Persist opportunistically (small + capped).
      void persistHistorySnapshot(next);
      return next;
    });

    let workingLlmMessages: LlmChatMessage[] = [...llmMessages, {role: 'user', content: trimmed}];
    setLlmMessages(workingLlmMessages);
    setInput('');

    try {
      const TOOL_TIMEOUT_MS = 60_000;
      const LLM_TIMEOUT_MS = 60_000;

      // Lightweight client-side router for count/range questions.
      // This prevents the model from choosing an irrelevant tool (e.g. hypo tool for hyper question).
      const rangeDays = parseRangeDaysFromText(trimmed);
      const wantsDates = wantsCountWithDates(trimmed);
      const isHyper = looksLikeHyperQuestion(trimmed) && !looksLikeHypoQuestion(trimmed);
      const isHypo = looksLikeHypoQuestion(trimmed) && !isHyper;

      if ((isHyper || isHypo) && rangeDays != null) {
        const kind = isHyper ? 'hyper' : 'hypo';
        const thresholdMgdl = isHyper ? glucoseSettings.hyper : glucoseSettings.hypo;
        setProgressText(`Running getGlycemicEvents…`);
        const toolResult = await withTimeout(
          runAiAnalystTool('getGlycemicEvents', {
            kind,
            rangeDays,
            thresholdMgdl,
            maxEvents: wantsDates ? 120 : 60,
          }),
          TOOL_TIMEOUT_MS,
          'getGlycemicEvents',
        );

        if (runSeqRef.current !== runId) return;

        recordDataUsed('getGlycemicEvents', toolResult);

        workingLlmMessages = [
          ...workingLlmMessages,
          {
            role: 'user',
            content: `Tool result (getGlycemicEvents):\n${JSON.stringify(toolResult)}`,
          },
        ];
        setLlmMessages(workingLlmMessages);
      }

      // For loop settings advisor, allow more tool calls
      const MAX_TOOL_CALLS = analystMode === 'loopSettings' ? 20 : 4;
      let toolCalls = 0;
      let finalText: string | null = null;

      // Select the appropriate system prompt based on analyst mode
      let systemPrompt: string;
      if (analystMode === 'loopSettings') {
        systemPrompt =
          LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT +
          '\n' +
          loopSettingsToolSystemPrompt +
          `\n\n## User glucose thresholds + night window (from app settings)\n` +
          `- Severe low (<=): ${glucoseSettings.severeHypo} mg/dL\n` +
          `- Low (<): ${glucoseSettings.hypo} mg/dL\n` +
          `- High (>): ${glucoseSettings.hyper} mg/dL\n` +
          `- Severe high (>=): ${glucoseSettings.severeHyper} mg/dL\n` +
          `- Overnight window (local): ${String(glucoseSettings.nightStartHour).padStart(2, '0')}:00–${String(glucoseSettings.nightEndHour).padStart(2, '0')}:00` +
          (glucoseSettings.nightStartHour > glucoseSettings.nightEndHour ? ' (wraps midnight)' : '') +
          `\n`;
      } else if (analystMode === 'userBehavior') {
        systemPrompt = USER_BEHAVIOR_SYSTEM_PROMPT;
      } else {
        systemPrompt = AI_ANALYST_SYSTEM_PROMPT + '\n' + toolSystemPrompt;
      }

      while (finalText == null) {
        const temp = aiSettings.openAiModel.trim().startsWith('o') ? undefined : 0.2;
        const res = await withTimeout(
          provider.sendChat({
            model: aiSettings.openAiModel,
            messages: [{role: 'system', content: systemPrompt}, ...workingLlmMessages],
            temperature: temp,
            maxOutputTokens: analystMode === 'loopSettings' ? 1200 : 800,
            abortSignal: signal,
          }),
          LLM_TIMEOUT_MS,
          'LLM response',
        );

        if (runSeqRef.current !== runId) return;

        const raw = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
        const env = tryParseToolEnvelope(raw);

        if (env?.type === 'tool_call' && toolCalls < MAX_TOOL_CALLS) {
          toolCalls += 1;
          console.log(`[AiAnalyst] Tool call #${toolCalls}: ${env.name}`, env.args);
          setProgressText(`Running ${env.name}…`);

          const toolResult = await withTimeout(
            runAiAnalystTool(env.name, env.args),
            TOOL_TIMEOUT_MS,
            `Tool ${env.name}`,
          );
          if (runSeqRef.current !== runId) return;
          recordDataUsed(env.name, toolResult);
          console.log(`[AiAnalyst] Tool ${env.name} result:`, toolResult.ok ? 'SUCCESS' : `FAILED: ${toolResult.error}`);

          workingLlmMessages = [
            ...workingLlmMessages,
            {role: 'assistant', content: raw},
            {
              role: 'user',
              content: `Tool result (${env.name}):\n${JSON.stringify(toolResult)}`,
            },
          ];
          setLlmMessages(workingLlmMessages);
          continue;
        }

        if (env?.type === 'tool_call' && toolCalls >= MAX_TOOL_CALLS) {
          console.warn(`[AiAnalyst] Tool call limit reached (${MAX_TOOL_CALLS})`);
          finalText =
            'I tried to fetch additional data, but hit the tool-call limit. Please try again (or ask for a smaller time range).';
        } else {
          finalText = env?.type === 'final' ? env.content : raw;
        }

        if (analystMode === 'loopSettings' && finalText) {
          const needsRewrite = looksLikeBasalRecommendation(finalText) || looksLikePlaceholderValues(finalText);
          if (needsRewrite) {
            console.warn('[LoopSettingsAdvisor] Rewriting response to enforce: no basal + no placeholders + include trend.');
            const rewriteRes = await withTimeout(
              provider.sendChat({
                model: aiSettings.openAiModel,
                messages: [
                  {role: 'system', content: systemPrompt},
                  ...workingLlmMessages,
                  {
                    role: 'user',
                    content:
                      `Rewrite your last answer with these constraints:\n` +
                      `1) Do NOT recommend basal schedule changes.\n` +
                      `2) Do NOT use placeholders like [X]/[Y]/[Your current...]. Use actual current values (call tools if needed).\n` +
                      `3) Include at least one numeric trend comparison (TIR, avg BG, CV) relevant to the user's issue.\n\n` +
                      `Return ONLY {"type":"final","content":"..."}.\n\n` +
                      `Your last answer:\n${finalText}`,
                  },
                ],
                temperature: aiSettings.openAiModel.trim().startsWith('o') ? undefined : 0.2,
                maxOutputTokens: 1200,
                abortSignal: signal,
              }),
              LLM_TIMEOUT_MS,
              'LLM rewrite',
            );

            if (runSeqRef.current !== runId) return;

            const rewriteRaw = rewriteRes.content?.trim?.() ? rewriteRes.content.trim() : String(rewriteRes.content ?? '');
            const rewriteEnv = tryParseToolEnvelope(rewriteRaw);
            finalText = rewriteEnv?.type === 'final' ? rewriteEnv.content : rewriteRaw;
          }
        }

        workingLlmMessages = [...workingLlmMessages, {role: 'assistant', content: finalText.trim()}];
        setLlmMessages(workingLlmMessages);
      }

      let finalOut = (finalText ?? '').trim();
      // Guardrail: avoid dead-end filler like "one moment" when nothing is happening.
      finalOut = finalOut.replace(/\s*(?:one moment(?: please)?\.?|one moment please\.?|hang on\.?|hold on\.?|just a moment\.?)+\s*$/i, '').trim();
      if (!finalOut) {
        finalOut = "If you'd like me to proceed, reply 'continue' and I'll run the next step.";
      }

      const assistantUiMessage = {
        role: 'assistant',
        content: finalOut,
      } satisfies LlmChatMessage;

      setUiMessages(prev => {
        const next = [...prev, assistantUiMessage];
        void persistHistorySnapshot(next);
        return next;
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      if (runSeqRef.current !== runId) return;
      const rawMsg = e?.message ? String(e.message) : 'Failed to send message';
      const msg = e?.name === 'AbortError' ? 'Stopped' : rawMsg;

      if (msg !== 'Stopped') {
        const isEmpty = /empty response from openai/i.test(msg);
        setErrorText(
          isEmpty
            ? 'OpenAI returned an empty response (often transient). Tap Send to retry.'
            : msg,
        );

        // Roll back the last user message so retry doesn't duplicate.
        setUiMessages(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last?.role === 'user' && last?.content === trimmed) {
            const next = prev.slice(0, -1);
            void persistHistorySnapshot(next);
            return next;
          }
          return prev;
        });
        setLlmMessages(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last?.role === 'user' && last?.content === trimmed) {
            return prev.slice(0, -1);
          }
          return prev;
        });

        // Restore text so the user can quickly retry.
        setInput(trimmed);
      }
    } finally {
      if (runSeqRef.current === runId) {
        setIsBusy(false);
        setProgressText('');
      }
    }
  }, [provider, input, llmMessages, aiSettings.openAiModel, toolSystemPrompt, loopSettingsToolSystemPrompt, analystMode, glucoseSettings.hyper, glucoseSettings.hypo, glucoseSettings.severeHypo, glucoseSettings.severeHyper, glucoseSettings.nightStartHour, glucoseSettings.nightEndHour, persistHistorySnapshot, recordDataUsed, beginRun]);

  const renderLocked = () => (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <Header>
        <Title>AI Analyst</Title>
        <Subtle>{makeDisclosureText()}</Subtle>
      </Header>

      <Card>
        <Text style={{color: theme.textColor, fontWeight: '700', fontSize: theme.typography.size.md}}>
          Token required
        </Text>
        <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.8)}}>
          To use AI Analyst, add your own LLM API key in Settings.
        </Text>
        <Button onPress={openSettings}>
          <ButtonText>Open Settings</ButtonText>
        </Button>
      </Card>
    </Container>
  );

  const renderDashboard = () => (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <ScrollView
        contentContainerStyle={{paddingBottom: theme.spacing.xl}}
        style={{flex: 1}}
      >
        <Header>
          <Title>AI Analyst</Title>
          <Subtle>{makeDisclosureText()}</Subtle>
        </Header>

        <Card>
          <CardRow
            onPress={async () => {
              await refreshHistory();
              setState({mode: 'history'});
            }}
            accessibilityRole="button"
            accessibilityLabel="Conversation History"
          >
            <CardIcon>
              <MaterialIcons name="history" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>Conversation history</CardTitle>
              <CardSubtitle>Saved text only (limited)</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          <CardRow
            testID={E2E_TEST_IDS.aiAnalyst.missionHypoDetective}
            onPress={() => startHypoDetective()}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Hypo Detective"
          >
            <CardIcon>
              <MaterialIcons name="trending-down" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>Hypo Detective</CardTitle>
              <CardSubtitle>Why do I keep going low?</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          <CardRow
            onPress={() => startUserBehavior()}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="User Behavior Tips"
          >
            <CardIcon>
              <MaterialIcons name="lightbulb-outline" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>User Behavior Tips</CardTitle>
              <CardSubtitle>Improve my daily habits</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          <CardRow
            onPress={() => startLoopSettingsAdvisor()}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Loop Settings Advisor"
          >
            <CardIcon>
              <MaterialIcons name="tune" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>Loop Settings Advisor</CardTitle>
              <CardSubtitle>Optimize targets, CR, ISF, DIA</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          {isBusy ? (
            <View style={{marginTop: 12, flexDirection: 'row', alignItems: 'center'}}>
              <ActivityIndicator />
              <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.8)}}>
                {progressText || 'Working…'}
              </Text>
            </View>
          ) : null}

          {!!errorText ? (
            <Text style={{marginTop: 10, color: theme.belowRangeColor}}>{errorText}</Text>
          ) : null}
        </Card>
      </ScrollView>
    </Container>
  );

  const renderHistory = () => (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Title>History</Title>
        <Subtle>Text-only snapshots. Old items are pruned automatically.</Subtle>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: theme.spacing.xl * 2}}>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
          <Pressable
            onPress={async () => {
              setHistoryBusy(true);
              try {
                await clearAiAnalystHistory();
                await refreshHistory();
              } finally {
                setHistoryBusy(false);
              }
            }}
            accessibilityRole="button"
          >
            <Text style={{color: theme.belowRangeColor}}>Clear history</Text>
          </Pressable>
        </View>

        {historyBusy ? (
          <View style={{marginTop: 12, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', alignItems: 'center'}}>
            <ActivityIndicator />
            <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.75)}}>Loading…</Text>
          </View>
        ) : null}

        {(historyItems ?? []).length === 0 && !historyBusy ? (
          <View style={{padding: theme.spacing.lg}}>
            <Text style={{color: addOpacity(theme.textColor, 0.8)}}>No saved conversations yet.</Text>
          </View>
        ) : null}

        {(historyItems ?? []).map((item: any) => (
          <Card key={item.id}>
            <CardRow
              onPress={() => setState({mode: 'historyDetail', id: item.id})}
              accessibilityRole="button"
              accessibilityLabel="Open conversation"
            >
              <CardIcon>
                <MaterialIcons name="chat" size={22} color={theme.accentColor} />
              </CardIcon>
              <View style={{flex: 1}}>
                <CardTitle>{item.title || 'Conversation'}</CardTitle>
                <CardSubtitle>
                  {item.mission ? `${item.mission} · ` : ''}
                  {new Date(item.updatedAt).toLocaleString()}
                </CardSubtitle>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
            </CardRow>
          </Card>
        ))}
      </ScrollView>

      <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
        <Pressable onPress={() => setState({mode: 'dashboard'})} accessibilityRole="button">
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back</Text>
        </Pressable>
      </View>
    </Container>
  );

  const renderHistoryDetail = (id: string) => {
    const item = (historyItems ?? []).find((x: any) => x.id === id);
    const messages = (item?.messages ?? []) as Array<{role: 'user' | 'assistant'; content: string}>;
    return (
      <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
          <Title>{item?.title || 'Conversation'}</Title>
          <Subtle>{item?.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}</Subtle>
        </View>

        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: theme.spacing.xl * 2}}>
          {messages.map((m, idx) => (
            <MessageBubble key={String(idx)} role={m.role === 'user' ? 'user' : 'assistant'}>
              {m.role === 'assistant' ? (
                <Markdown
                  markdownit={markdownItInstance}
                  rules={selectableMarkdownRules}
                  style={markdownStyle}
                >
                  {m.content}
                </Markdown>
              ) : (
                <MessageText selectable>{m.content}</MessageText>
              )}
            </MessageBubble>
          ))}
        </ScrollView>

        <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm}}>
          <Pressable
            onPress={() => setState({mode: 'history'})}
            accessibilityRole="button"
          >
            <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back to history</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              setHistoryBusy(true);
              try {
                await deleteAiAnalystConversation(id);
                await refreshHistory();
                setState({mode: 'history'});
              } finally {
                setHistoryBusy(false);
              }
            }}
            accessibilityRole="button"
          >
            <Text style={{color: theme.belowRangeColor}}>Delete conversation</Text>
          </Pressable>
        </View>
      </Container>
    );
  };

  const renderMission = () => (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
          <Pressable
            testID={E2E_TEST_IDS.aiAnalyst.backButton}
            onPress={() => {
              Keyboard.dismiss();
              setUiMessages([]);
              setLlmMessages([]);
              setState({mode: 'dashboard'});
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to AI Analyst"
            hitSlop={10}
            style={{alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center'}}
          >
            <MaterialIcons name="arrow-back" size={18} color={addOpacity(theme.textColor, 0.8)} />
            <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>Back</Text>
          </Pressable>

          <View
            style={{
              marginTop: theme.spacing.sm,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Title>{getMissionTitle(state.mode === 'mission' ? state.mission : undefined)}</Title>
              <Subtle>{makeDisclosureText()}</Subtle>
            </View>

            <Pressable
              onPress={exportSession}
              accessibilityRole="button"
              accessibilityLabel="Export discussion"
              hitSlop={10}
              style={{flexDirection: 'row', alignItems: 'center'}}
            >
              <MaterialIcons name="download" size={18} color={addOpacity(theme.textColor, 0.8)} />
              <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>Export</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{flex: 1, marginTop: theme.spacing.sm}}
          contentContainerStyle={{paddingBottom: theme.spacing.xl * 3}}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {uiMessages.map((m, idx) => (
            <MessageBubble key={String(idx)} role={m.role === 'user' ? 'user' : 'assistant'}>
              {m.role === 'assistant' ? (
                <Markdown
                  markdownit={markdownItInstance}
                  rules={selectableMarkdownRules}
                  style={markdownStyle}
                >
                  {m.content}
                </Markdown>
              ) : (
                <MessageText selectable>{m.content}</MessageText>
              )}
            </MessageBubble>
          ))}

          {isBusy ? (
            <View style={{marginTop: 6, marginLeft: 12, flexDirection: 'row', alignItems: 'center'}}>
              <ActivityIndicator />
              <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.75)}}>
                {progressText ? progressText : 'Thinking…'}
              </Text>
              <Pressable
                onPress={cancelActiveRun}
                accessibilityRole="button"
                accessibilityLabel="Stop"
                style={{marginLeft: 'auto', marginRight: 12, paddingVertical: 6, paddingHorizontal: 10}}
              >
                <Text style={{color: theme.belowRangeColor}}>Stop</Text>
              </Pressable>
            </View>
          ) : null}

          {!!errorText ? (
            <Text style={{marginTop: 10, marginLeft: 12, color: theme.belowRangeColor}}>
              {errorText}
            </Text>
          ) : null}
        </ScrollView>

        <InputRow>
          <ChatInput
            testID={E2E_TEST_IDS.aiAnalyst.chatInput}
            value={input}
            onChangeText={setInput}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50)}
            placeholder="Ask a follow-up…"
            placeholderTextColor={addOpacity(theme.textColor, 0.5)}
            editable
          />
          <SendButton
            testID={E2E_TEST_IDS.aiAnalyst.sendButton}
            onPress={sendFollowUp}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <MaterialIcons name="send" size={18} color={theme.white} />
          </SendButton>
        </InputRow>

        <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setUiMessages([]);
              setLlmMessages([]);
              setState({mode: 'dashboard'});
            }}
            accessibilityRole="button"
          >
            <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back to missions</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Container>
  );

  if (!aiSettings.enabled) {
    // If user disabled feature, keep tab visible but show a clear message.
    return (
      <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
        <Header>
          <Title>AI Analyst</Title>
          <Subtle>Disabled in Settings.</Subtle>
        </Header>
        <Card>
          <Text style={{color: theme.textColor}}>
            Enable AI Analyst in Settings to use this tab.
          </Text>
          <Button onPress={openSettings}>
            <ButtonText>Open Settings</ButtonText>
          </Button>
        </Card>
      </Container>
    );
  }

  if (!hasKey) return renderLocked();
  if (state.mode === 'history') return renderHistory();
  if (state.mode === 'historyDetail') return renderHistoryDetail(state.id);
  if (state.mode === 'mission') return renderMission();
  return renderDashboard();
};

export default AiAnalyst;
