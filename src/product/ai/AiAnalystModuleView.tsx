import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getAiSpecialistDefinition,
  type AiConversationFocus,
  type AiConversationMessage,
  type AiConversationSummary,
  type AiLocale,
  type AiSpecialistId,
} from '../../modules/ai';
import {ProductPage, productUiTokens} from '../ui';
import type {AiAnalystModuleRuntime} from './runtime';
import {RecommendationLanding} from './RecommendationLanding';
import {
  RecommendationButton as ActionButton,
  recommendationColors,
} from './RecommendationControls';
import {
  PatientMemoryControl,
  RecommendationFeedbackControl,
} from './RecommendationPersonalization';

const COPY = {
  en: {
    title: 'AI analyst',
    subtitle:
      'Start with a simple chat. Open a focused specialist only when it helps.',
    chatEyebrow: 'PRIMARY',
    investigations: 'Investigations',
    improvements: 'Improvements',
    history: 'Conversation history',
    historyDescription: 'Text-only sessions in this Workspace.',
    settings: 'AI settings and credentials',
    advisory:
      'Suggestions are advisory. The AI cannot change Loop, Nightscout, or therapy settings.',
    credentialsTitle: 'AI credentials are needed',
    credentialsBody: 'Add an AI key in Settings to start a conversation.',
    disabledTitle: 'AI is turned off',
    disabledBody: 'You can enable it in Settings when you want to use it.',
    openSettings: 'Open AI settings',
    context: 'What this recommendation is based on',
    recommendationTitle: 'Your recommendation',
    newConversation: 'Recommendations',
    placeholder: 'Ask about your data…',
    send: 'Send',
    attach: 'Add meal photo',
    cancel: 'Stop',
    retry: 'Try again',
    working: 'Working…',
    noMessages: 'Start by asking a question in your own words.',
    you: 'You',
    assistant: 'AI analyst',
    historyTitle: 'Conversation history',
    historySubtitle: 'Only conversations from the active Workspace are shown.',
    historyEmpty: 'There are no saved conversations in this Workspace.',
    loadingHistory: 'Loading conversations…',
    clearHistory: 'Clear history',
    viewConversation: 'View conversation',
    continueConversation: 'Continue conversation',
    deleteConversation: 'Delete conversation',
    backToHistory: 'Back to history',
  },
  he: {
    title: 'AI Analyst',
    subtitle: 'מתחילים בצ׳אט פשוט. פותחים מומחה ממוקד רק כשזה מועיל.',
    chatEyebrow: 'ראשי',
    investigations: 'חקירות',
    improvements: 'שיפורים',
    history: 'היסטוריית שיחות',
    historyDescription: 'שיחות טקסט בלבד ב־Workspace הזה.',
    settings: 'הגדרות ומפתח AI',
    advisory:
      'ההצעות הן לייעוץ בלבד. ה־AI לא יכול לשנות את Loop, את Nightscout או הגדרות הטיפול.',
    credentialsTitle: 'צריך להגדיר מפתח AI',
    credentialsBody: 'מוסיפים מפתח AI בהגדרות כדי להתחיל שיחה.',
    disabledTitle: 'ה־AI כבוי',
    disabledBody: 'אפשר להפעיל אותו בהגדרות כשרוצים להשתמש בו.',
    openSettings: 'פתיחת הגדרות AI',
    context: 'על מה ההמלצה מבוססת',
    recommendationTitle: 'ההמלצה שלכם',
    newConversation: 'המלצות',
    placeholder: 'אפשר לשאול על הנתונים…',
    send: 'שליחה',
    attach: 'הוספת תמונת ארוחה',
    cancel: 'עצירה',
    retry: 'ניסיון נוסף',
    working: 'עובד…',
    noMessages: 'אפשר להתחיל בשאלה במילים שלכם.',
    you: 'אתם',
    assistant: 'AI Analyst',
    historyTitle: 'היסטוריית שיחות',
    historySubtitle: 'מוצגות רק שיחות מה־Workspace הפעיל.',
    historyEmpty: 'אין שיחות שמורות ב־Workspace הזה.',
    loadingHistory: 'טוען שיחות…',
    clearHistory: 'ניקוי היסטוריה',
    viewConversation: 'צפייה בשיחה',
    continueConversation: 'המשך השיחה',
    deleteConversation: 'מחיקת השיחה',
    backToHistory: 'חזרה להיסטוריה',
  },
} as const;

const focusKey = (focus: AiConversationFocus | undefined): string =>
  focus === undefined ? 'none' : JSON.stringify(focus);

/** Runtime failures are rendered from its snapshot, never as unhandled promises. */
const runRuntimeAction = (action: () => Promise<void>): void => {
  action().catch(() => undefined);
};

const formatHistoryDate = (timestamp: number, locale: AiLocale): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

const MessageBubble = ({
  locale,
  message,
  runtime,
  messageIndex,
}: {
  readonly locale: AiLocale;
  readonly message: AiConversationMessage;
  readonly runtime?: AiAnalystModuleRuntime;
  readonly messageIndex?: number;
}) => {
  const rtl = locale === 'he';
  const copy = COPY[locale];
  return (
    <View
      style={[
        styles.messageBubble,
        message.role === 'user' ? styles.userMessage : styles.assistantMessage,
      ]}>
      <Text style={[styles.messageRole, rtl && styles.rtlText]}>
        {message.role === 'user' ? copy.you : copy.assistant}
      </Text>
      <Text selectable style={[styles.messageText, rtl && styles.rtlText]}>
        {message.content}
      </Text>
      {message.role === 'assistant' && runtime && messageIndex !== undefined ? (
        <RecommendationFeedbackControl
          key={runtime.snapshot.recommendationContextKey}
          locale={locale}
          runtime={runtime}
          messageIndex={messageIndex}
        />
      ) : null}
    </View>
  );
};

const Conversation = ({
  locale,
  runtime,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
}) => {
  const {snapshot} = runtime;
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [contextExpanded, setContextExpanded] = useState(false);
  return (
    <ProductPage
      locale={locale}
      subtitle={copy.advisory}
      testID="ai-conversation"
      style={styles.page}
      title={copy.recommendationTitle}>
      <ActionButton
        label={copy.newConversation}
        onPress={runtime.openLanding}
        secondary
        testID="ai-open-menu"
      />
      {snapshot.visibleContext ? (
        <View style={styles.contextCard} testID="ai-visible-context">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{expanded: contextExpanded}}
            aria-expanded={contextExpanded}
            onPress={() => setContextExpanded(!contextExpanded)}
            style={styles.contextToggle}
            testID="ai-context-toggle">
            <Text style={[styles.contextLabel, rtl && styles.rtlText]}>
              {copy.context} {contextExpanded ? '−' : '+'}
            </Text>
          </Pressable>
          {contextExpanded ? (
            <Text
              selectable
              style={[styles.contextText, rtl && styles.rtlText]}>
              {snapshot.visibleContext}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.messages}>
        {snapshot.messages.length === 0 && !snapshot.busy ? (
          <Text style={[styles.emptyText, rtl && styles.rtlText]}>
            {copy.noMessages}
          </Text>
        ) : null}
        {snapshot.messages.map((message, index) => (
          <MessageBubble
            key={`${message.role}-${index}`}
            locale={locale}
            message={message}
            runtime={runtime}
            messageIndex={index}
          />
        ))}
      </View>

      {snapshot.busy ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.progressCard, rtl && styles.rowReverse]}>
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.progressText, rtl && styles.rtlText]}>
            {snapshot.progress || copy.working}
          </Text>
          <ActionButton
            label={copy.cancel}
            onPress={runtime.cancel}
            secondary
            testID="ai-cancel"
          />
        </View>
      ) : null}

      {snapshot.error ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorCard}>
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {snapshot.error}
          </Text>
          <ActionButton
            label={copy.retry}
            onPress={() => runRuntimeAction(runtime.retry)}
            testID="ai-retry"
          />
        </View>
      ) : null}

      <TextInput
        accessibilityLabel={copy.placeholder}
        testID="ai-composer-input"
        editable={!snapshot.busy}
        multiline
        onChangeText={runtime.setDraft}
        placeholder={copy.placeholder}
        placeholderTextColor={productUiTokens.colors.textMuted}
        style={[styles.input, rtl && styles.rtlInput]}
        value={snapshot.draft}
      />
      <View style={[styles.composerActions, rtl && styles.rowReverse]}>
        <ActionButton
          disabled={snapshot.busy || snapshot.draft.trim().length === 0}
          label={copy.send}
          onPress={() => runRuntimeAction(runtime.send)}
          testID="ai-send"
        />
        {runtime.attachMealImage ? (
          <ActionButton
            disabled={snapshot.busy}
            label={copy.attach}
            onPress={() => {
              const attach = runtime.attachMealImage;
              if (attach) {
                runRuntimeAction(attach);
              }
            }}
            secondary
            testID="ai-attach-meal-image"
          />
        ) : null}
      </View>
      {snapshot.memoryError ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.errorText, rtl && styles.rtlText]}>
          {snapshot.memoryError}
        </Text>
      ) : null}
      <PatientMemoryControl locale={locale} runtime={runtime} />
    </ProductPage>
  );
};

const HistoryList = ({
  locale,
  runtime,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  return (
    <ProductPage
      locale={locale}
      subtitle={copy.historySubtitle}
      testID="ai-history"
      title={copy.historyTitle}>
      <View style={[styles.historyActions, rtl && styles.rowReverse]}>
        <ActionButton
          label={copy.newConversation}
          onPress={runtime.openLanding}
          secondary
        />
        {runtime.snapshot.history.length > 0 ? (
          <ActionButton
            label={copy.clearHistory}
            onPress={() => runRuntimeAction(runtime.clearHistory)}
            secondary
            testID="ai-history-clear"
          />
        ) : null}
      </View>
      {runtime.snapshot.historyBusy ? (
        <View style={[styles.progressCard, rtl && styles.rowReverse]}>
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.progressText, rtl && styles.rtlText]}>
            {copy.loadingHistory}
          </Text>
        </View>
      ) : runtime.snapshot.history.length === 0 ? (
        <Text style={[styles.emptyText, rtl && styles.rtlText]}>
          {copy.historyEmpty}
        </Text>
      ) : (
        runtime.snapshot.history.map(item => (
          <HistoryCard
            item={item}
            key={item.id}
            locale={locale}
            onContinue={() =>
              runRuntimeAction(() => runtime.resumeConversation(item.id))
            }
            onView={() => runtime.openHistoryDetail(item.id)}
          />
        ))
      )}
    </ProductPage>
  );
};

const HistoryCard = ({
  item,
  locale,
  onView,
  onContinue,
}: {
  readonly item: AiConversationSummary;
  readonly locale: AiLocale;
  readonly onView: () => void;
  readonly onContinue: () => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const specialist = getAiSpecialistDefinition(item.specialist).copy[locale];
  return (
    <View style={styles.savedConversation}>
      <Text style={[styles.savedTitle, rtl && styles.rtlText]}>
        {item.title}
      </Text>
      <Text style={[styles.savedMeta, rtl && styles.rtlText]}>
        {specialist.title} · {formatHistoryDate(item.updatedAt, locale)}
      </Text>
      <View style={[styles.composerActions, rtl && styles.rowReverse]}>
        <ActionButton
          label={copy.viewConversation}
          onPress={onView}
          secondary
        />
        <ActionButton label={copy.continueConversation} onPress={onContinue} />
      </View>
    </View>
  );
};

const HistoryDetail = ({
  conversation,
  locale,
  runtime,
}: {
  readonly conversation: AiConversationSummary | undefined;
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  if (!conversation) {
    return <HistoryList locale={locale} runtime={runtime} />;
  }
  return (
    <ProductPage
      locale={locale}
      subtitle={formatHistoryDate(conversation.updatedAt, locale)}
      testID="ai-history-detail"
      title={conversation.title}>
      {conversation.messages.map((message, index) => (
        <MessageBubble
          key={`${message.role}-${index}`}
          locale={locale}
          message={message}
        />
      ))}
      <View style={[styles.detailActions, rtl && styles.rowReverse]}>
        <ActionButton
          label={copy.continueConversation}
          onPress={() =>
            runRuntimeAction(() => runtime.resumeConversation(conversation.id))
          }
          testID="ai-history-resume"
        />
        <ActionButton
          label={copy.backToHistory}
          onPress={() => runRuntimeAction(runtime.openHistory)}
          secondary
        />
        <ActionButton
          label={copy.deleteConversation}
          onPress={() =>
            runRuntimeAction(() => runtime.deleteConversation(conversation.id))
          }
          secondary
          testID="ai-history-delete"
        />
      </View>
    </ProductPage>
  );
};

const Unavailable = ({
  locale,
  runtime,
}: {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const missing = runtime.snapshot.availability === 'missing-credentials';
  return (
    <ProductPage
      locale={locale}
      subtitle={missing ? copy.credentialsBody : copy.disabledBody}
      testID="ai-unavailable"
      title={missing ? copy.credentialsTitle : copy.disabledTitle}>
      <View style={styles.unavailableCard}>
        <Text style={[styles.advisory, rtl && styles.rtlText]}>
          {copy.advisory}
        </Text>
        <ActionButton
          label={copy.openSettings}
          onPress={runtime.openSettings}
          testID="ai-open-settings"
        />
      </View>
    </ProductPage>
  );
};

export interface AiAnalystModuleViewProps {
  readonly locale: AiLocale;
  readonly runtime: AiAnalystModuleRuntime;
  readonly initialSpecialist?: AiSpecialistId;
  readonly focus?: AiConversationFocus;
}

export const AiAnalystModuleView = ({
  locale,
  runtime,
  initialSpecialist,
  focus,
}: AiAnalystModuleViewProps) => {
  const settingsRedirected = useRef(false);
  const launchedKey = useRef<string | undefined>(undefined);
  const launchIdentity = useMemo(
    () =>
      initialSpecialist === undefined
        ? undefined
        : `${initialSpecialist}:${focusKey(focus)}`,
    [focus, initialSpecialist],
  );

  useEffect(() => {
    if (
      runtime.snapshot.availability === 'missing-credentials' &&
      !settingsRedirected.current
    ) {
      settingsRedirected.current = true;
      runtime.openSettings();
    }
  }, [runtime, runtime.snapshot.availability]);

  useEffect(() => {
    if (
      runtime.snapshot.availability !== 'ready' ||
      initialSpecialist === undefined ||
      launchIdentity === undefined ||
      launchedKey.current === launchIdentity
    ) {
      return;
    }
    launchedKey.current = launchIdentity;
    runRuntimeAction(() =>
      runtime.start({
        specialist: initialSpecialist,
        locale,
        ...(focus === undefined ? {} : {focus}),
      }),
    );
  }, [focus, initialSpecialist, launchIdentity, locale, runtime]);

  if (runtime.snapshot.availability !== 'ready') {
    return <Unavailable locale={locale} runtime={runtime} />;
  }
  switch (runtime.snapshot.surface.kind) {
    case 'landing':
      return (
        <RecommendationLanding
          locale={locale}
          runtime={runtime}
          {...(focus === undefined ? {} : {focus})}
        />
      );
    case 'conversation':
      return <Conversation locale={locale} runtime={runtime} />;
    case 'history':
      return <HistoryList locale={locale} runtime={runtime} />;
    case 'history-detail': {
      const conversationId = runtime.snapshot.surface.conversationId;
      return (
        <HistoryDetail
          conversation={runtime.snapshot.history.find(
            item => item.id === conversationId,
          )}
          locale={locale}
          runtime={runtime}
        />
      );
    }
  }
};

const styles = StyleSheet.create({
  page: {backgroundColor: recommendationColors.page},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rtlInput: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  advisory: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.lg,
  },
  contextCard: {
    backgroundColor: '#E7F0E7',
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.lg,
  },
  contextToggle: {minHeight: 44, justifyContent: 'center'},
  contextLabel: {color: '#116B60', fontSize: 13, fontWeight: '700'},
  contextText: {
    color: productUiTokens.colors.text,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xs,
  },
  messages: {
    gap: productUiTokens.spacing.md,
    marginTop: productUiTokens.spacing.lg,
  },
  messageBubble: {
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  userMessage: {backgroundColor: '#E7F0E7', marginStart: '8%'},
  assistantMessage: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E5DF',
    borderWidth: 1,
  },
  messageRole: {
    color: recommendationColors.teal,
    fontSize: 11,
    fontWeight: '800',
  },
  messageText: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    lineHeight: 23,
    marginTop: productUiTokens.spacing.xs,
  },
  emptyText: {
    color: productUiTokens.colors.textMuted,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xl,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: productUiTokens.spacing.md,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.md,
  },
  progressText: {color: productUiTokens.colors.textMuted, flexGrow: 1},
  errorCard: {
    backgroundColor: '#FCEBEF',
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  errorText: {
    color: productUiTokens.colors.danger,
    marginBottom: productUiTokens.spacing.sm,
  },
  input: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    color: productUiTokens.colors.text,
    fontSize: 15,
    marginTop: productUiTokens.spacing.lg,
    minHeight: 92,
    padding: productUiTokens.spacing.lg,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.sm,
  },
  historyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.lg,
  },
  savedConversation: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  savedTitle: {
    color: productUiTokens.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  savedMeta: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.xs,
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.xl,
  },
  unavailableCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.xl,
  },
});
