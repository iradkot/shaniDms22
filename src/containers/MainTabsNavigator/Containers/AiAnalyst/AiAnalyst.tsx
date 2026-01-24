import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

import {AI_ANALYST_SYSTEM_PROMPT} from 'app/services/llm/systemPrompts';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';
import {AiAnalystToolName, runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
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

type MissionKey = 'hypoDetective';

type ScreenState =
  | {mode: 'locked'}
  | {mode: 'dashboard'}
  | {mode: 'history'}
  | {mode: 'historyDetail'; id: string}
  | {mode: 'mission'; mission: MissionKey};

type ToolEnvelope =
  | {type: 'tool_call'; name: AiAnalystToolName; args?: any}
  | {type: 'final'; content: string};

function tryParseToolEnvelope(text: string): ToolEnvelope | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj?.type === 'tool_call' && typeof obj?.name === 'string') {
      return {type: 'tool_call', name: obj.name, args: obj.args};
    }
    if (obj?.type === 'final' && typeof obj?.content === 'string') {
      return {type: 'final', content: obj.content};
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
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

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

  const startHypoDetective = useCallback(async () => {
    if (!provider) return;
    setErrorText(null);
    setIsBusy(true);
    setProgressText('Starting…');
    setUiMessages([]);
    setLlmMessages([]);
    setInput('');
    const nextId = makeConversationId();
    setConversationId(nextId);

    try {
      const {contextJson} = await buildHypoDetectiveContext({
        rangeDays: 60,
        lowThreshold: glucoseSettings.severeHypo,
        maxEvents: 12,
        onProgress: s => setProgressText(s),
      });

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

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [
          {role: 'system', content: AI_ANALYST_SYSTEM_PROMPT + '\n' + toolSystemPrompt},
          {role: 'user', content: userPrompt},
        ],
        temperature: 0.2,
        maxOutputTokens: 800,
      });

      const assistantMessage = {role: 'assistant', content: res.content.trim()} satisfies LlmChatMessage;
      setUiMessages([assistantMessage]);
      setLlmMessages([...baseLlmMessages, assistantMessage]);

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
      setErrorText(e?.message ? String(e.message) : 'Failed to run Hypo Detective');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  }, [provider, glucoseSettings.severeHypo, aiSettings.openAiModel, toolSystemPrompt]);

  const sendFollowUp = useCallback(async () => {
    if (!provider) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setErrorText(null);
    setIsBusy(true);

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
        const toolResult = await runAiAnalystTool('getGlycemicEvents', {
          kind,
          rangeDays,
          thresholdMgdl,
          maxEvents: wantsDates ? 120 : 60,
        });

        workingLlmMessages = [
          ...workingLlmMessages,
          {
            role: 'user',
            content: `Tool result (getGlycemicEvents):\n${JSON.stringify(toolResult)}`,
          },
        ];
        setLlmMessages(workingLlmMessages);
      }

      const MAX_TOOL_CALLS = 2;
      let toolCalls = 0;
      let finalText: string | null = null;

      while (finalText == null) {
        const res = await provider.sendChat({
          model: aiSettings.openAiModel,
          messages: [
            {role: 'system', content: AI_ANALYST_SYSTEM_PROMPT + '\n' + toolSystemPrompt},
            ...workingLlmMessages,
          ],
          temperature: 0.2,
          maxOutputTokens: 800,
        });

        const raw = res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
        const env = tryParseToolEnvelope(raw);

        if (env?.type === 'tool_call' && toolCalls < MAX_TOOL_CALLS) {
          toolCalls += 1;
          setProgressText(`Running ${env.name}…`);

          const toolResult = await runAiAnalystTool(env.name, env.args);

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

        finalText = env?.type === 'final' ? env.content : raw;
        workingLlmMessages = [...workingLlmMessages, {role: 'assistant', content: finalText.trim()}];
        setLlmMessages(workingLlmMessages);
      }

      const assistantUiMessage = {
        role: 'assistant',
        content: (finalText ?? '').trim(),
      } satisfies LlmChatMessage;

      setUiMessages(prev => {
        const next = [...prev, assistantUiMessage];
        void persistHistorySnapshot(next);
        return next;
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      setErrorText(e?.message ? String(e.message) : 'Failed to send message');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  }, [provider, input, llmMessages, aiSettings.openAiModel, toolSystemPrompt]);

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
              <MessageText selectable>{m.content}</MessageText>
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
          <Title>Hypo Detective</Title>
          <Subtle>{makeDisclosureText()}</Subtle>
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
            editable={!isBusy}
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
