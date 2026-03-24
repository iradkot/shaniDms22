import React, {useMemo} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import Markdown from 'react-native-markdown-display';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

import {MarkdownConfig} from '../types';
import {Container, Title, Subtle, MessageBubble, MessageText} from '../styled';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HistoryDetailScreenProps {
  historyItems: any[];
  detailId: string;
  markdown: MarkdownConfig;
  onBack: () => void;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HistoryDetailScreen: React.FC<HistoryDetailScreenProps> = ({
  historyItems,
  detailId,
  markdown,
  onBack,
  onDelete,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isHebrew = language === 'he';
  const textAlign: 'left' | 'right' = isHebrew ? 'right' : 'left';
  const writingDirection: 'ltr' | 'rtl' = isHebrew ? 'rtl' : 'ltr';
  const item = (historyItems ?? []).find((x: any) => x.id === detailId);
  const messages = (item?.messages ?? []) as Array<{role: 'user' | 'assistant'; content: string}>;

  const markdownStyle = useMemo(
    () => ({
      ...markdown.style,
      body: {...(markdown.style as any).body, textAlign, writingDirection, lineHeight: 24},
      paragraph: {...(markdown.style as any).paragraph, textAlign, writingDirection, marginBottom: 8, lineHeight: 24},
      text: {...(markdown.style as any).text, textAlign, writingDirection, lineHeight: 24},
      bullet_list: {...(markdown.style as any).bullet_list, marginVertical: 4},
      ordered_list: {...(markdown.style as any).ordered_list, marginVertical: 4},
      list_item: {...(markdown.style as any).list_item, marginVertical: 2, lineHeight: 24},
      strong: {...(markdown.style as any).strong, textAlign, writingDirection, lineHeight: 24},
      em: {...(markdown.style as any).em, textAlign, writingDirection, lineHeight: 24},
    }),
    [markdown.style, textAlign, writingDirection],
  );

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Title>{item?.title || tr(language, 'ai.conversation')}</Title>
        <Subtle>{item?.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}</Subtle>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: theme.spacing.xl * 2}}>
        {messages.map((m, idx) => (
          <MessageBubble key={String(idx)} role={m.role === 'user' ? 'user' : 'assistant'}>
            {m.role === 'assistant' ? (
              <Markdown markdownit={markdown.instance} rules={markdown.rules} style={markdownStyle}>
                {m.content}
              </Markdown>
            ) : (
              <MessageText selectable style={{textAlign, writingDirection}}>{m.content}</MessageText>
            )}
          </MessageBubble>
        ))}
      </ScrollView>

      <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm}}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>{tr(language, 'ai.backToHistory')}</Text>
        </Pressable>

        <Pressable onPress={() => onDelete(detailId)} accessibilityRole="button">
          <Text style={{color: theme.belowRangeColor}}>{tr(language, 'ai.deleteConversation')}</Text>
        </Pressable>
      </View>
    </Container>
  );
};

export default HistoryDetailScreen;
