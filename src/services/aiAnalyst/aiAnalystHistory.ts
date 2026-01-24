import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiHistoryRole = 'user' | 'assistant';

export type AiHistoryMessage = {
  role: AiHistoryRole;
  content: string;
  ts: number;
};

export type AiConversationHistoryItem = {
  id: string;
  createdAt: number;
  updatedAt: number;
  mission?: string;
  title: string;
  messages: AiHistoryMessage[];
};

const STORAGE_KEY = 'aiAnalyst.history.v1';

const MAX_CONVERSATIONS = 25;
const MAX_MESSAGES_PER_CONVO = 80;
const MAX_CHARS_PER_MESSAGE = 2000;
const MAX_TOTAL_CHARS_PER_CONVO = 25000;

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function clampString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

function sanitizeMessages(messages: Array<{role: AiHistoryRole; content: string}>): AiHistoryMessage[] {
  const now = Date.now();
  const trimmed = (messages ?? [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({
      role: m.role,
      content: clampString(safeString(m.content).trim(), MAX_CHARS_PER_MESSAGE),
      ts: now,
    }))
    .filter(m => m.content.length > 0)
    .slice(-MAX_MESSAGES_PER_CONVO);

  // Cap total chars by dropping oldest messages.
  let total = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  if (total <= MAX_TOTAL_CHARS_PER_CONVO) return trimmed;

  const out = [...trimmed];
  while (out.length > 1 && total > MAX_TOTAL_CHARS_PER_CONVO) {
    const removed = out.shift();
    total -= removed?.content?.length ?? 0;
  }
  return out;
}

function deriveTitle(params: {mission?: string; messages: Array<{role: AiHistoryRole; content: string}>}): string {
  const {mission, messages} = params;
  const userMsg = (messages ?? []).find(m => m.role === 'user' && safeString(m.content).trim().length > 0);
  const base = userMsg ? safeString(userMsg.content).trim() : '';
  if (base) return clampString(base.replace(/\s+/g, ' '), 64);
  if (mission) return `${mission}`;
  return 'Conversation';
}

export async function loadAiAnalystHistory(): Promise<AiConversationHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(Boolean)
      .map((x: any) => ({
        id: safeString(x?.id),
        createdAt: typeof x?.createdAt === 'number' ? x.createdAt : Date.now(),
        updatedAt: typeof x?.updatedAt === 'number' ? x.updatedAt : Date.now(),
        mission: typeof x?.mission === 'string' ? x.mission : undefined,
        title: safeString(x?.title) || 'Conversation',
        messages: Array.isArray(x?.messages)
          ? x.messages
              .map((m: any) => ({
                role: m?.role === 'assistant' ? 'assistant' : 'user',
                content: safeString(m?.content),
                ts: typeof m?.ts === 'number' ? m.ts : Date.now(),
              }))
              .filter((m: AiHistoryMessage) => m.content.length > 0)
          : [],
      }))
      .filter((x: AiConversationHistoryItem) => x.id.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

async function saveAiAnalystHistory(items: AiConversationHistoryItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore (storage may be full)
  }
}

export async function upsertAiAnalystConversationSnapshot(params: {
  id: string;
  mission?: string;
  messages: Array<{role: AiHistoryRole; content: string}>;
}): Promise<void> {
  const id = safeString(params.id);
  if (!id) return;

  const now = Date.now();
  const sanitizedMessages = sanitizeMessages(params.messages);
  const title = deriveTitle({mission: params.mission, messages: sanitizedMessages});

  const existing = await loadAiAnalystHistory();
  const idx = existing.findIndex(c => c.id === id);

  const nextItem: AiConversationHistoryItem = idx >= 0
    ? {
        ...existing[idx],
        updatedAt: now,
        mission: params.mission ?? existing[idx].mission,
        title,
        messages: sanitizedMessages,
      }
    : {
        id,
        createdAt: now,
        updatedAt: now,
        mission: params.mission,
        title,
        messages: sanitizedMessages,
      };

  const without = existing.filter(c => c.id !== id);
  const next = [nextItem, ...without].slice(0, MAX_CONVERSATIONS);
  await saveAiAnalystHistory(next);
}

export async function deleteAiAnalystConversation(id: string): Promise<void> {
  const existing = await loadAiAnalystHistory();
  await saveAiAnalystHistory(existing.filter(c => c.id !== id));
}

export async function clearAiAnalystHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
