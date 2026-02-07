import React from 'react';
import {Text} from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';

import {DISCLOSURE_TEXT} from './constants';
import {useAiAnalystEngine} from './hooks/useAiAnalystEngine';
import DashboardScreen from './screens/DashboardScreen';
import HistoryScreen from './screens/HistoryScreen';
import HistoryDetailScreen from './screens/HistoryDetailScreen';
import MissionChatScreen from './screens/MissionChatScreen';
import {Container, Header, Title, Subtle, Card, Button, ButtonText} from './styled';

// ---------------------------------------------------------------------------
// Component – thin screen router
// ---------------------------------------------------------------------------

const AiAnalyst: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const engine = useAiAnalystEngine();

  // ── Disabled guard ────────────────────────────────────────────────────
  if (!engine.isEnabled) {
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
          <Button onPress={engine.openSettings}>
            <ButtonText>Open Settings</ButtonText>
          </Button>
        </Card>
      </Container>
    );
  }

  // ── Locked (no API key) ───────────────────────────────────────────────
  if (!engine.hasKey) {
    return (
      <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
        <Header>
          <Title>AI Analyst</Title>
          <Subtle>{DISCLOSURE_TEXT}</Subtle>
        </Header>
        <Card>
          <Text style={{color: theme.textColor, fontWeight: '700', fontSize: theme.typography.size.md}}>
            Token required
          </Text>
          <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.8)}}>
            To use AI Analyst, add your own LLM API key in Settings.
          </Text>
          <Button onPress={engine.openSettings}>
            <ButtonText>Open Settings</ButtonText>
          </Button>
        </Card>
      </Container>
    );
  }

  // ── History list ──────────────────────────────────────────────────────
  if (engine.state.mode === 'history') {
    return (
      <HistoryScreen
        historyItems={engine.historyItems}
        historyBusy={engine.historyBusy}
        onBack={() => engine.setState({mode: 'dashboard'})}
        onClearHistory={engine.clearHistory}
        onOpenDetail={id => engine.setState({mode: 'historyDetail', id})}
      />
    );
  }

  // ── History detail ────────────────────────────────────────────────────
  if (engine.state.mode === 'historyDetail') {
    return (
      <HistoryDetailScreen
        historyItems={engine.historyItems}
        detailId={engine.state.id}
        markdown={engine.markdown}
        onBack={() => engine.setState({mode: 'history'})}
        onDelete={engine.deleteConversation}
      />
    );
  }

  // ── Active mission (chat) ─────────────────────────────────────────────
  if (engine.state.mode === 'mission') {
    return (
      <MissionChatScreen
        mission={engine.state.mission}
        uiMessages={engine.uiMessages}
        isBusy={engine.isBusy}
        progressText={engine.progressText}
        errorText={engine.errorText}
        input={engine.input}
        setInput={engine.setInput}
        onSend={engine.sendFollowUp}
        onCancel={engine.cancelActiveRun}
        onBack={engine.goBackToDashboard}
        onExport={engine.exportSession}
        scrollRef={engine.scrollRef}
        markdown={engine.markdown}
      />
    );
  }

  // ── Dashboard (default) ───────────────────────────────────────────────
  return (
    <DashboardScreen
      onStartHypoDetective={engine.startHypoDetective}
      onStartUserBehavior={engine.startUserBehavior}
      onStartLoopSettings={engine.startLoopSettingsAdvisor}
      onOpenHistory={engine.openHistory}
      isBusy={engine.isBusy}
      progressText={engine.progressText}
      errorText={engine.errorText}
    />
  );
};

export default AiAnalyst;
