import React, {RefObject} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Markdown from 'react-native-markdown-display';
import Clipboard from '@react-native-clipboard/clipboard';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';
import {LlmChatMessage} from 'app/services/llm/llmTypes';

import {EvidenceRequest, MissionKey, MarkdownConfig} from '../types';
import {extractEvidenceLinks, stripEvidenceTags} from '../helpers/evidenceLinks';
import {DISCLOSURE_TEXT, SCROLL_DELAY_MS, getMissionTitle} from '../constants';
import {
  Container,
  Title,
  Subtle,
  MessageBubble,
  MessageText,
  InputRow,
  ChatInput,
  SendButton,
} from '../styled';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MissionChatScreenProps {
  mission: MissionKey | undefined;
  uiMessages: LlmChatMessage[];
  isBusy: boolean;
  progressText: string;
  errorText: string | null;
  input: string;
  setInput: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onBack: () => void;
  onExport: () => void;
  onOpenEvidence: (request: EvidenceRequest) => void;
  scrollRef: RefObject<ScrollView | null>;
  markdown: MarkdownConfig;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MissionChatScreen: React.FC<MissionChatScreenProps> = ({
  mission,
  uiMessages,
  isBusy,
  progressText,
  errorText,
  input,
  setInput,
  onSend,
  onCancel,
  onBack,
  onExport,
  onOpenEvidence,
  scrollRef,
  markdown,
}) => {
  const theme = useTheme() as ThemeType;

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text || '');
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied to clipboard', ToastAndroid.SHORT);
    }
  };

  return (
    <Container testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header row */}
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
          <Pressable
            testID={E2E_TEST_IDS.aiAnalyst.backButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to AI Analyst"
            hitSlop={10}
            style={{alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center'}}
          >
            <MaterialIcons name="arrow-back" size={18} color={addOpacity(theme.textColor, 0.8)} />
            <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>Back</Text>
          </Pressable>

          <View
            style={{
              marginTop: theme.spacing.sm,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Title>{getMissionTitle(mission)}</Title>
              <Subtle>{DISCLOSURE_TEXT}</Subtle>
            </View>

            <Pressable
              onPress={onExport}
              accessibilityRole="button"
              accessibilityLabel="Export discussion"
              hitSlop={10}
              style={{flexDirection: 'row', alignItems: 'center'}}
            >
              <MaterialIcons name="download" size={18} color={addOpacity(theme.textColor, 0.8)} />
              <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>Export</Text>
            </Pressable>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{flex: 1, marginTop: theme.spacing.sm}}
          contentContainerStyle={{paddingBottom: theme.spacing.xl * 3}}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {uiMessages.map((m, idx) => {
            const evidenceLinks = m.role === 'assistant' ? extractEvidenceLinks(m.content) : [];
            const visibleText = m.role === 'assistant' ? stripEvidenceTags(m.content) : m.content;

            return (
              <MessageBubble key={String(idx)} role={m.role === 'user' ? 'user' : 'assistant'}>
                {m.role === 'assistant' ? (
                  <>
                    <Markdown markdownit={markdown.instance} rules={markdown.rules} style={markdown.style}>
                      {visibleText}
                    </Markdown>
                    <Pressable
                      onPress={() => copyToClipboard(visibleText)}
                      accessibilityRole="button"
                      accessibilityLabel="Copy response"
                      style={{alignSelf: 'flex-end', marginTop: 6, flexDirection: 'row', alignItems: 'center'}}
                    >
                      <MaterialIcons name="content-copy" size={14} color={addOpacity(theme.textColor, 0.7)} />
                      <Text style={{marginLeft: 4, color: addOpacity(theme.textColor, 0.7), fontSize: 12}}>Copy</Text>
                    </Pressable>
                  </>
                ) : (
                  <MessageText selectable>{visibleText}</MessageText>
                )}

                {evidenceLinks.length > 0 ? (
                  <View style={{marginTop: theme.spacing.sm, gap: theme.spacing.xs}}>
                    {evidenceLinks.map((link, linkIdx) => (
                      <Pressable
                        key={`${link.request.kind}-${link.request.rangeDays}-${linkIdx}`}
                        onPress={() => onOpenEvidence(link.request)}
                        style={{
                          borderWidth: 1,
                          borderColor: addOpacity(theme.accentColor, 0.45),
                          borderRadius: 10,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          alignSelf: 'flex-start',
                          backgroundColor: addOpacity(theme.accentColor, 0.12),
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={link.label}
                      >
                        <Text style={{color: theme.textColor, fontWeight: '600'}}>{link.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </MessageBubble>
            );
          })}

          {isBusy ? (
            <View style={{marginTop: 6, marginLeft: 12, flexDirection: 'row', alignItems: 'center'}}>
              <ActivityIndicator />
              <Text style={{marginLeft: 10, color: addOpacity(theme.textColor, 0.75)}}>
                {progressText ? progressText : 'Thinking…'}
              </Text>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Stop"
                style={{marginLeft: 'auto', marginRight: 12, paddingVertical: 6, paddingHorizontal: 10}}
              >
                <Text style={{color: theme.belowRangeColor}}>Stop</Text>
              </Pressable>
            </View>
          ) : null}

          {!!errorText ? (
            <Text style={{marginTop: 10, marginLeft: 12, color: theme.belowRangeColor}}>
              {errorText}
            </Text>
          ) : null}
        </ScrollView>

        {/* Input */}
        <InputRow>
          <ChatInput
            testID={E2E_TEST_IDS.aiAnalyst.chatInput}
            value={input}
            onChangeText={setInput}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), SCROLL_DELAY_MS)}
            placeholder="Ask anything…"
            placeholderTextColor={addOpacity(theme.textColor, 0.5)}
            editable
          />
          <SendButton
            testID={E2E_TEST_IDS.aiAnalyst.sendButton}
            onPress={onSend}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <MaterialIcons name="send" size={18} color={theme.white} />
          </SendButton>
        </InputRow>

        <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Back to missions</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Container>
  );
};

export default MissionChatScreen;
