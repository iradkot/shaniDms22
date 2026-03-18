import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY_KEY = 'aiMemory:v1:entries';
const PROFILE_KEY = 'aiMemory:v1:profile';

export type MemoryType = 'profile' | 'episode' | 'chat_summary';

export type MemoryEntry = {
  id: string;
  type: MemoryType;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  textSummary: string;
  facts?: Record<string, any>;
  source?: 'user' | 'sensor' | 'ai' | 'system';
  confidence?: number; // 0..1
  expiresAt?: number | null;
};

export type ProfileSnapshot = {
  communicationStyle?: string;
  dominantRisk?: 'lows' | 'highs' | 'balanced';
  avgTir7d?: number;
  avgGlucose7d?: number;
  notes?: string[];
  updatedAt: number;
};

function nowMs() {
  return Date.now();
}

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function uniq(items: string[]) {
  return [...new Set((items ?? []).filter(Boolean))];
}

function tokenize(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .slice(0, 128);
}

function overlapScore(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = new Set(tokenize(candidate));
  if (!q.length || !c.size) return 0;
  let hit = 0;
  for (const token of q) if (c.has(token)) hit += 1;
  return hit / q.length;
}

async function readEntries(): Promise<MemoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries: MemoryEntry[]) {
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(entries));
}

function pruneEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const now = nowMs();
  const alive = (entries ?? []).filter(e => !e.expiresAt || e.expiresAt > now);

  // Keep at most 500 entries total with simple recency policy.
  alive.sort((a, b) => b.updatedAt - a.updatedAt);
  return alive.slice(0, 500);
}

export async function addMemoryEntry(input: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) {
  const ts = nowMs();
  const entry: MemoryEntry = {
    id: genId(input.type || 'mem'),
    type: input.type,
    createdAt: ts,
    updatedAt: ts,
    tags: uniq(input.tags ?? []),
    textSummary: String(input.textSummary ?? '').trim(),
    facts: input.facts ?? {},
    source: input.source ?? 'system',
    confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined,
    expiresAt: input.expiresAt ?? null,
  };

  if (!entry.textSummary) return null;

  const entries = await readEntries();
  const next = pruneEntries([entry, ...entries]);
  await writeEntries(next);
  return entry;
}

export async function getMemoryByIds(ids: string[]) {
  const idSet = new Set(ids ?? []);
  const entries = await readEntries();
  return entries.filter(e => idSet.has(e.id));
}

export async function searchMemory(query: string, opts?: {types?: MemoryType[]; limit?: number}) {
  const entries = await readEntries();
  const limit = Math.max(1, Math.min(20, opts?.limit ?? 6));
  const typeSet = opts?.types?.length ? new Set(opts.types) : null;

  const scored = entries
    .filter(e => (typeSet ? typeSet.has(e.type) : true))
    .map(e => {
      const haystack = `${e.textSummary} ${(e.tags ?? []).join(' ')} ${JSON.stringify(e.facts ?? {})}`;
      const semantic = overlapScore(query, haystack);
      const recencyDays = (nowMs() - e.updatedAt) / (24 * 60 * 60 * 1000);
      const recencyBoost = Math.max(0, 1 - recencyDays / 30) * 0.25;
      const confidenceBoost = (e.confidence ?? 0.5) * 0.15;
      const score = semantic + recencyBoost + confidenceBoost;
      return {entry: e, score};
    })
    .filter(x => x.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(x => ({
    id: x.entry.id,
    type: x.entry.type,
    score: Number(x.score.toFixed(3)),
    tags: x.entry.tags,
    textSummary: x.entry.textSummary,
    updatedAt: x.entry.updatedAt,
  }));
}

export async function loadProfileSnapshot(): Promise<ProfileSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as ProfileSnapshot;
  } catch {
    return null;
  }
}

export async function upsertProfileSnapshot(patch: Partial<ProfileSnapshot>) {
  const prev = (await loadProfileSnapshot()) ?? {updatedAt: nowMs()};
  const next: ProfileSnapshot = {
    ...prev,
    ...patch,
    notes: uniq([...(prev.notes ?? []), ...(patch.notes ?? [])]),
    updatedAt: nowMs(),
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

export async function buildCompactPatientMemory() {
  const [profile, recentEpisodes] = await Promise.all([
    loadProfileSnapshot(),
    searchMemory('meal low high loop correction pattern similar response', {types: ['episode', 'chat_summary'], limit: 5}),
  ]);

  return {
    profile,
    relevantRecentMemories: recentEpisodes,
  };
}
