import React, {RefObject, useMemo} from 'react';
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
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

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
  onAttachMealImage: () => void;
  onAssistantFeedback: (params: {content: string; helpful: boolean}) => void;
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
  onAttachMealImage,
  onAssistantFeedback,
  onOpenEvidence,
  scrollRef,
  markdown,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const isHebrew = language === 'he';
  const textAlign: 'left' | 'right' = isHebrew ? 'right' : 'left';
  const writingDirection: 'ltr' | 'rtl' = isHebrew ? 'rtl' : 'ltr';

  const markdownStyle = useMemo(
    () => ({
      ...markdown.style,
      body: {...(markdown.style as any).body, textAlign, writingDirection, lineHeight: 22},
      paragraph: {...(markdown.style as any).paragraph, textAlign, writingDirection, marginBottom: 6},
      text: {...(markdown.style as any).text, textAlign, writingDirection},
      bullet_list: {...(markdown.style as any).bullet_list, marginVertical: 4},
      ordered_list: {...(markdown.style as any).ordered_list, marginVertical: 4},
      list_item: {...(markdown.style as any).list_item, marginVertical: 2},
      strong: {...(markdown.style as any).strong, textAlign, writingDirection},
      em: {...(markdown.style as any).em, textAlign, writingDirection},
    }),
    [markdown.style, textAlign, writingDirection],
  );

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text || '');
    if (Platform.OS === 'android') {
      ToastAndroid.show(tr(language, 'ai.copySuccess'), ToastAndroid.SHORT);
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
            accessibilityLabel={tr(language, 'ai.back')}
            hitSlop={10}
            style={{alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center'}}
          >
            <MaterialIcons name="arrow-back" size={18} color={addOpacity(theme.textColor, 0.8)} />
            <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>{tr(language, 'ai.back')}</Text>
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
              accessibilityLabel={tr(language, 'ai.export')}
              hitSlop={10}
              style={{flexDirection: 'row', alignItems: 'center'}}
            >
              <MaterialIcons name="download" size={18} color={addOpacity(theme.textColor, 0.8)} />
              <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>{tr(language, 'ai.export')}</Text>
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
                    <Markdown markdownit={markdown.instance} rules={markdown.rules} style={markdownStyle}>
                      {visibleText}
                    </Markdown>
                    <View style={{flexDirection: isHebrew ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6}}>
                      <Pressable
                        onPress={() => copyToClipboard(visibleText)}
                        accessibilityRole="button"
                        accessibilityLabel={tr(language, 'ai.copy')}
                        style={{flexDirection: isHebrew ? 'row-reverse' : 'row', alignItems: 'center'}}
                      >
                        <MaterialIcons name="content-copy" size={14} color={addOpacity(theme.textColor, 0.7)} />
                        <Text style={{marginLeft: isHebrew ? 0 : 4, marginRight: isHebrew ? 4 : 0, color: addOpacity(theme.textColor, 0.7), fontSize: 12}}>{tr(language, 'ai.copy')}</Text>
                      </Pressable>

                      <View style={{flexDirection: isHebrew ? 'row-reverse' : 'row'}}>
                        <Pressable
                          onPress={() => onAssistantFeedback({content: visibleText, helpful: true})}
                          style={{paddingHorizontal: 8, paddingVertical: 4}}
                        >
                          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.7)}}>
                            {language === 'he' ? 'עזר 👍' : 'Helpful 👍'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onAssistantFeedback({content: visibleText, helpful: false})}
                          style={{paddingHorizontal: 8, paddingVertical: 4}}
                        >
                          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.7)}}>
                            {language === 'he' ? 'לא עזר 👎' : 'Not helpful 👎'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : (
                  <MessageText selectable style={{textAlign, writingDirection}}>{visibleText}</MessageText>
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
                {progressText ? progressText : tr(language, 'ai.thinking')}
              </Text>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel={tr(language, 'ai.stop')}
                style={{marginLeft: 'auto', marginRight: 12, paddingVertical: 6, paddingHorizontal: 10}}
              >
                <Text style={{color: theme.belowRangeColor}}>{tr(language, 'ai.stop')}</Text>
              </Pressable>
            </View>
          ) : null}

          {!!errorText ? (
            <Text style={{marginTop: 10, marginLeft: 12, color: theme.belowRangeColor}}>
              {errorText}
            </Text>
          ) : null}
        </ScrollView>

        {/* Quick actions (meal flow) */}
        {mission === 'openChat' ? (
          <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm}}>
            <Text style={{color: addOpacity(theme.textColor, 0.7), marginBottom: 6, textAlign, writingDirection}}>
              {language === 'he' ? 'קיצורי דרך לארוחה:' : 'Meal shortcuts:'}
            </Text>
            <View style={{flexDirection: isHebrew ? 'row-reverse' : 'row', gap: theme.spacing.sm, flexWrap: 'wrap'}}>
              <Pressable
                onPress={() => setInput(language === 'he' ? 'הנה תיאור הארוחה הקרובה: ' : 'Here is my upcoming meal description: ')}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: addOpacity(theme.accentColor, 0.35),
                  backgroundColor: addOpacity(theme.accentColor, 0.08),
                }}
              >
                <Text style={{color: theme.textColor, fontWeight: '600', textAlign, writingDirection}}>
                  {language === 'he' ? 'כתוב תיאור ארוחה' : 'Describe meal'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onAttachMealImage}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: addOpacity(theme.accentColor, 0.35),
                  backgroundColor: addOpacity(theme.accentColor, 0.08),
                }}
              >
                <Text style={{color: theme.textColor, fontWeight: '600', textAlign, writingDirection}}>
                  {language === 'he' ? 'צרף תמונת ארוחה' : 'Attach meal photo'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Input */}
        <InputRow>
          <ChatInput
            testID={E2E_TEST_IDS.aiAnalyst.chatInput}
            value={input}
            onChangeText={setInput}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), SCROLL_DELAY_MS)}
            placeholder={tr(language, 'ai.askAnything')}
            placeholderTextColor={addOpacity(theme.textColor, 0.5)}
            editable
            textAlign={textAlign}
            style={{writingDirection}}
          />
          <SendButton
            testID={E2E_TEST_IDS.aiAnalyst.sendButton}
            onPress={onSend}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'ai.openChat')}
          >
            <MaterialIcons name="send" size={18} color={theme.white} />
          </SendButton>
        </InputRow>

        <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={{color: addOpacity(theme.textColor, 0.7)}}>{tr(language, 'ai.backToMissions')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Container>
  );
};

export default MissionChatScreen;
