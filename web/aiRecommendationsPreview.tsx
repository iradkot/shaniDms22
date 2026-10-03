import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StyleSheet, View} from 'react-native';
import {AiAnalystModuleView} from '../src/product/ai/AiAnalystModuleView';
import type {
  AiAnalystModuleRuntime,
  AiAnalystModuleSnapshot,
} from '../src/product/ai/runtime';
import type {AiRecommendationRequest} from '../src/modules/ai';
import './styles.css';

// This standalone development preview never calls an AI provider or reads real patient data.
const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'en' ? 'en' : 'he';
const scenario = params.get('scenario');
const assistantText =
  locale === 'he'
    ? 'נבחר צעד אחד שמתאים לכם השבוע: לתעד בקצרה מה עזר לשמור על שגרה נוחה סביב הארוחות.\n\nאחרי כמה ימים, תוכלו לחזור לכאן ולספר מה היה קל ומה פחות התאים. ההמלצה הבאה תוכל לקחת את ההעדפות שלכם בחשבון.'
    : 'Choose one practical focus this week: briefly note what helped your usual meal routine feel manageable.\n\nAfter a few days, come back and tell us what felt easy and what did not fit. Your next recommendation can take those preferences into account.';
const initial: AiAnalystModuleSnapshot = {
  availability: 'ready',
  surface: {kind: 'landing'},
  activeSpecialist: 'general-chat',
  visibleContext: undefined,
  messages: [],
  draft: '',
  busy: false,
  progress: '',
  error: undefined,
  history: [],
  historyBusy: false,
  patientMemory: {
    enabled: true,
    instructions: '',
    feedbackCount: 0,
    questionCount: 0,
  },
  messageFeedback: {},
};

function Preview() {
  const [snapshot, setSnapshot] = useState(initial);
  const [request, setRequest] = useState<AiRecommendationRequest>();
  const update = (value: Partial<AiAnalystModuleSnapshot>): void =>
    setSnapshot(previous => ({...previous, ...value}));
  const runtime: AiAnalystModuleRuntime = {
    snapshot,
    reviseFromFeedback: async () =>
      update({
        messages: [
          ...snapshot.messages,
          {
            role: 'user',
            content:
              locale === 'he'
                ? 'התאם לי את ההמלצה לפי המשוב שלי.'
                : 'Adapt this recommendation using my feedback.',
          },
          {
            role: 'assistant',
            content:
              locale === 'he'
                ? 'ננסה צעד אחר ופשוט יותר: לבחור ארוחה אחת ביום ולציין מה היה קל ומה הפריע. זו תשובת הדגמה בלבד.'
                : 'Try a different, simpler step: choose one meal each day and note what felt easy or difficult. This is a demonstration answer only.',
          },
        ],
      }),
    startRecommendation: async input => {
      setRequest(input.request);
      update({
        surface: {kind: 'conversation'},
        messages: [{role: 'assistant', content: assistantText}],
        visibleContext: `Synthetic evidence only · ${JSON.stringify(
          input.request,
        )}`,
        messageFeedback: {},
      });
    },
    start: async () => update({surface: {kind: 'conversation'}}),
    setDraft: draft => update({draft}),
    send: async () =>
      update({
        draft: '',
        messages: [
          ...snapshot.messages,
          {role: 'user', content: snapshot.draft},
          {role: 'assistant', content: assistantText},
        ],
      }),
    retry: async () => undefined,
    cancel: () => update({busy: false}),
    openLanding: () => update({surface: {kind: 'landing'}}),
    openHistory: async () => update({surface: {kind: 'history'}}),
    openHistoryDetail: conversationId =>
      update({surface: {kind: 'history-detail', conversationId}}),
    resumeConversation: async () => update({surface: {kind: 'conversation'}}),
    deleteConversation: async () => update({history: []}),
    clearHistory: async () => update({history: []}),
    openSettings: () => undefined,
    saveFeedback: async ({messageIndex, ...feedback}) => {
      if (scenario === 'feedback-error') {
        throw new Error('Synthetic storage failure');
      }
      update({
        messageFeedback: {
          ...snapshot.messageFeedback,
          [messageIndex]: feedback,
        },
      });
    },
    savePatientMemory: async memory => {
      update({patientMemory: {...memory, questionCount: 0, feedbackCount: 0}});
    },
    clearPatientMemory: async () =>
      update({
        patientMemory: {
          enabled: true,
          instructions: '',
          questionCount: 0,
          feedbackCount: 0,
        },
        messageFeedback: {},
      }),
  };
  return (
    <View style={styles.root}>
      <div style={bannerStyle}>
        תצוגת פיתוח · נתוני דמה בלבד · Synthetic data only
      </div>
      <AiAnalystModuleView locale={locale} runtime={runtime} />
      <output data-testid="ai-preview-request" style={hiddenStyle}>
        {JSON.stringify(request)}
      </output>
    </View>
  );
}
const styles = StyleSheet.create({root: {height: '100%'}});
const bannerStyle: React.CSSProperties = {
  padding: 5,
  textAlign: 'center',
  fontSize: 10,
  background: '#E7F0E7',
  color: '#5C716E',
};
const hiddenStyle: React.CSSProperties = {display: 'none'};
createRoot(document.getElementById('root')!).render(<Preview />);
