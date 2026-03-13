import React from 'react';
import {Text} from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

import {DISCLOSURE_TEXT} from './constants';
import {useAiAnalystEngine} from './hooks/useAiAnalystEngine';
import DashboardScreen from './screens/DashboardScreen';
import HistoryScreen from './screens/HistoryScreen';
import HistoryDetailScreen from './screens/HistoryDetailScreen';
import MissionChatScreen from './screens/MissionChatScreen';
import EvidenceScreen from './screens/EvidenceScreen';
import {Container, Header, Title, Subtle, Card, Button, ButtonText} from './styled';

const AiAnalyst: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const engine = useAiAnalystEngine();

  if (!engine.isEnabled) {
    return (
      <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
        <Header>
          <Title>{tr(language, 'ai.title')}</Title>
          <Subtle>{tr(language, 'ai.disabledInSettings')}</Subtle>
        </Header>
        <Card>
          <Text style={{color: theme.textColor}}>{tr(language, 'ai.enableInSettings')}</Text>
          <Button onPress={engine.openSettings}>
            <ButtonText>{tr(language, 'ai.openSettings')}</ButtonText>
          </Button>
        </Card>
      </Container>
    );
  }

  if (!engine.hasKey) {
    return (
      <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
        <Header>
          <Title>{tr(language, 'ai.title')}</Title>
          <Subtle>{DISCLOSURE_TEXT}</Subtle>
        </Header>
        <Card>
          <Text style={{color: theme.textColor, fontWeight: '700', fontSize: theme.typography.size.md}}>
            {tr(language, 'ai.tokenRequired')}
          </Text>
          <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.8)}}>
            {tr(language, 'ai.addKeyHint')}
          </Text>
          <Button onPress={engine.openSettings}>
            <ButtonText>{tr(language, 'ai.openSettings')}</ButtonText>
          </Button>
        </Card>
      </Container>
    );
  }

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

  if (engine.state.mode === 'evidence') {
    return <EvidenceScreen request={engine.state.request} onBack={engine.backToMissionFromEvidence} />;
  }

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
        onOpenEvidence={engine.openEvidence}
        scrollRef={engine.scrollRef}
        markdown={engine.markdown}
      />
    );
  }

  return (
    <DashboardScreen
      onStartOpenChat={engine.startOpenChat}
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
