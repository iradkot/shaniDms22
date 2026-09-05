export type AiSpecialistId =
  | 'general-chat'
  | 'hypo-investigation'
  | 'behavior-analysis'
  | 'meal-analysis'
  | 'loop-advice';

export type AiSpecialistCategory =
  | 'primary'
  | 'investigation'
  | 'improvement';

export type AiLocale = 'en' | 'he';

export interface AiSpecialistDefinition {
  readonly id: AiSpecialistId;
  readonly category: AiSpecialistCategory;
  readonly copy: Readonly<
    Record<
      AiLocale,
      {
        readonly title: string;
        readonly description: string;
      }
    >
  >;
}

/**
 * A deliberately small, transient reference to product context.
 * It never contains glucose samples, credentials, free-form notes, or prompts.
 */
export type AiConversationFocus =
  | {readonly kind: 'day'; readonly dayStartMs: number}
  | {
      readonly kind: 'period';
      readonly startMs: number;
      readonly endMs: number;
    }
  | {
      readonly kind: 'journal-entry';
      readonly entryKind: 'meal' | 'activity';
      readonly entryId: string;
    }
  | {
      readonly kind: 'external-record';
      readonly recordKind: 'carbohydrate' | 'treatment' | 'activity';
      readonly recordId: string;
    }
  | {
      readonly kind: 'alert-occurrence';
      readonly occurrenceId: string;
    }
  | {readonly kind: 'loop-change'; readonly changeId: string}
  | {readonly kind: 'ai-conversation'; readonly conversationId: string};

export interface AiConversationLaunch {
  readonly specialist: AiSpecialistId;
  /** The exact context shown to the Product User and, when used, sent as user context. */
  readonly visibleContext?: string;
}

export type AiConversationRole = 'user' | 'assistant';

export interface AiConversationMessage {
  readonly role: AiConversationRole;
  readonly content: string;
}

export interface AiConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly specialist: AiSpecialistId;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly AiConversationMessage[];
}
