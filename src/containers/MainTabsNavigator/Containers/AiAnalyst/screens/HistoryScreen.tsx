import React from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';

import {
  Container,
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

export interface HistoryScreenProps {
  historyItems: any[];
  historyBusy: boolean;
  onBack: () => void;
  onClearHistory: () => void;
  onOpenDetail: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HistoryScreen: React.FC<HistoryScreenProps> = ({
  historyItems,
  historyBusy,
  onBack,
  onClearHistory,
  onOpenDetail,
}) => {
  const theme = useTheme() as ThemeType;

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Title>History</Title>
        <Subtle>Text-only snapshots. Old items are pruned automatically.</Subtle>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: theme.spacing.xl * 2}}>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
          <Pressable onPress={onClearHistory} accessibilityRole="button">
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
              onPress={() => onOpenDetail(item.id)}
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
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back</Text>
        </Pressable>
      </View>
    </Container>
  );
};

export default HistoryScreen;
