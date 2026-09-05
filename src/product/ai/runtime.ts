import type {
  AiConversationFocus,
  AiConversationMessage,
  AiConversationSummary,
  AiLocale,
  AiSpecialistId,
} from '../../modules/ai';

export type AiAnalystAvailability =
  | 'ready'
  | 'disabled'
  | 'missing-credentials';

export type AiAnalystSurface =
  | {readonly kind: 'landing'}
  | {readonly kind: 'conversation'}
  | {readonly kind: 'history'}
  | {readonly kind: 'history-detail'; readonly conversationId: string};

export interface AiAnalystModuleSnapshot {
  readonly availability: AiAnalystAvailability;
  readonly surface: AiAnalystSurface;
  readonly activeSpecialist: AiSpecialistId;
  /** Exactly the context shown in the conversation. Never a hidden prompt. */
  readonly visibleContext: string | undefined;
  /** Assistant messages have already passed assistantOutputGuard. */
  readonly messages: readonly AiConversationMessage[];
  readonly draft: string;
  readonly busy: boolean;
  readonly progress: string;
  readonly error: string | undefined;
  /** History belongs only to the active Product User + Workspace scope. */
  readonly history: readonly AiConversationSummary[];
  readonly historyBusy: boolean;
}

/**
 * Deep host seam for the rebuilt AI experience.
 *
 * Implementations own provider calls, tool execution, persistence, Workspace
 * isolation, run cancellation and stale-result rejection. The Product view
 * only renders this snapshot and invokes these explicit advisory actions.
 */
export interface AiAnalystModuleRuntime {
  readonly snapshot: AiAnalystModuleSnapshot;
  setDraft(value: string): void;
  start(input: {
    readonly specialist: AiSpecialistId;
    readonly locale: AiLocale;
    readonly focus?: AiConversationFocus;
  }): Promise<void>;
  send(): Promise<void>;
  retry(): Promise<void>;
  cancel(): void;
  openLanding(): void;
  openHistory(): Promise<void>;
  openHistoryDetail(conversationId: string): void;
  resumeConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  clearHistory(): Promise<void>;
  openSettings(): void;
  attachMealImage?(): Promise<void>;
}
