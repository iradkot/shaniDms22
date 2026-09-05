import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createAiConversationLaunch,
  decodeAiConversationHistory,
  getAiSpecialistDefinition,
  type AiConversationMessage,
  type AiConversationSummary,
  type AiLocale,
  type AiSpecialistId,
} from '../../../modules/ai';
import {guardAssistantOutput} from '../../../services/aiAnalyst/assistantOutputGuard';
import {useActiveAiWorkspaceScope} from '../../../services/aiMemory/useActiveAiWorkspaceScope';
import type {
  AiAnalystModuleRuntime,
  AiAnalystSurface,
} from '../../../product/ai/runtime';

type StartInput = Parameters<AiAnalystModuleRuntime['start']>[0];

type LegacyMission =
  | 'openChat'
  | 'hypoDetective'
  | 'userBehavior'
  | 'loopSettings'
  | 'mealAnalysis';

type LegacyEngineState =
  | {readonly mode: 'locked'}
  | {readonly mode: 'dashboard'}
  | {readonly mode: 'modeSelection'}
  | {readonly mode: 'history'}
  | {readonly mode: 'historyDetail'; readonly id: string}
  | {readonly mode: 'mission'; readonly mission: LegacyMission}
  | {readonly mode: 'evidence'; readonly mission: LegacyMission};

/** Narrow typed port prevents strict rewrite builds from compiling legacy UI. */
export interface LegacyAiAnalystEnginePort {
  readonly state: LegacyEngineState;
  readonly hasKey: boolean;
  readonly isEnabled: boolean;
  readonly uiMessages: readonly {
    readonly role: string;
    readonly content: string;
  }[];
  readonly input: string;
  readonly isBusy: boolean;
  readonly progressText: string;
  readonly errorText: string | null;
  readonly historyItems: unknown;
  readonly historyBusy: boolean;
  setState(state: LegacyEngineState): void;
  setInput(value: string): void;
  openSettings(): void;
  openHistory(): Promise<void>;
  clearHistory(): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  resumeConversation(conversationId: string): Promise<void>;
  startOpenChat(): Promise<void>;
  startOpenChatWithContext(context: string): Promise<void>;
  startHypoDetective(): Promise<void>;
  startUserBehavior(): Promise<void>;
  startLoopSettingsAdvisor(): Promise<void>;
  startMealAnalysis(context?: string): Promise<void>;
  sendFollowUp(): Promise<void>;
  cancelActiveRun(): void;
  goBackToDashboard(): void;
  onAttachMealImage(): Promise<void>;
}

type LegacyEngineModule = {
  readonly useAiAnalystEngine: () => LegacyAiAnalystEnginePort;
};

// A runtime-only migration seam. A static import here would pull the entire
// legacy screen tree into the strict Product/Web type graph.
const legacyEngineModule = require('../../../containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine') as LegacyEngineModule;

export interface LegacyAiAnalystModuleRuntimeOptions {
  /** Lets the Product host route to its first-class Settings destination. */
  readonly onOpenSettings?: () => void;
}

const missionSpecialist = (mission: unknown): AiSpecialistId => {
  switch (mission) {
    case 'hypoDetective':
      return 'hypo-investigation';
    case 'userBehavior':
      return 'behavior-analysis';
    case 'loopSettings':
      return 'loop-advice';
    case 'mealAnalysis':
      return 'meal-analysis';
    default:
      return 'general-chat';
  }
};

const guardedMessages = (
  value: readonly {readonly role: string; readonly content: string}[],
  locale: AiLocale,
): readonly AiConversationMessage[] => {
  const messages: AiConversationMessage[] = [];
  value.forEach(message => {
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.trim().length === 0
    ) {
      return;
    }
    messages.push({
      role: message.role,
      content:
        message.role === 'assistant'
          ? guardAssistantOutput({text: message.content, language: locale})
          : message.content,
    });
  });
  return messages;
};

const guardedHistory = (
  value: unknown,
  locale: AiLocale,
): readonly AiConversationSummary[] =>
  decodeAiConversationHistory(value).map(item => ({
    ...item,
    messages: guardedMessages(item.messages, locale),
  }));

const surfaceFromEngine = (
  engine: LegacyAiAnalystEnginePort,
  conversationRequested: boolean,
): AiAnalystSurface => {
  switch (engine.state.mode) {
    case 'history':
      return {kind: 'history'};
    case 'historyDetail':
      return {kind: 'history-detail', conversationId: engine.state.id};
    case 'mission':
    case 'evidence':
      return {kind: 'conversation'};
    case 'dashboard':
    case 'modeSelection':
    case 'locked':
      return conversationRequested
        ? {kind: 'conversation'}
        : {kind: 'landing'};
  }
};

const defaultMealContext = (locale: AiLocale): string => {
  const copy = getAiSpecialistDefinition('meal-analysis').copy[locale];
  return `${copy.title} · ${copy.description}`;
};

/**
 * Migration adapter that keeps the proven AI engine behind the rebuilt
 * Product interface. Provider calls, tool loops, output guarding, history and
 * Workspace isolation remain owned by the existing engine implementation.
 */
export const useLegacyAiAnalystModuleRuntime = (
  locale: AiLocale,
  options: LegacyAiAnalystModuleRuntimeOptions = {},
): AiAnalystModuleRuntime => {
  const engine = legacyEngineModule.useAiAnalystEngine();
  const workspace = useActiveAiWorkspaceScope();
  const workspaceIdentity = workspace
    ? `${workspace.productUserId}\n${workspace.workspaceId}`
    : null;
  const previousWorkspaceIdentity = useRef(workspaceIdentity);
  const adapterRun = useRef(0);
  const lastStart = useRef<StartInput | undefined>(undefined);
  const [activeSpecialist, setActiveSpecialist] =
    useState<AiSpecialistId>('general-chat');
  const [visibleContext, setVisibleContext] = useState<string | undefined>(
    undefined,
  );
  const [conversationRequested, setConversationRequested] = useState(false);

  useLayoutEffect(() => {
    if (previousWorkspaceIdentity.current === workspaceIdentity) {
      return;
    }
    previousWorkspaceIdentity.current = workspaceIdentity;
    adapterRun.current += 1;
    lastStart.current = undefined;
    setActiveSpecialist('general-chat');
    setVisibleContext(undefined);
    setConversationRequested(false);
  }, [workspaceIdentity]);

  const performStart = useCallback(
    async (input: StartInput): Promise<void> => {
      const run = adapterRun.current + 1;
      adapterRun.current = run;
      lastStart.current = input;
      const launch = createAiConversationLaunch(input);
      const context =
        launch.visibleContext ??
        (input.specialist === 'meal-analysis'
          ? defaultMealContext(input.locale)
          : undefined);
      setActiveSpecialist(input.specialist);
      setVisibleContext(context);
      setConversationRequested(true);

      if (input.focus?.kind === 'ai-conversation') {
        const conversationId = input.focus.conversationId;
        const decoded = guardedHistory(engine.historyItems, input.locale).find(
          item => item.id === conversationId,
        );
        if (decoded) {
          setActiveSpecialist(decoded.specialist);
        }
        await engine.resumeConversation(conversationId);
        return;
      }

      switch (input.specialist) {
        case 'general-chat':
          if (context) {
            await engine.startOpenChatWithContext(context);
          } else {
            await engine.startOpenChat();
          }
          return;
        case 'meal-analysis':
          await engine.startMealAnalysis(
            context ?? defaultMealContext(input.locale),
          );
          return;
        case 'hypo-investigation':
          await engine.startHypoDetective();
          break;
        case 'behavior-analysis':
          await engine.startUserBehavior();
          break;
        case 'loop-advice':
          await engine.startLoopSettingsAdvisor();
          break;
      }

      // Dedicated workflows keep their existing prompts and guardrails. A
      // focused fact is prefilled visibly for explicit user submission.
      if (context && adapterRun.current === run) {
        engine.setInput(context);
      }
    },
    [engine],
  );

  const cancel = useCallback((): void => {
    adapterRun.current += 1;
    engine.cancelActiveRun();
  }, [engine]);

  const openLanding = useCallback((): void => {
    adapterRun.current += 1;
    if (engine.isBusy) {
      engine.cancelActiveRun();
    }
    lastStart.current = undefined;
    setConversationRequested(false);
    setVisibleContext(undefined);
    setActiveSpecialist('general-chat');
    engine.goBackToDashboard();
  }, [engine]);

  const openHistory = useCallback(async (): Promise<void> => {
    adapterRun.current += 1;
    if (engine.isBusy) {
      engine.cancelActiveRun();
    }
    setConversationRequested(false);
    await engine.openHistory();
  }, [engine]);

  const resumeConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      const history = guardedHistory(engine.historyItems, locale);
      const selected = history.find(item => item.id === conversationId);
      adapterRun.current += 1;
      lastStart.current = undefined;
      setActiveSpecialist(selected?.specialist ?? 'general-chat');
      setVisibleContext(undefined);
      setConversationRequested(true);
      await engine.resumeConversation(conversationId);
    },
    [engine, locale],
  );

  const retry = useCallback(async (): Promise<void> => {
    if (
      engine.state.mode === 'mission' &&
      engine.input.trim().length > 0
    ) {
      await engine.sendFollowUp();
      return;
    }
    const previous = lastStart.current;
    if (previous) {
      await performStart(previous);
    }
  }, [engine, performStart]);

  const history = useMemo(
    () => guardedHistory(engine.historyItems, locale),
    [engine.historyItems, locale],
  );
  const messages = useMemo(
    () => guardedMessages(engine.uiMessages, locale),
    [engine.uiMessages, locale],
  );
  const surface = surfaceFromEngine(engine, conversationRequested);
  const availability = !engine.hasKey
    ? 'missing-credentials'
    : engine.isEnabled
      ? 'ready'
      : 'disabled';
  const inferredSpecialist =
    engine.state.mode === 'mission'
      ? missionSpecialist(engine.state.mission)
      : activeSpecialist;

  return {
    snapshot: {
      availability,
      surface,
      activeSpecialist:
        activeSpecialist === 'meal-analysis'
          ? activeSpecialist
          : inferredSpecialist,
      visibleContext,
      messages,
      draft: engine.input,
      busy: engine.isBusy,
      progress: engine.progressText,
      error: engine.errorText ?? undefined,
      history,
      historyBusy: engine.historyBusy,
    },
    setDraft: engine.setInput,
    start: performStart,
    send: engine.sendFollowUp,
    retry,
    cancel,
    openLanding,
    openHistory,
    openHistoryDetail: conversationId =>
      engine.setState({mode: 'historyDetail', id: conversationId}),
    resumeConversation,
    deleteConversation: engine.deleteConversation,
    clearHistory: engine.clearHistory,
    openSettings: options.onOpenSettings ?? engine.openSettings,
    attachMealImage: engine.onAttachMealImage,
  };
};
