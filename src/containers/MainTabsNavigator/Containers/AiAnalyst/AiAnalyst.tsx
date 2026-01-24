import React, {useCallback, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';

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
  | {mode: 'mission'; mission: MissionKey};

function makeDisclosureText() {
  return 'AI Analyst sends your diabetes data (BG, treatments, device status) to an external LLM provider to generate insights.';
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

  const [messages, setMessages] = useState<LlmChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const provider = useMemo(() => {
    try {
      return createLlmProvider(aiSettings);
    } catch {
      return null;
    }
  }, [aiSettings]);

  const openSettings = useCallback(() => {
    navigation.navigate(SCREEN_NAMES.SETTINGS_TAB_SCREEN);
  }, [navigation]);

  const startHypoDetective = useCallback(async () => {
    if (!provider) return;
    setErrorText(null);
    setIsBusy(true);
    setProgressText('Starting…');
    setMessages([]);
    setInput('');

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

      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [
          {role: 'system', content: AI_ANALYST_SYSTEM_PROMPT},
          {role: 'user', content: userPrompt},
        ],
        temperature: 0.2,
        maxOutputTokens: 800,
      });

      setMessages([
        {role: 'assistant', content: res.content.trim()},
      ]);

      setState({mode: 'mission', mission: 'hypoDetective'});
      setProgressText('');

      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      setErrorText(e?.message ? String(e.message) : 'Failed to run Hypo Detective');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  }, [provider, glucoseSettings.severeHypo, aiSettings.openAiModel]);

  const sendFollowUp = useCallback(async () => {
    if (!provider) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setErrorText(null);
    setIsBusy(true);

    const nextMessages: LlmChatMessage[] = [
      ...messages,
      {role: 'user', content: trimmed},
    ];

    setMessages(nextMessages);
    setInput('');

    try {
      const res = await provider.sendChat({
        model: aiSettings.openAiModel,
        messages: [{role: 'system', content: AI_ANALYST_SYSTEM_PROMPT}, ...nextMessages],
        temperature: 0.2,
        maxOutputTokens: 800,
      });

      setMessages(prev => [...prev, {role: 'assistant', content: res.content.trim()}]);
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 50);
    } catch (e: any) {
      setErrorText(e?.message ? String(e.message) : 'Failed to send message');
    } finally {
      setIsBusy(false);
    }
  }, [provider, input, messages, aiSettings.openAiModel]);

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

  const renderMission = () => (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Title>Hypo Detective</Title>
        <Subtle>{makeDisclosureText()}</Subtle>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{flex: 1, marginTop: theme.spacing.sm}}
        contentContainerStyle={{paddingBottom: theme.spacing.lg}}
      >
        {messages.map((m, idx) => (
          <MessageBubble key={String(idx)} role={m.role === 'user' ? 'user' : 'assistant'}>
            <MessageText>{m.content}</MessageText>
          </MessageBubble>
        ))}

        {isBusy ? (
          <View style={{marginTop: 6, marginLeft: 12, flexDirection: 'row', alignItems: 'center'}}>
            <ActivityIndicator />
            <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.75)}}>
              Thinking…
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
            setMessages([]);
            setState({mode: 'dashboard'});
          }}
          accessibilityRole="button"
        >
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back to missions</Text>
        </Pressable>
      </View>
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
  if (state.mode === 'mission') return renderMission();
  return renderDashboard();
};

export default AiAnalyst;
