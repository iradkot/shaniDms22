import {
  buildRecommendationPatientContext,
  createRecommendationMemoryStore,
} from '../../src/services/aiRecommendations/recommendationMemory';
import type {
  RecommendationFeedback,
  RecommendationMemory,
} from '../../src/services/aiRecommendations/recommendationMemory';

class MemoryStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const feedback: RecommendationFeedback = {
  conversationId: 'rec-1',
  messageIndex: 1,
  rating: 'helpful',
  reasons: ['clear'],
  comment: 'Keep explanations short.',
  question: 'Help with breakfast.',
  answerExcerpt: 'A prior suggestion, not an observed outcome.',
  at: 123,
};

describe('recommendation patient memory', () => {
  it('round-trips explicit instructions, questions, feedback and typed recommendation history', async () => {
    const storage = new MemoryStorage();
    const store = createRecommendationMemoryStore({
      storage,
      scopeId: 'patient:workspace',
    });
    await store.update(current => ({
      ...current,
      instructions: 'Use simple explanations.',
      historyImported: true,
      questions: [{text: 'How can breakfast be simpler?', at: 100}],
      feedback: [feedback],
      conversations: [
        {
          id: 'rec-1',
          title: 'Monthly meals',
          specialist: 'meal-analysis',
          createdAt: 100,
          updatedAt: 123,
          messages: [
            {role: 'user', content: feedback.question},
            {role: 'assistant', content: feedback.answerExcerpt},
          ],
          recommendation: {
            kind: 'guided',
            horizon: 'monthly',
            focus: 'food',
            responseStyle: 'brief',
          },
        },
      ],
    }));
    const reloaded = await createRecommendationMemoryStore({
      storage,
      scopeId: 'patient:workspace',
    }).read();
    expect(reloaded).toMatchObject({
      instructions: 'Use simple explanations.',
      historyImported: true,
      feedback: [feedback],
    });
    expect(reloaded.conversations[0]?.recommendation).toEqual({
      kind: 'guided',
      horizon: 'monthly',
      focus: 'food',
      responseStyle: 'brief',
    });
    const context = buildRecommendationPatientContext(reloaded, 'en');
    expect(context.indexOf('Explicit patient instructions')).toBeLessThan(
      context.indexOf('Patient feedback'),
    );
    expect(context).toContain('How can breakfast be simpler?');
    expect(context).toContain('Not current readings');
  });

  it('isolates accounts and workspaces, including copied wrong-owner storage', async () => {
    const storage = new MemoryStorage();
    const left = createRecommendationMemoryStore({
      storage,
      scopeId: 'user-a/workspace-a',
    });
    const right = createRecommendationMemoryStore({
      storage,
      scopeId: 'user-a/workspace-b',
    });
    const otherUser = createRecommendationMemoryStore({
      storage,
      scopeId: 'user-b/workspace-a',
    });
    await left.update(current => ({
      ...current,
      instructions: 'Only patient A.',
    }));
    expect((await right.read()).instructions).toBe('');
    expect((await otherUser.read()).instructions).toBe('');
    await right.update(current => current);
    const keys = [...storage.values.keys()];
    storage.values.set(keys[1]!, storage.values.get(keys[0]!)!);
    expect((await right.read()).instructions).toBe('');
  });

  it('serializes concurrent updates across store instances without losing patient input', async () => {
    const storage = new MemoryStorage();
    const a = createRecommendationMemoryStore({storage, scopeId: 'a'});
    const b = createRecommendationMemoryStore({storage, scopeId: 'a'});
    await Promise.all(
      Array.from({length: 12}, (_, index) =>
        (index % 2 ? a : b).update(current => ({
          ...current,
          questions: [
            ...current.questions,
            {text: `Question ${index}`, at: index},
          ],
        })),
      ),
    );
    expect((await a.read()).questions).toHaveLength(12);
  });

  it('rejects failed storage writes and lets later updates recover', async () => {
    const storage = new MemoryStorage();
    const save = jest
      .spyOn(storage, 'setItem')
      .mockRejectedValueOnce(new Error('Storage full'));
    const store = createRecommendationMemoryStore({storage, scopeId: 'a'});
    await expect(
      store.update(current => ({...current, instructions: 'Not saved.'})),
    ).rejects.toThrow('Storage full');
    expect((await store.read()).instructions).toBe('');
    await store.update(current => ({...current, instructions: 'Saved later.'}));
    expect((await store.read()).instructions).toBe('Saved later.');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('returns no patient context while disabled', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    const memory = await store.update(current => ({
      ...current,
      enabled: false,
      instructions: 'Private instruction.',
      questions: [{text: 'Private question?', at: 100}],
      feedback: [feedback],
    }));
    expect(buildRecommendationPatientContext(memory, 'en')).toBe('');
    expect((await store.read()).enabled).toBe(false);
  });

  it('clears learned context, retains viewable history and prevents old history reimport', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    await store.update(current => ({
      ...current,
      instructions: 'Forget this.',
      questions: [{text: 'Old question', at: 1}],
      feedback: [feedback],
      conversations: [
        {
          id: 'old',
          title: 'Saved conversation',
          specialist: 'general-chat',
          createdAt: 1,
          updatedAt: 2,
          messages: [{role: 'user', content: 'Old question'}],
        },
      ],
    }));
    await store.clear();
    const memory = await store.read();
    expect(memory).toMatchObject({
      instructions: '',
      questions: [],
      feedback: [],
      historyImported: true,
    });
    expect(memory.conversations).toHaveLength(1);
    expect(buildRecommendationPatientContext(memory, 'en')).toBe('');
  });

  it('treats corrupt data and unknown schemas as empty without accepting model-created facts', async () => {
    const storage = new MemoryStorage();
    const store = createRecommendationMemoryStore({storage, scopeId: 'a'});
    await store.update(current => current);
    const key = [...storage.values.keys()][0]!;
    storage.values.set(key, '{invalid');
    expect((await store.read()).feedback).toEqual([]);
    storage.values.set(
      key,
      JSON.stringify({
        ownerScope: 'a',
        schemaVersion: 900,
        instructions: 'Do not trust this.',
      }),
    );
    expect((await store.read()).instructions).toBe('');
    storage.values.set(
      key,
      JSON.stringify({
        ownerScope: 'a',
        schemaVersion: 1,
        feedback: [{...feedback, rating: 'cured'}],
        questions: [{text: 'invalid timestamp', at: -1}],
        clinicalFacts: ['A guess'],
      }),
    );
    expect(await store.read()).toMatchObject({feedback: [], questions: []});
  });

  it('caps text and collection sizes and replaces a rating for the same answer', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    const memory = await store.update(current => ({
      ...current,
      instructions: 'x'.repeat(4000),
      questions: Array.from({length: 80}, (_, at) => ({
        text: `Question ${at}`,
        at,
      })),
      feedback: [
        feedback,
        {
          ...feedback,
          rating: 'not-helpful',
          comment: 'Actually too long.',
          at: 999,
        },
      ],
    }));
    expect(memory.instructions).toHaveLength(3000);
    expect(memory.questions).toHaveLength(60);
    expect(memory.feedback).toHaveLength(1);
    expect(memory.feedback[0]?.rating).toBe('not-helpful');
    expect((await store.read()).questions).toHaveLength(60);
  });

  it('drops invalid request metadata but preserves the old conversation', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    const memory = await store.update(
      current =>
        ({
          ...current,
          conversations: [
            {
              id: 'old',
              title: 'Old',
              specialist: 'general-chat',
              createdAt: 1,
              updatedAt: 1,
              messages: [],
              recommendation: {kind: 'guided', horizon: 'century'},
            },
          ],
        } as unknown as RecommendationMemory),
    );
    expect(memory.conversations).toHaveLength(1);
    expect(memory.conversations[0]?.recommendation).toBeUndefined();
  });

  it('retains validated historical focus and discards malformed focus metadata', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    const history = {
      id: 'focused',
      title: 'Focused history',
      specialist: 'general-chat' as const,
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      recommendation: {kind: 'weekly' as const},
    };
    await store.update(current => ({
      ...current,
      conversations: [
        {
          ...history,
          recommendationFocus: {kind: 'period', startMs: 1000, endMs: 2000},
        },
      ],
    }));
    expect((await store.read()).conversations[0]?.recommendationFocus).toEqual({
      kind: 'period',
      startMs: 1000,
      endMs: 2000,
    });
    const invalid = await store.update(current => ({
      ...current,
      conversations: [
        {
          ...history,
          recommendationFocus: {kind: 'period', startMs: 2000, endMs: 1000},
        },
      ],
    }));
    expect(invalid.conversations[0]?.recommendationFocus).toBeUndefined();
  });

  it('keeps ratings attached to their answer when old conversation messages are removed', async () => {
    const store = createRecommendationMemoryStore({
      storage: new MemoryStorage(),
      scopeId: 'a',
    });
    const messages = Array.from({length: 100}, (_, index) => ({
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      content: index % 2 ? `Answer ${index}` : `Question ${index}`,
    }));
    const memory = await store.update(current => ({
      ...current,
      conversations: [
        {
          id: 'long',
          title: 'Long conversation',
          specialist: 'general-chat',
          createdAt: 1,
          updatedAt: 100,
          messages,
        },
      ],
      feedback: [
        {
          ...feedback,
          conversationId: 'long',
          messageIndex: 99,
          question: 'Question 98',
          answerExcerpt: 'Answer 99',
        },
        {
          ...feedback,
          conversationId: 'long',
          messageIndex: 1,
          question: 'Question 0',
          answerExcerpt: 'Answer 1',
        },
      ],
    }));
    expect(memory.conversations[0]?.messages).toHaveLength(80);
    expect(memory.feedback).toHaveLength(1);
    expect(memory.feedback[0]?.messageIndex).toBe(79);
    const reloaded = await store.read();
    expect(reloaded.feedback[0]?.messageIndex).toBe(79);
    expect(reloaded.conversations[0]?.messages[79]?.content).toBe('Answer 99');
    // The view can briefly still hold the longer session after its save.
    const changed = await store.update(current => ({
      ...current,
      feedback: [
        ...current.feedback,
        {
          ...feedback,
          conversationId: 'long',
          messageIndex: 99,
          question: 'Question 98',
          answerExcerpt: 'Answer 99',
          rating: 'not-helpful',
          at: 999,
        },
      ],
    }));
    expect(changed.feedback).toHaveLength(1);
    expect(changed.feedback[0]).toMatchObject({
      messageIndex: 79,
      rating: 'not-helpful',
    });
  });

  it('round-trips bounded data even when JSON escaping makes storage larger than 700k', async () => {
    const storage = new MemoryStorage();
    const store = createRecommendationMemoryStore({storage, scopeId: 'a'});
    const saved = await store.update(current => ({
      ...current,
      conversations: Array.from({length: 20}, (_, index) => ({
        id: `conversation-${index}`,
        title: 'Bounded text',
        specialist: 'general-chat' as const,
        createdAt: index,
        updatedAt: index,
        messages: Array.from({length: 4}, () => ({
          role: 'assistant' as const,
          content: '\u0000'.repeat(10_000),
        })),
      })),
    }));
    const raw = [...storage.values.values()][0]!;
    expect(raw.length).toBeGreaterThan(700_000);
    expect(raw.length).toBeLessThanOrEqual(6_000_000);
    expect((await store.read()).conversations).toEqual(saved.conversations);
  });
});
