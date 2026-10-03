import type {AiRecommendationRequest} from '../../modules/ai/domain/recommendations';
import type {
  AiConversationMessage,
  AiConversationFocus,
  AiConversationSummary,
  AiLocale,
  AiSpecialistId,
} from '../../modules/ai/domain/types';
import {
  assertLocalAccountActive,
  readProvenLegacyAccountStore,
  withLocalAccountWrite,
  type LocalAccountWorkspaceScope,
} from '../../modules/privacy/localAccountCleanup';

export interface RecommendationQuestion {
  readonly text: string;
  readonly at: number;
}

export interface RecommendationFeedback {
  readonly conversationId: string;
  readonly messageIndex: number;
  readonly rating: 'helpful' | 'not-helpful';
  readonly reasons: readonly string[];
  readonly comment?: string;
  readonly question: string;
  readonly answerExcerpt: string;
  readonly at: number;
}

export interface RecommendationMemory {
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  readonly historyImported: boolean;
  readonly instructions: string;
  readonly questions: readonly RecommendationQuestion[];
  readonly feedback: readonly RecommendationFeedback[];
  readonly conversations: readonly AiConversationSummary[];
}

export interface RecommendationMemoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
}

export interface RecommendationMemoryStore {
  read(): Promise<RecommendationMemory>;
  update(
    mutator: (current: RecommendationMemory) => RecommendationMemory,
  ): Promise<RecommendationMemory>;
  /** Clears personalization; saved conversations remain available as history only. */
  clear(): Promise<void>;
}

const writeQueues = new WeakMap<object, Map<string, Promise<void>>>();
// Includes worst-case JSON escaping for every bounded field below.
const MAX_STORAGE_CHARS = 6_000_000;
const blank = (): RecommendationMemory => ({
  schemaVersion: 1,
  enabled: true,
  historyImported: false,
  instructions: '',
  questions: [],
  feedback: [],
  conversations: [],
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const focusMetadata = (value: unknown): AiConversationFocus | undefined => {
  if (!record(value)) {
    return undefined;
  }
  const validId = (id: unknown): id is string =>
    typeof id === 'string' && id.trim().length > 0 && id.length <= 160;
  switch (value.kind) {
    case 'day':
      return timestamp(value.dayStartMs)
        ? {kind: 'day', dayStartMs: value.dayStartMs}
        : undefined;
    case 'period':
      return timestamp(value.startMs) &&
        timestamp(value.endMs) &&
        value.endMs > value.startMs
        ? {kind: 'period', startMs: value.startMs, endMs: value.endMs}
        : undefined;
    case 'journal-entry':
      return validId(value.entryId) &&
        (value.entryKind === 'meal' || value.entryKind === 'activity')
        ? {
            kind: 'journal-entry',
            entryId: value.entryId,
            entryKind: value.entryKind,
          }
        : undefined;
    case 'external-record':
      return validId(value.recordId) &&
        (value.recordKind === 'carbohydrate' ||
          value.recordKind === 'treatment' ||
          value.recordKind === 'activity')
        ? {
            kind: 'external-record',
            recordId: value.recordId,
            recordKind: value.recordKind,
          }
        : undefined;
    case 'alert-occurrence':
      return validId(value.occurrenceId)
        ? {kind: 'alert-occurrence', occurrenceId: value.occurrenceId}
        : undefined;
    case 'loop-change':
      return validId(value.changeId)
        ? {kind: 'loop-change', changeId: value.changeId}
        : undefined;
    default:
      return undefined;
  }
};

const requestMetadata = (
  value: unknown,
): AiRecommendationRequest | undefined => {
  if (
    !record(value) ||
    typeof value.kind !== 'string' ||
    !['now', 'meal', 'weekly', 'monthly', 'guided'].includes(value.kind)
  ) {
    return undefined;
  }
  const enums = {
    horizon: ['weekly', 'monthly'],
    mealSize: ['small', 'medium', 'large'],
    focus: ['food', 'routine', 'care-team'],
    goal: ['steadier-glucose', 'fewer-lows', 'easier-routine'],
    responseStyle: ['brief', 'detailed'],
  };
  for (const [key, allowed] of Object.entries(enums)) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' ||
        !allowed.includes(value[key] as string))
    ) {
      return undefined;
    }
  }
  if (
    value.patientNotes !== undefined &&
    typeof value.patientNotes !== 'string'
  ) {
    return undefined;
  }
  return {
    kind: value.kind as AiRecommendationRequest['kind'],
    ...(value.horizon === undefined
      ? {}
      : {
          horizon: value.horizon as NonNullable<
            AiRecommendationRequest['horizon']
          >,
        }),
    ...(value.mealSize === undefined
      ? {}
      : {
          mealSize: value.mealSize as NonNullable<
            AiRecommendationRequest['mealSize']
          >,
        }),
    ...(value.focus === undefined
      ? {}
      : {focus: value.focus as NonNullable<AiRecommendationRequest['focus']>}),
    ...(value.goal === undefined
      ? {}
      : {goal: value.goal as NonNullable<AiRecommendationRequest['goal']>}),
    ...(value.responseStyle === undefined
      ? {}
      : {
          responseStyle: value.responseStyle as NonNullable<
            AiRecommendationRequest['responseStyle']
          >,
        }),
    ...(value.patientNotes === undefined
      ? {}
      : {patientNotes: text(value.patientNotes, 3000)}),
  };
};

const sanitize = (value: unknown): RecommendationMemory => {
  if (!record(value) || value.schemaVersion !== 1) {
    return blank();
  }
  const questions: RecommendationQuestion[] = [];
  const seenQuestions = new Set<string>();
  if (Array.isArray(value.questions)) {
    const sorted = value.questions
      .filter(record)
      .filter(item => timestamp(item.at))
      .sort((left, right) => Number(right.at) - Number(left.at));
    for (const item of sorted) {
      const question = text(item.text, 1000);
      if (question && !seenQuestions.has(question)) {
        seenQuestions.add(question);
        questions.push({text: question, at: Number(item.at)});
      }
      if (questions.length >= 60) {
        break;
      }
    }
  }
  const feedback: RecommendationFeedback[] = [];
  const seenFeedback = new Set<string>();
  if (Array.isArray(value.feedback)) {
    const sorted = value.feedback
      .filter(record)
      .filter(item => timestamp(item.at))
      .sort((left, right) => Number(right.at) - Number(left.at));
    for (const item of sorted) {
      const conversationId = text(item.conversationId, 160);
      if (
        !conversationId ||
        !Number.isSafeInteger(item.messageIndex) ||
        Number(item.messageIndex) < 0 ||
        (item.rating !== 'helpful' && item.rating !== 'not-helpful')
      ) {
        continue;
      }
      const key = JSON.stringify([conversationId, item.messageIndex]);
      if (seenFeedback.has(key)) {
        continue;
      }
      seenFeedback.add(key);
      const comment = text(item.comment, 1000);
      feedback.push({
        conversationId,
        messageIndex: Number(item.messageIndex),
        rating: item.rating,
        reasons: Array.isArray(item.reasons)
          ? [
              ...new Set(
                item.reasons.map(reason => text(reason, 160)).filter(Boolean),
              ),
            ].slice(0, 8)
          : [],
        ...(comment ? {comment} : {}),
        question: text(item.question, 1000),
        answerExcerpt: text(item.answerExcerpt, 1200),
        at: Number(item.at),
      });
      if (feedback.length >= 100) {
        break;
      }
    }
  }
  const conversations: AiConversationSummary[] = [];
  const seenConversations = new Set<string>();
  const messagePositions = new Map<string, Map<number, number>>();
  let historyChars = 0;
  if (Array.isArray(value.conversations)) {
    const sorted = value.conversations
      .filter(record)
      .filter(item => timestamp(item.updatedAt) && timestamp(item.createdAt))
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
    for (const item of sorted) {
      const id = text(item.id, 160);
      if (
        !id ||
        seenConversations.has(id) ||
        !Array.isArray(item.messages) ||
        typeof item.specialist !== 'string' ||
        ![
          'general-chat',
          'hypo-investigation',
          'behavior-analysis',
          'meal-analysis',
          'loop-advice',
        ].includes(item.specialist)
      ) {
        continue;
      }
      let conversationChars = 0;
      const messages: AiConversationMessage[] = [];
      const originalPositions: number[] = [];
      const recentMessages = item.messages.slice(-80);
      const firstIndex = item.messages.length - recentMessages.length;
      for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const raw: unknown = recentMessages[index];
        if (!record(raw) || (raw.role !== 'user' && raw.role !== 'assistant')) {
          continue;
        }
        const content = text(raw.content, 10_000);
        if (!content) {
          continue;
        }
        if (conversationChars + content.length > 40_000) {
          break;
        }
        messages.unshift({role: raw.role, content});
        originalPositions.unshift(firstIndex + index);
        conversationChars += content.length;
      }
      if (historyChars + conversationChars > 400_000) {
        break;
      }
      historyChars += conversationChars;
      seenConversations.add(id);
      messagePositions.set(
        id,
        new Map(originalPositions.map((original, index) => [original, index])),
      );
      const recommendation = requestMetadata(item.recommendation);
      const recommendationFocus = focusMetadata(item.recommendationFocus);
      conversations.push({
        id,
        title: text(item.title, 160) || id,
        specialist: item.specialist as AiSpecialistId,
        createdAt: Number(item.createdAt),
        updatedAt: Number(item.updatedAt),
        messages,
        ...(recommendation ? {recommendation} : {}),
        ...(recommendationFocus ? {recommendationFocus} : {}),
      });
      if (conversations.length >= 50) {
        break;
      }
    }
  }
  // Retention can remove messages from the start of a conversation. Never let
  // a saved index silently point at a different answer after that truncation.
  const positionedFeedback: RecommendationFeedback[] = [];
  const positionedKeys = new Set<string>();
  for (const item of feedback) {
    const conversation = conversations.find(
      candidate => candidate.id === item.conversationId,
    );
    if (!conversation) {
      positionedFeedback.push(item);
      continue;
    }
    const matches = (index: number): boolean => {
      const message = conversation.messages[index];
      if (
        message?.role !== 'assistant' ||
        !item.answerExcerpt ||
        !message.content.startsWith(item.answerExcerpt)
      ) {
        return false;
      }
      const precedingQuestion = conversation.messages
        .slice(0, index)
        .filter(candidate => candidate.role === 'user')
        .pop();
      return (
        !item.question ||
        !precedingQuestion ||
        precedingQuestion.content.startsWith(item.question)
      );
    };
    let index = messagePositions
      .get(item.conversationId)
      ?.get(item.messageIndex);
    if (index === undefined || !matches(index)) {
      // A UI may submit feedback while still displaying the just-completed,
      // longer session. Resolve that stale index only with an unambiguous
      // patient-question/answer match, never by guessing another position.
      const candidates = conversation.messages
        .map((_message, candidate) => candidate)
        .filter(matches);
      index = candidates.length === 1 ? candidates[0] : undefined;
    }
    if (index === undefined) {
      continue;
    }
    const key = JSON.stringify([item.conversationId, index]);
    if (positionedKeys.has(key)) {
      continue;
    }
    positionedKeys.add(key);
    positionedFeedback.push({...item, messageIndex: index});
  }
  return {
    schemaVersion: 1,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    historyImported: value.historyImported === true,
    instructions: text(value.instructions, 3000),
    questions,
    feedback: positionedFeedback,
    conversations,
  };
};

export const createRecommendationMemoryStore = (input: {
  readonly storage: RecommendationMemoryStorage;
  readonly scopeId: string;
  readonly accountScope?: LocalAccountWorkspaceScope;
  readonly legacyScopeId?: string;
}): RecommendationMemoryStore => {
  if (!input.scopeId.trim() || input.scopeId.length > 1024) {
    throw new Error('Recommendation memory scope is invalid.');
  }
  const key = `shani.ai.recommendations.v1:${encodeURIComponent(
    input.scopeId,
  )}`;
  let queues = writeQueues.get(input.storage);
  if (!queues) {
    queues = new Map();
    writeQueues.set(input.storage, queues);
  }
  const scopedQueues = queues;
  const readStored = async (): Promise<RecommendationMemory> => {
    const uid = input.accountScope?.productUserId;
    if (uid !== undefined) {
      await assertLocalAccountActive(input.storage, uid);
    }
    let raw = await input.storage.getItem(key);
    let ownerScope = input.scopeId;
    if (raw === null && input.accountScope && input.legacyScopeId) {
      raw = await readProvenLegacyAccountStore(input.storage,
        `shani.ai.recommendations.v1:${encodeURIComponent(input.legacyScopeId)}`, input.accountScope);
      ownerScope = input.legacyScopeId;
    }
    if (uid !== undefined) {
      await assertLocalAccountActive(input.storage, uid);
    }
    if (!raw || raw.length > MAX_STORAGE_CHARS) {
      return blank();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return record(parsed) && parsed.ownerScope === ownerScope &&
        (parsed.ownerProductUserId === undefined || parsed.ownerProductUserId === uid)
        ? sanitize(parsed)
        : blank();
    } catch {
      return blank();
    }
  };
  const update = (
    mutator: (current: RecommendationMemory) => RecommendationMemory,
  ): Promise<RecommendationMemory> => {
    const previous = scopedQueues.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const next = sanitize(mutator(await readStored()));
        const serialized = JSON.stringify({...next, ownerScope: input.scopeId,
          ...(input.accountScope === undefined ? {} : {
            ownerProductUserId: input.accountScope.productUserId,
            workspaceId: input.accountScope.workspaceId,
          }),
        });
        if (serialized.length > MAX_STORAGE_CHARS) {
          throw new Error(
            'Recommendation memory exceeds the supported storage size.',
          );
        }
        await withLocalAccountWrite(input.storage, input.accountScope?.productUserId,
          () => input.storage.setItem(key, serialized));
        return next;
      });
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    scopedQueues.set(key, settled);
    settled.then(() => {
      if (scopedQueues.get(key) === settled) {
        scopedQueues.delete(key);
      }
    });
    return run;
  };
  return {
    read: async () => {
      await scopedQueues.get(key);
      return readStored();
    },
    update,
    clear: async () => {
      await update(current => ({
        ...current,
        historyImported: true,
        instructions: '',
        questions: [],
        feedback: [],
      }));
    },
  };
};

/** Only patient-originated preferences and feedback, never a synthetic clinical profile. */
export const buildRecommendationPatientContext = (
  memory: RecommendationMemory,
  locale: AiLocale,
): string => {
  if (!memory.enabled) {
    return '';
  }
  const safe = sanitize(memory);
  const he = locale === 'he';
  const parts = [
    he
      ? 'זיכרון מטופל: העדפות ושאלות מהעבר בלבד. אינו מדידה נוכחית, עובדה רפואית או הוכחה שהמלצה עבדה.'
      : 'Patient memory: prior preferences and questions only. Not current readings, medical facts, or evidence that a recommendation worked.',
  ];
  if (safe.instructions) {
    parts.push(
      `${
        he ? 'הנחיות מפורשות מהמטופל' : 'Explicit patient instructions'
      }: ${JSON.stringify(safe.instructions)}`,
    );
  }
  for (const item of safe.feedback.slice(0, 8)) {
    const line = `${
      he ? 'משוב שהמטופל נתן' : 'Patient feedback'
    }: ${JSON.stringify({
      rating: item.rating,
      reasons: item.reasons,
      comment: item.comment,
      question: item.question.slice(0, 400),
      answerExcerpt: item.answerExcerpt.slice(0, 400),
      at: item.at,
    })}`;
    if (parts.join('\n').length + line.length > 8000) {
      break;
    }
    parts.push(line);
  }
  for (const item of safe.questions.slice(0, 10)) {
    const line = `${
      he ? 'שאלה קודמת מהמטופל' : 'Previous patient question'
    }: ${JSON.stringify(item)}`;
    if (parts.join('\n').length + line.length > 9500) {
      break;
    }
    parts.push(line);
  }
  return parts.length === 1 ? '' : parts.join('\n');
};
