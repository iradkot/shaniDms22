import React from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';

import {DISCLOSURE_TEXT} from '../constants';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {
import {useAppTheme} from 'app/hooks/useAppTheme';
  Container,
  Header,
  Title,
  Subtle,
  Card,
  CardRow,
  CardIcon,
  CardTitle,
  CardSubtitle,
} from '../styled';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardScreenProps {
  onStartOpenChat: () => void;
  onStartHypoDetective: () => void;
  onStartUserBehavior: () => void;
  onStartLoopSettings: () => void;
  onOpenHistory: () => void;
  isBusy: boolean;
  progressText: string;
  errorText: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onStartOpenChat,
  onStartHypoDetective,
  onStartUserBehavior,
  onStartLoopSettings,
  onOpenHistory,
  isBusy,
  progressText,
  errorText,
}) => {
  const theme = useAppTheme();
  const {language} = useAppLanguage();

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <ScrollView contentContainerStyle={{paddingBottom: theme.spacing.xl}} style={{flex: 1}}>
        <Header>
          <Title>{tr(language, 'ai.title')}</Title>
          <Subtle>{DISCLOSURE_TEXT}</Subtle>
        </Header>

        <Card>
          {/* History */}
          <CardRow
            onPress={onOpenHistory}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.conversationHistory')}
          >
            <CardIcon>
              <MaterialIcons name="history" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>{tr(language, 'ai.conversationHistory')}</CardTitle>
              <CardSubtitle>{tr(language, 'ai.savedTextOnly')}</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          {/* Open chat */}
          <CardRow
            onPress={onStartOpenChat}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.openChat')}
          >
            <CardIcon>
              <MaterialIcons name="chat" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>{tr(language, 'ai.openChat')}</CardTitle>
              <CardSubtitle>{tr(language, 'ai.openChatSubtitle')}</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          {/* Hypo Detective */}
          <CardRow
            testID={E2E_TEST_IDS.aiAnalyst.missionHypoDetective}
            onPress={onStartHypoDetective}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.hypoDetective')}
          >
            <CardIcon>
              <MaterialIcons name="trending-down" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>{tr(language, 'ai.hypoDetective')}</CardTitle>
              <CardSubtitle>{tr(language, 'ai.hypoDetectiveSubtitle')}</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          {/* User Behavior Tips */}
          <CardRow
            onPress={onStartUserBehavior}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.userBehaviorTips')}
          >
            <CardIcon>
              <MaterialIcons name="lightbulb-outline" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>{tr(language, 'ai.userBehaviorTips')}</CardTitle>
              <CardSubtitle>{tr(language, 'ai.userBehaviorTipsSubtitle')}</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          <View style={{height: theme.spacing.md}} />

          {/* Loop Settings Advisor */}
          <CardRow
            onPress={onStartLoopSettings}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.loopSettingsAdvisor')}
          >
            <CardIcon>
              <MaterialIcons name="tune" size={22} color={theme.accentColor} />
            </CardIcon>
            <View style={{flex: 1}}>
              <CardTitle>{tr(language, 'ai.loopSettingsAdvisor')}</CardTitle>
              <CardSubtitle>{tr(language, 'ai.loopSettingsAdvisorSubtitle')}</CardSubtitle>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
          </CardRow>

          {isBusy ? (
            <View style={{marginTop: 12, flexDirection: 'row', alignItems: 'center'}}>
              <ActivityIndicator />
              <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.8)}}>
                {progressText || tr(language, 'ai.working')}
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
};

export default DashboardScreen;
