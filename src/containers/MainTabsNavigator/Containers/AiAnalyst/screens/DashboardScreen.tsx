import React from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';

import {DISCLOSURE_TEXT} from '../constants';
import {
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
  onStartHypoDetective,
  onStartUserBehavior,
  onStartLoopSettings,
  onOpenHistory,
  isBusy,
  progressText,
  errorText,
}) => {
  const theme = useTheme() as ThemeType;

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <ScrollView contentContainerStyle={{paddingBottom: theme.spacing.xl}} style={{flex: 1}}>
        <Header>
          <Title>AI Analyst</Title>
          <Subtle>{DISCLOSURE_TEXT}</Subtle>
        </Header>

        <Card>
          {/* History */}
          <CardRow
            onPress={onOpenHistory}
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

          {/* Hypo Detective */}
          <CardRow
            testID={E2E_TEST_IDS.aiAnalyst.missionHypoDetective}
            onPress={onStartHypoDetective}
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

          {/* User Behavior Tips */}
          <CardRow
            onPress={onStartUserBehavior}
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

          {/* Loop Settings Advisor */}
          <CardRow
            onPress={onStartLoopSettings}
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
};

export default DashboardScreen;
