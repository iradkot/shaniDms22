/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

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
  onContinue: (id: string) => void;
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
  onContinue,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Title>{tr(language, 'ai.history')}</Title>
        <Subtle>{tr(language, 'ai.historySubtitle')}</Subtle>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: theme.spacing.xl * 2}}>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
          <Pressable onPress={onClearHistory} accessibilityRole="button">
            <Text style={{color: theme.belowRangeColor}}>{tr(language, 'ai.clearHistory')}</Text>
          </Pressable>
        </View>

        {historyBusy ? (
          <View style={{marginTop: 12, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', alignItems: 'center'}}>
            <ActivityIndicator />
            <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.75)}}>{tr(language, 'ai.loading')}</Text>
          </View>
        ) : null}

        {(historyItems ?? []).length === 0 && !historyBusy ? (
          <View style={{padding: theme.spacing.lg}}>
            <Text style={{color: addOpacity(theme.textColor, 0.8)}}>{tr(language, 'ai.noSavedConversations')}</Text>
          </View>
        ) : null}

        {(historyItems ?? []).map((item: any) => (
          <Card key={item.id}>
            <CardRow
              onPress={() => onOpenDetail(item.id)}
              accessibilityRole="button"
              accessibilityLabel={tr(language, 'ai.conversation')}
            >
              <CardIcon>
                <MaterialIcons name="chat" size={22} color={theme.accentColor} />
              </CardIcon>
              <View style={{flex: 1}}>
                <CardTitle>{item.title || tr(language, 'ai.conversation')}</CardTitle>
                <CardSubtitle>
                  {item.mission ? `${item.mission} · ` : ''}
                  {new Date(item.updatedAt).toLocaleString()}
                </CardSubtitle>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={addOpacity(theme.textColor, 0.5)} />
            </CardRow>
            <View style={{marginTop: 8, alignItems: 'flex-start'}}>
              <Pressable
                onPress={() => onContinue(item.id)}
                accessibilityRole="button"
                accessibilityLabel={tr(language, 'ai.continueConversation')}
                style={{paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.35), backgroundColor: addOpacity(theme.accentColor, 0.08)}}
              >
                <Text style={{color: theme.accentColor, fontWeight: '700', fontSize: 12}}>{tr(language, 'ai.continueConversation')}</Text>
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>{tr(language, 'ai.back')}</Text>
        </Pressable>
      </View>
    </Container>
  );
};

export default HistoryScreen;
