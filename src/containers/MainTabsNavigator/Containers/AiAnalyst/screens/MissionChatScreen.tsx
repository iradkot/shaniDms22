/* eslint-disable react-native/no-inline-styles */
import React, {RefObject, useMemo} from 'react';
import {formatDistanceToNowStrict} from 'date-fns';
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
import {Bubble, GiftedChat, IMessage} from 'react-native-gifted-chat';
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

import {CompactKpi, EvidenceRequest, MissionKey, MarkdownConfig} from '../types';
import {extractEvidenceLinks, stripEvidenceTags} from '../helpers/evidenceLinks';
import {DISCLOSURE_TEXT, SCROLL_DELAY_MS, getMissionTitle} from '../constants';
import {Container, Title, Subtle, MessageText, InputRow, ChatInput, SendButton} from '../styled';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MissionChatScreenProps {
  mission: MissionKey | undefined;
  uiMessages: LlmChatMessage[];
  isBusy: boolean;
  progressText: string;
  errorText: string | null;
  compactKpi: CompactKpi | null;
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
  compactKpi,
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

  const giftedMessages: IMessage[] = useMemo(() => {
    const base = (uiMessages ?? []).map((m, idx) => ({
      _id: `m-${idx}`,
      text: m.content,
      createdAt: new Date(Date.now() - (uiMessages.length - idx) * 1000),
      user: {
        _id: m.role === 'assistant' ? 2 : 1,
        name: m.role === 'assistant' ? 'AI' : 'You',
      },
    }));

    // GiftedChat works best with newest-first ordering.
    return base.reverse();
  }, [uiMessages]);

  const kpiTone = useMemo(() => {
    const bg = compactKpi?.bgMgdl;
    if (typeof bg !== 'number') {
      return {color: addOpacity(theme.textColor, 0.8), border: addOpacity(theme.borderColor, 0.4), bg: addOpacity(theme.textColor, 0.05)};
    }
    if (bg < 70) {
      return {color: '#c62828', border: addOpacity('#c62828', 0.35), bg: addOpacity('#c62828', 0.08)};
    }
    if (bg <= 180) {
      return {color: '#2e7d32', border: addOpacity('#2e7d32', 0.35), bg: addOpacity('#2e7d32', 0.08)};
    }
    return {color: '#f9a825', border: addOpacity('#f9a825', 0.35), bg: addOpacity('#f9a825', 0.1)};
  }, [compactKpi?.bgMgdl, theme.borderColor, theme.textColor]);

  const kpiAge = useMemo(() => {
    if (!compactKpi?.sampleTimeMs) {
      return null;
    }
    try {
      return formatDistanceToNowStrict(new Date(compactKpi.sampleTimeMs), {addSuffix: true});
    } catch {
      return null;
    }
  }, [compactKpi?.sampleTimeMs]);

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text || '');
    if (Platform.OS === 'android') {
      ToastAndroid.show(tr(language, 'ai.copySuccess'), ToastAndroid.SHORT);
    }
  };

  const renderAssistantContent = (text: string) => {
    const parts: Array<{type: 'md' | 'code'; content: string; lang?: string}> = [];
    const re = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) != null) {
      const [full, lang, code] = m;
      const start = m.index;
      if (start > last) {
        parts.push({type: 'md', content: text.slice(last, start)});
      }
      parts.push({type: 'code', content: code ?? '', lang: lang || undefined});
      last = start + full.length;
    }

    if (last < text.length) {
      parts.push({type: 'md', content: text.slice(last)});
    }

    if (parts.length === 0) {
      parts.push({type: 'md', content: text});
    }

    return (
      <View>
        {parts.map((p, i) => {
          if (p.type === 'md') {
            return (
              <Markdown key={`md-${i}`} markdownit={markdown.instance} rules={markdown.rules} style={markdownStyle}>
                {p.content}
              </Markdown>
            );
          }

          return (
            <View
              key={`code-${i}`}
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: addOpacity(theme.textColor, 0.2),
                backgroundColor: addOpacity(theme.textColor, 0.04),
                marginTop: 8,
                marginBottom: 8,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: addOpacity(theme.textColor, 0.15),
                }}
              >
                <Text style={{fontSize: 11, color: addOpacity(theme.textColor, 0.7)}}>{p.lang || 'code'}</Text>
              </View>
              <ScrollView horizontal contentContainerStyle={{padding: 10}} showsHorizontalScrollIndicator>
                <Text selectable style={{fontFamily: Platform.select({ios: 'Menlo', android: 'monospace'}), color: theme.textColor}}>
                  {p.content}
                </Text>
              </ScrollView>
            </View>
          );
        })}
      </View>
    );
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

        {compactKpi ? (
          <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: 4}}>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: kpiTone.border,
                backgroundColor: kpiTone.bg,
                paddingVertical: 8,
                paddingHorizontal: 10,
                flexDirection: isHebrew ? 'row-reverse' : 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View>
                <Text style={{color: kpiTone.color, fontWeight: '800'}}>
                  {isHebrew ? 'עכשיו' : 'Now'}: {compactKpi.bgMgdl ?? '—'} {compactKpi.trend ?? ''}
                </Text>
                {kpiAge ? (
                  <Text style={{color: addOpacity(theme.textColor, 0.65), fontSize: 11, marginTop: 2}}>
                    {isHebrew ? `עודכן ${kpiAge}` : `Updated ${kpiAge}`}
                  </Text>
                ) : null}
              </View>
              <Text style={{color: addOpacity(theme.textColor, 0.8), fontSize: 12}}>
                IOB {compactKpi.iobU ?? '—'}u • COB {compactKpi.cobG ?? '—'}g
              </Text>
            </View>
          </View>
        ) : null}

        {/* Messages */}
        <View style={{flex: 1, marginTop: theme.spacing.sm}}>
          <GiftedChat
            messages={giftedMessages}
            onSend={() => {}}
            user={{_id: 1}}
            renderInputToolbar={() => null}
            renderAvatar={() => null}
            showAvatarForEveryMessage={false}
            listViewProps={{
              keyboardShouldPersistTaps: 'handled',
              keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
              maintainVisibleContentPosition: {minIndexForVisible: 0},
              contentContainerStyle: {paddingBottom: theme.spacing.xl * 2},
            }}
            renderBubble={props => {
              const isAssistant = props.currentMessage?.user?._id === 2;
              return (
                <Bubble
                  {...props}
                  containerStyle={{
                    left: {marginLeft: 2, marginRight: 2},
                    right: {marginLeft: 2, marginRight: 2},
                  }}
                  wrapperStyle={{
                    left: {
                      backgroundColor: addOpacity(theme.textColor, 0.06),
                      maxWidth: '97%',
                      padding: 4,
                      marginRight: 6,
                    },
                    right: {
                      backgroundColor: addOpacity(theme.accentColor, 0.14),
                      maxWidth: '94%',
                      padding: 4,
                      marginLeft: 14,
                    },
                  }}
                  renderMessageText={messageProps => {
                    const raw = messageProps.currentMessage?.text ?? '';
                    const visibleText = stripEvidenceTags(raw);
                    if (isAssistant) {
                      return renderAssistantContent(visibleText);
                    }
                    return (
                      <MessageText selectable style={{textAlign, writingDirection}}>
                        {visibleText}
                      </MessageText>
                    );
                  }}
                  renderCustomView={messageProps => {
                    if (!isAssistant) {
                      return null;
                    }
                    const raw = messageProps.currentMessage?.text ?? '';
                    const visibleText = stripEvidenceTags(raw);
                    const evidenceLinks = extractEvidenceLinks(raw);
                    return (
                      <View style={{marginTop: 6}}>
                        <View style={{flexDirection: isHebrew ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                          <Pressable
                            onPress={() => copyToClipboard(visibleText)}
                            accessibilityRole="button"
                            accessibilityLabel={tr(language, 'ai.copy')}
                            style={{flexDirection: isHebrew ? 'row-reverse' : 'row', alignItems: 'center'}}
                          >
                            <MaterialIcons name="content-copy" size={14} color={addOpacity(theme.textColor, 0.7)} />
                            <Text
                              style={{
                                marginLeft: isHebrew ? 0 : 4,
                                marginRight: isHebrew ? 4 : 0,
                                color: addOpacity(theme.textColor, 0.7),
                                fontSize: 12,
                              }}
                            >
                              {tr(language, 'ai.copy')}
                            </Text>
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
                      </View>
                    );
                  }}
                />
              );
            }}
          />

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

          {errorText ? (
            <Text style={{marginTop: 10, marginLeft: 12, color: theme.belowRangeColor}}>{errorText}</Text>
          ) : null}
        </View>

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
