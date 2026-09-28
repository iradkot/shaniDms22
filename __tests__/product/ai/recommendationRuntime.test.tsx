import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {
  AiConversationSummary,
  AiRecommendationRequest,
} from 'app/modules/ai';
import type {AiAnalystModuleRuntime} from 'app/product/ai/runtime';
import {
  useRecommendationRuntime,
  type RecommendationRuntimePorts,
} from 'app/product/ai/useRecommendationRuntime';

class MemoryStorage {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  async getItem(key: string): Promise<string | null> {
    if (this.failReads) {
      throw new Error('Private storage error');
    }
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failWrites) {
      throw new Error('Private storage error');
    }
    this.values.set(key, value);
  }
}

const baseRuntime = (): AiAnalystModuleRuntime => ({
  snapshot: {
    availability: 'ready',
    surface: {kind: 'landing'},
    activeSpecialist: 'general-chat',
    visibleContext: undefined,
    messages: [],
    draft: '',
    busy: false,
    progress: '',
    error: undefined,
    history: [],
    historyBusy: false,
  },
  setDraft: jest.fn(),
  start: jest.fn(async () => undefined),
  send: jest.fn(async () => undefined),
  retry: jest.fn(async () => undefined),
  cancel: jest.fn(),
  openLanding: jest.fn(),
  openHistory: jest.fn(async () => undefined),
  openHistoryDetail: jest.fn(),
  resumeConversation: jest.fn(async () => undefined),
  deleteConversation: jest.fn(async () => undefined),
  clearHistory: jest.fn(async () => undefined),
  openSettings: jest.fn(),
});

const mounted = new Set<renderer.ReactTestRenderer>();
const fixtures = () => {
  const storage = new MemoryStorage();
  const chat = jest.fn<
    ReturnType<RecommendationRuntimePorts['chat']>,
    Parameters<RecommendationRuntimePorts['chat']>
  >(async messages =>
    messages[0]?.content.includes('final reviewer and writer')
      ? 'Check your current reading before choosing your next step.'
      : 'Current evidence is incomplete. Ask for a current reading.',
  );
  const loadEvidence = jest.fn<
    ReturnType<RecommendationRuntimePorts['loadEvidence']>,
    Parameters<RecommendationRuntimePorts['loadEvidence']>
  >(
    async () =>
      'The latest available glucose sample is stale. Current IOB and COB are unavailable.',
  );
  const ports: RecommendationRuntimePorts = {
    scopeId: 'patient-a/workspace-a',
    locale: 'en',
    storage,
    chat,
    loadEvidence,
  };
  return {storage, chat, loadEvidence, ports};
};

const mount = async (
  ports: RecommendationRuntimePorts,
  base = baseRuntime(),
) => {
  let captured: AiAnalystModuleRuntime | undefined;
  const Harness = ({input}: {readonly input: RecommendationRuntimePorts}) => {
    captured = useRecommendationRuntime(base, input);
    return null;
  };
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<Harness input={ports} />);
  });
  if (!tree) {
    throw new Error('Harness did not mount');
  }
  const rendered = tree;
  mounted.add(rendered);
  return {
    base,
    get runtime(): AiAnalystModuleRuntime {
      if (!captured) {
        throw new Error('Runtime unavailable');
      }
      return captured;
    },
    update: async (input: RecommendationRuntimePorts) => {
      await act(async () => {
        rendered.update(<Harness input={input} />);
      });
    },
    unmount: () => {
      act(() => rendered.unmount());
      mounted.delete(rendered);
    },
  };
};

const userPayload = (
  chat: ReturnType<typeof fixtures>['chat'],
  index: number,
) => {
  const serialized = chat.mock.calls[index]?.[0].find(
    message => message.role === 'user',
  )?.content;
  if (!serialized) {
    throw new Error('Missing provider payload');
  }
  return JSON.parse(serialized) as {
    requestedDays: number;
    patientContext: string;
    conversation: readonly {role: string; content: string}[];
  };
};

afterEach(() => {
  for (const tree of mounted) {
    act(() => tree.unmount());
  }
  mounted.clear();
});

describe('shared recommendation runtime', () => {
  it.each(['start', 'resumeConversation'] as const)(
    'continues legacy history through recommendations after %s while retaining its transcript and saved focus',
    async entry => {
      const {ports, chat, loadEvidence} = fixtures();
      const focus = {
        kind: 'period' as const,
        startMs: 1000,
        endMs: 1000 + 30 * 86_400_000,
      };
      const legacy: AiConversationSummary = {
        id: 'legacy-hypo-thread',
        title: 'Earlier lows discussion',
        specialist: 'hypo-investigation',
        recommendationFocus: focus,
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            role: 'user',
            content: 'Could my evening routine explain those lows?',
          },
          {
            role: 'assistant',
            content: 'The earlier readings alone did not establish a cause.',
          },
        ],
      };
      const loadLegacyHistory = jest.fn(async () => [legacy]);
      const base = baseRuntime();
      const harness = await mount(
        {...ports, loadLegacyHistory},
        {
          ...base,
          snapshot: {...base.snapshot, history: [legacy]},
        },
      );
      await act(async () =>
        entry === 'start'
          ? harness.runtime.start({
              specialist: 'general-chat',
              locale: 'en',
              focus: {kind: 'ai-conversation', conversationId: legacy.id},
            })
          : harness.runtime.resumeConversation(legacy.id),
      );
      expect(chat).not.toHaveBeenCalled();
      expect(harness.runtime.snapshot.messages).toEqual(legacy.messages);
      expect(harness.runtime.snapshot.visibleContext).toContain(
        'Focused period',
      );
      act(() =>
        harness.runtime.setDraft('Help me choose one easier next step.'),
      );
      await act(async () => harness.runtime.send());
      expect(base.start).not.toHaveBeenCalled();
      expect(base.resumeConversation).not.toHaveBeenCalled();
      expect(base.send).not.toHaveBeenCalled();
      expect(chat).toHaveBeenCalledTimes(3);
      expect(loadEvidence.mock.calls[0]?.[0]).toMatchObject({
        focus,
        request: {kind: 'guided', horizon: 'monthly', goal: 'fewer-lows'},
      });
      expect(userPayload(chat, 0).conversation.slice(0, 2)).toEqual(
        legacy.messages,
      );
      expect(harness.runtime.snapshot.messages.slice(0, 2)).toEqual(
        legacy.messages,
      );
      expect(harness.runtime.snapshot.history).toHaveLength(1);
      expect(harness.runtime.snapshot.history[0]).toMatchObject({
        id: legacy.id,
        recommendationFocus: focus,
      });
      await act(async () => harness.runtime.deleteConversation(legacy.id));
      expect(base.deleteConversation).toHaveBeenCalledWith(legacy.id);
    },
  );

  it('does not invent a historical date range when an old thread only saved its messages', async () => {
    const {ports, chat, loadEvidence} = fixtures();
    const legacy: AiConversationSummary = {
      id: 'old-loop',
      title: 'Old Loop discussion',
      specialist: 'loop-advice',
      createdAt: 1,
      updatedAt: 2,
      messages: [
        {role: 'user', content: 'What should I ask my team about last month?'},
      ],
    };
    const harness = await mount({
      ...ports,
      loadLegacyHistory: async () => [legacy],
    });
    await act(async () => harness.runtime.resumeConversation(legacy.id));
    act(() => harness.runtime.setDraft('Make the questions simpler.'));
    await act(async () => harness.runtime.send());
    expect(chat).toHaveBeenCalledTimes(3);
    expect(harness.base.send).not.toHaveBeenCalled();
    expect(loadEvidence.mock.calls[0]?.[0].focus).toBeUndefined();
    expect(loadEvidence.mock.calls[0]?.[0].request.focus).toBe('care-team');
    expect(userPayload(chat, 0).conversation[0]).toEqual(legacy.messages[0]);
  });

  it.each([
    ['en', 'hard to put into practice', 'I have already tried this'],
    ['he', 'קשה ליישום', 'כבר ניסיתי את זה'],
  ] as const)(
    'uses patient-facing %s labels for the actual feedback reason keys',
    async (locale, hard, tried) => {
      const {ports} = fixtures();
      const harness = await mount({...ports, locale});
      await act(async () =>
        harness.runtime.startRecommendation?.({request: {kind: 'now'}, locale}),
      );
      await act(async () =>
        harness.runtime.saveFeedback?.({
          messageIndex: 1,
          rating: 'not-helpful',
          reasons: ['hard-to-follow', 'already-tried'],
        }),
      );
      await act(async () => harness.runtime.reviseFromFeedback?.(1));
      expect(harness.runtime.snapshot.messages[2]?.content).toContain(hard);
      expect(harness.runtime.snapshot.messages[2]?.content).toContain(tried);
      expect(harness.runtime.snapshot.messages[2]?.content).not.toContain(
        'hard-to-follow',
      );
      expect(harness.runtime.snapshot.messages[2]?.content).not.toContain(
        'already-tried',
      );
    },
  );

  it('rejects an older feedback callback after navigation to another recommendation in the same workspace', async () => {
    const {ports, chat, storage} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    const previous = harness.runtime;
    const previousKey = previous.snapshot.recommendationContextKey;
    await act(async () =>
      previous.saveFeedback?.({
        messageIndex: 1,
        rating: 'not-helpful',
        reasons: ['unclear'],
      }),
    );
    expect(harness.runtime.snapshot.recommendationContextKey).toBe(previousKey);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'monthly'},
        locale: 'en',
      }),
    );
    const currentMessages = harness.runtime.snapshot.messages;
    expect(harness.runtime.snapshot.recommendationContextKey).not.toBe(
      previousKey,
    );
    const read = jest.spyOn(storage, 'getItem');
    chat.mockClear();
    await act(async () => previous.reviseFromFeedback?.(1));
    expect(read).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
    expect(harness.runtime.snapshot.messages).toEqual(currentMessages);
    expect(harness.runtime.snapshot.history).toHaveLength(2);
    read.mockRestore();
  });

  it('adapts only the explicitly selected rated answer and retains its saved historical period', async () => {
    const {ports, chat, loadEvidence} = fixtures();
    const focus = {
      kind: 'period' as const,
      startMs: Date.parse('2026-05-01T00:00:00Z'),
      endMs: Date.parse('2026-05-31T00:00:00Z'),
    };
    const first = await mount(ports);
    await act(async () =>
      first.runtime.startRecommendation?.({
        request: {kind: 'guided', horizon: 'monthly', focus: 'food'},
        locale: 'en',
        focus,
      }),
    );
    const id = first.runtime.snapshot.history[0]?.id;
    const original = first.runtime.snapshot.messages[1]?.content;
    if (!id || !original) {
      throw new Error('Missing recommendation');
    }
    await act(async () =>
      first.runtime.saveFeedback?.({
        messageIndex: 1,
        rating: 'not-helpful',
        reasons: ['too-long'],
        comment: 'Give one simple dinner option.',
      }),
    );
    expect(chat).toHaveBeenCalledTimes(3);
    first.unmount();
    const second = await mount(ports);
    await act(async () => second.runtime.resumeConversation(id));
    chat.mockClear();
    loadEvidence.mockClear();
    await act(async () => second.runtime.reviseFromFeedback?.(0));
    expect(chat).not.toHaveBeenCalled();
    await act(async () => second.runtime.reviseFromFeedback?.(1));
    expect(chat).toHaveBeenCalledTimes(3);
    expect(loadEvidence.mock.calls[0]?.[0].focus).toEqual(focus);
    expect(loadEvidence.mock.calls[0]?.[0].request.horizon).toBe('monthly');
    expect(second.runtime.snapshot.messages[1]?.content).toBe(original);
    expect(second.runtime.snapshot.history).toHaveLength(1);
    expect(second.runtime.snapshot.history[0]?.recommendationFocus).toEqual(
      focus,
    );
    const followup = second.runtime.snapshot.messages[2]?.content;
    expect(followup).toContain('too long');
    expect(followup).toContain('Give one simple dinner option.');
    expect(followup).toContain('keeping the same period and context');
    expect(userPayload(chat, 0).requestedDays).toBe(30);
  });

  it('does not revive a feedback revision after its session was left during a storage read', async () => {
    const {ports, chat, storage} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    await act(async () =>
      harness.runtime.saveFeedback?.({
        messageIndex: 1,
        rating: 'not-helpful',
        reasons: ['unclear'],
      }),
    );
    const stored = [...storage.values.values()][0]!;
    let release: ((value: string) => void) | undefined;
    jest.spyOn(storage, 'getItem').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = harness.runtime.reviseFromFeedback?.(1);
      await Promise.resolve();
    });
    act(() => harness.runtime.openLanding());
    await act(async () => {
      release?.(stored);
      await pending;
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(harness.runtime.snapshot.surface.kind).toBe('landing');
  });

  it('times out a pending legacy-memory write without leaving recommendation loading stuck', async () => {
    jest.useFakeTimers();
    try {
      const {ports, storage, chat} = fixtures();
      const harness = await mount({
        ...ports,
        loadLegacyHistory: async () => [],
      });
      jest
        .spyOn(storage, 'setItem')
        .mockImplementation(() => new Promise(() => undefined));
      let pending: Promise<void> | undefined;
      await act(async () => {
        pending = harness.runtime.startRecommendation?.({
          request: {kind: 'now'},
          locale: 'en',
        });
        await Promise.resolve();
      });
      expect(harness.runtime.snapshot.busy).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(180_001);
        await pending;
      });
      expect(harness.runtime.snapshot.busy).toBe(false);
      expect(harness.runtime.snapshot.error).toContain(
        'could not be completed',
      );
      expect(chat).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('restores a cancelled follow-up and retries it within the same monthly conversation', async () => {
    const {ports, chat, loadEvidence} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'monthly'},
        locale: 'en',
      }),
    );
    const id = harness.runtime.snapshot.history[0]?.id;
    chat.mockImplementationOnce(() => new Promise(() => undefined));
    act(() => harness.runtime.setDraft('Focus on dinner this time.'));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = harness.runtime.send();
      await Promise.resolve();
    });
    await act(async () => {
      harness.runtime.cancel();
      await pending;
    });
    expect(harness.runtime.snapshot.messages).toHaveLength(2);
    expect(harness.runtime.snapshot.draft).toBe('Focus on dinner this time.');
    await act(async () => harness.runtime.retry());
    expect(harness.runtime.snapshot.history).toHaveLength(1);
    expect(harness.runtime.snapshot.history[0]?.id).toBe(id);
    expect(
      harness.runtime.snapshot.messages.filter(
        message => message.content === 'Focus on dinner this time.',
      ),
    ).toHaveLength(1);
    expect(
      loadEvidence.mock.calls[loadEvidence.mock.calls.length - 1]?.[0].request
        .kind,
    ).toBe('monthly');
  });

  it.each([
    'general-chat',
    'meal-analysis',
    'hypo-investigation',
    'behavior-analysis',
    'loop-advice',
  ] as const)(
    'routes new %s launches through bounded recommendations and preserves selected evidence focus',
    async specialist => {
      const {ports, chat, loadEvidence} = fixtures();
      const harness = await mount(ports);
      const focus = {
        kind: 'period' as const,
        startMs: 1000,
        endMs: 1000 + 30 * 86_400_000,
      };
      await act(async () =>
        harness.runtime.start({specialist, locale: 'en', focus}),
      );
      expect(harness.base.start).not.toHaveBeenCalled();
      expect(chat).toHaveBeenCalledTimes(3);
      expect(loadEvidence.mock.calls[0]?.[0].focus).toEqual(focus);
      expect(loadEvidence.mock.calls[0]?.[0].request.horizon).toBe('monthly');
      if (specialist === 'hypo-investigation') {
        expect(loadEvidence.mock.calls[0]?.[0].request.goal).toBe('fewer-lows');
      }
      if (specialist === 'loop-advice') {
        expect(loadEvidence.mock.calls[0]?.[0].request.focus).toBe('care-team');
      }
    },
  );

  it('never displays or persists an explicit new insulin dose from the reviewer', async () => {
    const {ports, chat, storage} = fixtures();
    chat
      .mockResolvedValueOnce('Internal finding')
      .mockResolvedValueOnce('Take 4 units of insulin now.');
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    expect(harness.runtime.snapshot.messages).toEqual([]);
    expect(harness.runtime.snapshot.history).toEqual([]);
    expect([...storage.values.values()].join('')).not.toContain('Take 4 units');
    expect(harness.runtime.snapshot.error).toContain('treatment instruction');
  });
  it.each<AiRecommendationRequest>([
    {kind: 'now'},
    {kind: 'meal', mealSize: 'large'},
  ])(
    'completes a $kind request in two provider calls and publishes only the reviewed answer',
    async request => {
      const {ports, chat, loadEvidence} = fixtures();
      const harness = await mount(ports);
      await act(async () =>
        harness.runtime.startRecommendation?.({request, locale: 'en'}),
      );

      expect(chat).toHaveBeenCalledTimes(2);
      expect(loadEvidence).toHaveBeenCalledTimes(1);
      expect(harness.runtime.snapshot).toMatchObject({
        surface: {kind: 'conversation'},
        busy: false,
        error: undefined,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Get a recommendation'),
          },
          {
            role: 'assistant',
            content:
              'Check your current reading before choosing your next step.',
          },
        ],
      });
      expect(harness.runtime.snapshot.history[0]?.recommendation).toEqual(
        request,
      );
      expect(harness.runtime.snapshot.patientMemory?.questionCount).toBe(1);
      expect(harness.base.start).not.toHaveBeenCalled();
    },
  );

  it('uses two specialists and a final reviewer for a monthly request', async () => {
    const {ports, chat} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'monthly'},
        locale: 'en',
      }),
    );

    expect(chat).toHaveBeenCalledTimes(3);
    expect(userPayload(chat, 0).requestedDays).toBe(30);
    expect(userPayload(chat, 1).requestedDays).toBe(30);
    expect(chat.mock.calls[2]?.[0][0]?.content).toContain(
      'final reviewer and writer',
    );
    expect(harness.runtime.snapshot.messages).toHaveLength(2);
  });

  it('persists explicit instructions and specific feedback across remounts and uses them in the next request', async () => {
    const {ports, chat} = fixtures();
    const first = await mount(ports);
    await act(async () =>
      first.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Prefer vegetarian meals and short answers.',
      }),
    );
    await act(async () =>
      first.runtime.startRecommendation?.({
        request: {kind: 'meal', mealSize: 'small'},
        locale: 'en',
      }),
    );
    await act(async () =>
      first.runtime.saveFeedback?.({
        messageIndex: 1,
        rating: 'not-helpful',
        reasons: ['too-hard'],
        comment: 'Give me options that take five minutes.',
      }),
    );
    await act(async () =>
      first.runtime.saveFeedback?.({
        messageIndex: 1,
        rating: 'helpful',
        reasons: ['fits-my-routine'],
        comment: 'Keep the five-minute options.',
      }),
    );
    expect(first.runtime.snapshot.patientMemory?.feedbackCount).toBe(1);
    first.unmount();
    chat.mockClear();

    const second = await mount(ports);
    expect(second.runtime.snapshot.patientMemory).toMatchObject({
      enabled: true,
      instructions: 'Prefer vegetarian meals and short answers.',
      feedbackCount: 1,
      questionCount: 1,
    });
    await act(async () =>
      second.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    const context = userPayload(chat, 0).patientContext;
    expect(context).toContain('Prefer vegetarian meals and short answers.');
    expect(context).toContain('Keep the five-minute options.');
    expect(context).toContain('Get a recommendation before a meal');
    expect(context).toContain(
      'Not current readings, medical facts, or evidence that a recommendation worked.',
    );
    expect(context).not.toContain('Give me options that take five minutes.');
  });

  it.each(['cancel', 'workspace change'] as const)(
    'rejects a delayed provider answer after %s',
    async action => {
      const {ports, chat, storage} = fixtures();
      let resolveLate: ((value: string) => void) | undefined;
      chat.mockImplementationOnce(
        () =>
          new Promise<string>(resolve => {
            resolveLate = resolve;
          }),
      );
      const harness = await mount(ports);
      let pending: Promise<void> | undefined;
      await act(async () => {
        pending = harness.runtime.startRecommendation?.({
          request: {kind: 'now'},
          locale: 'en',
        });
        await Promise.resolve();
      });
      expect(chat).toHaveBeenCalledTimes(1);

      if (action === 'cancel') {
        await act(async () => {
          harness.runtime.cancel();
          await pending;
        });
      } else {
        await harness.update({...ports, scopeId: 'patient-b/workspace-b'});
        await act(async () => {
          await pending;
        });
      }
      await act(async () => {
        resolveLate?.('Stale private result');
        await Promise.resolve();
      });

      expect(chat.mock.calls[0]?.[1].aborted).toBe(true);
      expect(chat).toHaveBeenCalledTimes(1);
      expect(harness.runtime.snapshot.busy).toBe(false);
      expect(
        harness.runtime.snapshot.messages.filter(
          message => message.role === 'assistant',
        ),
      ).toEqual([]);
      expect(harness.runtime.snapshot.history).toEqual([]);
      expect([...storage.values.values()].join('')).not.toContain(
        'Stale private result',
      );
    },
  );

  it('retries a failed reviewer without duplicating initial or follow-up questions', async () => {
    const {ports, chat} = fixtures();
    chat
      .mockResolvedValueOnce('A supported observation.')
      .mockRejectedValueOnce(new Error('review failed'));
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    expect(harness.runtime.snapshot.messages).toEqual([]);
    expect(harness.runtime.snapshot.error).toContain('could not be completed');
    expect(harness.runtime.snapshot.history).toEqual([]);

    await act(async () => harness.runtime.retry());
    expect(harness.runtime.snapshot.messages).toHaveLength(2);
    expect(harness.runtime.snapshot.patientMemory?.questionCount).toBe(1);
    chat
      .mockResolvedValueOnce('A supported follow-up observation.')
      .mockRejectedValueOnce(new Error('review failed again'));
    act(() => harness.runtime.setDraft('Could the next step be simpler?'));
    await act(async () => harness.runtime.send());
    expect(harness.runtime.snapshot.draft).toBe(
      'Could the next step be simpler?',
    );
    expect(harness.runtime.snapshot.messages).toHaveLength(2);
    await act(async () => harness.runtime.retry());

    expect(
      harness.runtime.snapshot.messages.filter(
        message => message.content === 'Could the next step be simpler?',
      ),
    ).toHaveLength(1);
    expect(harness.runtime.snapshot.messages).toHaveLength(4);
    expect(harness.runtime.snapshot.history).toHaveLength(1);
    expect(harness.runtime.snapshot.patientMemory?.questionCount).toBe(2);
    expect(harness.runtime.snapshot.error).toBeUndefined();
  });

  it('restores the typed guided request from history and keeps that scope in follow-up analysis', async () => {
    const {ports, chat, loadEvidence} = fixtures();
    const request: AiRecommendationRequest = {
      kind: 'guided',
      horizon: 'monthly',
      focus: 'food',
      goal: 'easier-routine',
      responseStyle: 'brief',
      patientNotes: 'Breakfast should be quick.',
    };
    const first = await mount(ports);
    await act(async () =>
      first.runtime.startRecommendation?.({request, locale: 'en'}),
    );
    const conversationId = first.runtime.snapshot.history[0]?.id;
    if (!conversationId) {
      throw new Error('Conversation was not saved');
    }
    first.unmount();
    chat.mockClear();
    loadEvidence.mockClear();

    const second = await mount(ports);
    await act(async () => second.runtime.openHistory());
    expect(second.runtime.snapshot.surface.kind).toBe('history');
    act(() => second.runtime.openHistoryDetail(conversationId));
    expect(second.runtime.snapshot.surface).toEqual({
      kind: 'history-detail',
      conversationId,
    });
    await act(async () => second.runtime.resumeConversation(conversationId));
    expect(second.runtime.snapshot.messages).toHaveLength(2);
    act(() => second.runtime.setDraft('Suggest one easier breakfast option.'));
    await act(async () => second.runtime.send());

    expect(loadEvidence.mock.calls[0]?.[0].request).toEqual(request);
    expect(chat).toHaveBeenCalledTimes(3);
    expect(userPayload(chat, 0).requestedDays).toBe(30);
    expect(harnessRequests(second.runtime)).toEqual([request]);
    expect(second.base.resumeConversation).not.toHaveBeenCalled();
  });

  it('keeps the landing open when Back interrupts a deferred conversation-history launch', async () => {
    const {ports, storage} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    const conversationId = harness.runtime.snapshot.history[0]?.id;
    const stored = [...storage.values.values()][0];
    if (!conversationId || !stored) {
      throw new Error('Conversation was not saved');
    }
    act(() => harness.runtime.openLanding());

    let releaseRead: ((value: string) => void) | undefined;
    const read = jest.spyOn(storage, 'getItem').mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          releaseRead = resolve;
        }),
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = harness.runtime.start({
        specialist: 'general-chat',
        locale: 'en',
        focus: {kind: 'ai-conversation', conversationId},
      });
      await Promise.resolve();
    });
    expect(releaseRead).toBeDefined();
    act(() => harness.runtime.openLanding());
    await act(async () => {
      releaseRead?.(stored);
      await pending;
    });

    expect(harness.runtime.snapshot.surface).toEqual({kind: 'landing'});
    expect(harness.runtime.snapshot.messages).toEqual([]);
    expect(harness.runtime.saveFeedback).toBeUndefined();
    expect(harness.base.start).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('does not let an older A-scope save clear a newer save indicator after switching A to B to A', async () => {
    const {ports, storage} = fixtures();
    const harness = await mount(ports);
    await act(async () =>
      harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Original preference.',
      }),
    );
    const writes: Array<() => void> = [];
    const write = jest.spyOn(storage, 'setItem').mockImplementation(
      (key, value) =>
        new Promise<void>(resolve => {
          writes.push(() => {
            storage.values.set(key, value);
            resolve();
          });
        }),
    );
    let olderSave: Promise<void> | undefined;
    await act(async () => {
      olderSave = harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Earlier A preference.',
      });
      await Promise.resolve();
    });
    expect(writes).toHaveLength(1);
    expect(harness.runtime.snapshot.memoryBusy).toBe(true);

    await harness.update({...ports, scopeId: 'patient-b/workspace-b'});
    await harness.update(ports);
    let currentSave: Promise<void> | undefined;
    await act(async () => {
      currentSave = harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Current A preference.',
      });
      await Promise.resolve();
    });
    await act(async () => {
      writes[0]?.();
      await olderSave;
    });

    expect(writes).toHaveLength(2);
    expect(harness.runtime.snapshot.memoryBusy).toBe(true);
    expect(harness.runtime.snapshot.memoryError).toBeUndefined();
    await act(async () => {
      writes[1]?.();
      await currentSave;
    });
    expect(harness.runtime.snapshot.memoryBusy).toBe(false);
    expect(harness.runtime.snapshot.patientMemory?.instructions).toBe(
      'Current A preference.',
    );
    write.mockRestore();
  });

  it('shows storage failure while preserving a completed answer and allows retrying preference writes', async () => {
    const {ports, storage} = fixtures();
    const harness = await mount(ports);
    storage.failWrites = true;
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    expect(harness.runtime.snapshot.messages).toHaveLength(2);
    expect(harness.runtime.snapshot.memoryError).toContain(
      'Memory could not be saved or loaded',
    );
    await act(async () => {
      await expect(
        harness.runtime.savePatientMemory?.({
          enabled: true,
          instructions: 'Keep it brief.',
        }),
      ).rejects.toThrow('Private storage error');
    });
    expect(harness.runtime.snapshot.memoryError).not.toContain(
      'Private storage error',
    );
    expect(harness.runtime.snapshot.memoryBusy).toBe(false);
    storage.failWrites = false;
    await act(async () =>
      harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Keep it brief.',
      }),
    );
    expect(harness.runtime.snapshot.memoryError).toBeUndefined();
    expect(harness.runtime.snapshot.patientMemory?.instructions).toBe(
      'Keep it brief.',
    );
  });

  it('surfaces a failure to load saved memory', async () => {
    const {ports, storage} = fixtures();
    storage.failReads = true;
    const harness = await mount(ports);
    expect(harness.runtime.snapshot.memoryError).toContain(
      'Memory could not be saved or loaded',
    );
    expect(harness.runtime.snapshot.patientMemory).toBeUndefined();
  });

  it('honors memory opt-out and clearing without restoring prior questions from legacy history', async () => {
    const {ports, chat} = fixtures();
    const loadLegacyHistory = jest.fn(async () => [
      {
        id: 'old-chat',
        title: 'Old question',
        specialist: 'general-chat' as const,
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            role: 'user' as const,
            content: 'Why was my old breakfast difficult?',
          },
        ],
      },
    ]);
    const harness = await mount({...ports, loadLegacyHistory});
    await act(async () =>
      harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Prefer easy breakfasts.',
      }),
    );
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      }),
    );
    await act(async () =>
      harness.runtime.saveFeedback?.({
        messageIndex: 1,
        rating: 'helpful',
        reasons: ['clear'],
      }),
    );
    expect(userPayload(chat, 0).patientContext).toContain(
      'Why was my old breakfast difficult?',
    );
    const priorQuestionCount =
      harness.runtime.snapshot.patientMemory?.questionCount;
    await act(async () =>
      harness.runtime.savePatientMemory?.({
        enabled: false,
        instructions: 'Prefer easy breakfasts.',
      }),
    );
    chat.mockClear();
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'weekly'},
        locale: 'en',
      }),
    );
    expect(userPayload(chat, 0).patientContext).toBe('');
    expect(harness.runtime.snapshot.patientMemory?.questionCount).toBe(
      priorQuestionCount,
    );

    await act(async () =>
      harness.runtime.savePatientMemory?.({
        enabled: true,
        instructions: 'Prefer easy breakfasts.',
      }),
    );
    await act(async () => harness.runtime.clearPatientMemory?.());
    expect(harness.runtime.snapshot.patientMemory).toEqual({
      enabled: true,
      instructions: '',
      questionCount: 0,
      feedbackCount: 0,
    });
    expect(harness.runtime.snapshot.history).toHaveLength(2);
    chat.mockClear();
    await act(async () =>
      harness.runtime.startRecommendation?.({
        request: {kind: 'meal'},
        locale: 'en',
      }),
    );
    expect(userPayload(chat, 0).patientContext).toBe('');
    expect(loadLegacyHistory).toHaveBeenCalledTimes(1);
  });
});

const harnessRequests = (runtime: AiAnalystModuleRuntime) =>
  runtime.snapshot.history.map(item => item.recommendation);
