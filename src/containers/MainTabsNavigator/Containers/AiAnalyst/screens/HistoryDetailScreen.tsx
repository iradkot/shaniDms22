import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import Markdown from 'react-native-markdown-display';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';

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
  const item = (historyItems ?? []).find((x: any) => x.id === detailId);
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
              <Markdown markdownit={markdown.instance} rules={markdown.rules} style={markdown.style}>
                {m.content}
              </Markdown>
            ) : (
              <MessageText selectable>{m.content}</MessageText>
            )}
          </MessageBubble>
        ))}
      </ScrollView>

      <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm}}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back to history</Text>
        </Pressable>

        <Pressable onPress={() => onDelete(detailId)} accessibilityRole="button">
          <Text style={{color: theme.belowRangeColor}}>Delete conversation</Text>
        </Pressable>
      </View>
    </Container>
  );
};

export default HistoryDetailScreen;
