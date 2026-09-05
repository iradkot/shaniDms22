import type {AlertRuleTrend} from './alertRules';

export type UpdateReadState = 'read' | 'unread' | 'unknown';

export type UpdateDeepLinkDescriptor =
  | {readonly kind: 'alert-occurrence'; readonly occurrenceId: string}
  | {readonly kind: 'alert-rule'; readonly ruleId: string}
  | {readonly kind: 'day'; readonly dayStartMs: number}
  | {
      readonly kind: 'journal-entry';
      readonly entryKind: 'meal' | 'activity';
      readonly entryId: string;
    }
  | {readonly kind: 'ai-conversation'; readonly conversationId: string};

export type UpdateContent =
  | {
      readonly kind: 'message';
      readonly title: string;
      readonly body?: string;
    }
  | {
      /** A deliberately narrow projection of the legacy `times_called` fact. */
      readonly kind: 'alert-rule-trigger';
      readonly ruleName: string;
    }
  | {
      /** Immutable facts captured when an app-owned rule actually fired. */
      readonly kind: 'alert-rule-occurrence';
      readonly rule: {
        readonly id: string;
        readonly name: string;
        readonly lowerBoundMgDl: number;
        readonly upperBoundMgDl: number;
        readonly activeFromMinute: number;
        readonly activeToMinute: number;
        readonly trend: AlertRuleTrend;
      };
      readonly observation: {
        readonly valueMgDl: number;
        readonly trend?: AlertRuleTrend;
      };
    };

export interface UpdateCenterItem {
  readonly id: string;
  readonly kind: 'alert' | 'reminder' | 'generated-update';
  readonly occurredAtMs: number;
  readonly readState: UpdateReadState;
  readonly content: UpdateContent;
  readonly deepLink?: UpdateDeepLinkDescriptor;
}

export interface LegacyRuleTriggerHistory {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly triggeredAtMs: readonly number[];
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: UnknownRecord, keys: readonly string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key));

const isValidId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= 512;

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Runtime guard for all navigation context stored with an update. */
export const isUpdateDeepLinkDescriptor = (
  value: unknown,
): value is UpdateDeepLinkDescriptor => {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false;
  }
  switch (value.kind) {
    case 'alert-occurrence':
      return (
        hasOnlyKeys(value, ['kind', 'occurrenceId']) &&
        isValidId(value.occurrenceId)
      );
    case 'alert-rule':
      return hasOnlyKeys(value, ['kind', 'ruleId']) && isValidId(value.ruleId);
    case 'day':
      return hasOnlyKeys(value, ['kind', 'dayStartMs']) && isTimestamp(value.dayStartMs);
    case 'journal-entry':
      return (
        hasOnlyKeys(value, ['kind', 'entryKind', 'entryId']) &&
        (value.entryKind === 'meal' || value.entryKind === 'activity') &&
        isValidId(value.entryId)
      );
    case 'ai-conversation':
      return (
        hasOnlyKeys(value, ['kind', 'conversationId']) &&
        isValidId(value.conversationId)
      );
    default:
      return false;
  }
};

/**
 * Turns the only facts retained by the legacy notification store into a
 * timeline. Read state, glucose values, and notification text are unknown and
 * therefore never inferred here.
 */
export const projectLegacyRuleTriggerHistory = (
  rules: readonly LegacyRuleTriggerHistory[],
): readonly UpdateCenterItem[] => {
  const items: UpdateCenterItem[] = [];
  rules.forEach(rule => {
    const ruleId = rule.ruleId.trim();
    const ruleName = rule.ruleName.trim();
    if (!isValidId(ruleId) || ruleName.length === 0) {
      return;
    }
    rule.triggeredAtMs.forEach((occurredAtMs, index) => {
      if (!isTimestamp(occurredAtMs)) {
        return;
      }
      const id = `legacy-rule:${ruleId}:${occurredAtMs}:${index}`;
      items.push({
        id,
        kind: 'alert',
        occurredAtMs,
        readState: 'unknown',
        content: {kind: 'alert-rule-trigger', ruleName},
        deepLink: {kind: 'alert-rule', ruleId},
      });
    });
  });
  return items.sort((left, right) => right.occurredAtMs - left.occurredAtMs);
};
