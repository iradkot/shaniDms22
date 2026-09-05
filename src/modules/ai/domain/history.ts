import type {
  AiConversationMessage,
  AiConversationSummary,
  AiSpecialistId,
} from './types';

const MAX_HISTORY_ITEMS = 25;

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

const finiteTimestamp = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const decodeMessages = (value: unknown): readonly AiConversationMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: AiConversationMessage[] = [];
  value.forEach((candidate: unknown) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('role' in candidate) ||
      !('content' in candidate) ||
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string' ||
      candidate.content.trim().length === 0
    ) {
      return;
    }
    messages.push({
      role: candidate.role,
      content: candidate.content,
    });
  });
  return messages;
};

/** Strict adapter for persisted legacy history at the AI module seam. */
export const decodeAiConversationHistory = (
  value: unknown,
): readonly AiConversationSummary[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const decoded: AiConversationSummary[] = [];
  value.forEach((candidate: unknown) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return;
      }
      const source = candidate as Record<string, unknown>;
      const id = typeof source.id === 'string' ? source.id.trim() : '';
      const updatedAt = finiteTimestamp(source.updatedAt);
      if (!id || updatedAt === undefined) {
        return;
      }
      const createdAt = finiteTimestamp(source.createdAt) ?? updatedAt;
      const title =
        typeof source.title === 'string' && source.title.trim().length > 0
          ? source.title.trim()
          : 'Conversation';
      decoded.push({
        id,
        title,
        specialist: missionSpecialist(source.mission),
        createdAt,
        updatedAt,
        messages: decodeMessages(source.messages),
      });
    });
  return decoded
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_HISTORY_ITEMS);
};
