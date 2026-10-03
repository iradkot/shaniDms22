import {configureExperimentalBuildForTests} from '../../mocks/experimentalBuild';
configureExperimentalBuildForTests();

import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {AiAnalystModuleRuntime} from '../../../src/product/ai';
import {
  BrowserAiService,
  type BrowserAiEvidenceProvider,
  useBrowserAiAnalystRuntime,
} from '../../../src/platform/web';

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe('browser AI analyst runtime', () => {
  it('enforces pilot limits on browser direct actions and still runs past-week analysis', async () => {
    globalThis.__SHANI_RELEASE_CHANNEL__ = 'pilot';
    const requestJson = jest.fn().mockResolvedValue({version: 1, content: 'The recorded week contains a recurring evening pattern.'});
    const service = new BrowserAiService({requestJson});
    const storage = new MemoryStorage();
    let runtime: AiAnalystModuleRuntime | undefined;
    const Harness = () => {
      runtime = useBrowserAiAnalystRuntime({service, storage, scopeId: 'user-workspace', locale: 'en',
        enabled: true, credentialConfigured: true, onOpenSettings: jest.fn()});
      return null;
    };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {tree = renderer.create(<Harness />);});
    await act(async () => runtime?.startRecommendation?.({request: {kind: 'now'}, locale: 'en'}));
    await act(async () => runtime?.startRecommendation?.({request: {kind: 'meal'}, locale: 'en'}));
    await act(async () => runtime?.start({specialist: 'general-chat', locale: 'en'}));
    expect(requestJson).not.toHaveBeenCalled();
    expect(runtime?.snapshot.messages).toEqual([]);
    await act(async () => runtime?.startRecommendation?.({request: {kind: 'weekly'}, locale: 'en'}));
    expect(requestJson).toHaveBeenCalledTimes(3);
    expect(runtime?.snapshot.messages[1]?.content).toContain('recorded week');
    expect(runtime?.snapshot.history[0]?.recommendation?.kind).toBe('weekly');
    act(() => tree.unmount());
  });
  it('preserves a failed question and retries it without duplicate history', async () => {
    const requestJson = jest
      .fn<Promise<unknown>, [string]>()
      .mockResolvedValue({version: 1, content: 'Review this with care.'});
    const service = new BrowserAiService({requestJson});
    const storage = new MemoryStorage();
    let runtime: AiAnalystModuleRuntime | undefined;

    const Harness = () => {
      runtime = useBrowserAiAnalystRuntime({
        service,
        storage,
        scopeId: 'user-workspace',
        locale: 'en',
        enabled: true,
        credentialConfigured: true,
        onOpenSettings: jest.fn(),
      });
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    await act(async () => runtime?.startRecommendation?.({
      request: {kind: 'now'},
      locale: 'en',
    }));
    const initialMessages = runtime?.snapshot.messages ?? [];
    const conversationId = runtime?.snapshot.history[0]?.id;
    expect(initialMessages).toHaveLength(2);
    expect(conversationId).toBeDefined();
    requestJson.mockRejectedValueOnce(
      Object.assign(new Error('Provider echoed sk-secret-test-content'), {
        code: 'provider_quota_exceeded',
      }),
    );
    act(() => runtime?.setDraft('What changed overnight?'));
    await act(async () => runtime?.send());

    expect(runtime?.snapshot).toMatchObject({
      draft: 'What changed overnight?',
      error:
        'The recommendation could not be completed. Check your connection and AI settings, then retry.',
      messages: initialMessages,
    });
    expect(JSON.stringify(runtime?.snapshot)).not.toContain('sk-secret-test-content');
    expect(runtime?.snapshot.history).toHaveLength(1);
    expect(runtime?.snapshot.history[0]?.messages).toEqual(initialMessages);

    await act(async () => runtime?.retry());

    expect(requestJson).toHaveBeenCalledTimes(5);
    expect(runtime?.snapshot).toMatchObject({
      draft: '',
      error: undefined,
      messages: [
        ...initialMessages,
        {role: 'user', content: 'What changed overnight?'},
        {role: 'assistant', content: expect.stringContaining('Review this')},
      ],
    });
    expect(runtime?.snapshot.history).toHaveLength(1);
    expect(runtime?.snapshot.history[0]).toMatchObject({
      id: conversationId,
      messages: runtime?.snapshot.messages,
    });
    expect(runtime?.snapshot.messages.filter(message =>
      message.role === 'user' && message.content === 'What changed overnight?',
    )).toHaveLength(1);
    act(() => tree!.unmount());
  });

  it('never publishes a response from a previous account scope', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    let markRequestStarted: () => void = () => undefined;
    const requestStarted = new Promise<void>(resolve => {
      markRequestStarted = resolve;
    });
    const requestJson = jest.fn(
      () =>
        new Promise<unknown>(resolve => {
          resolveRequest = resolve;
          markRequestStarted();
        }),
    );
    const service = new BrowserAiService({requestJson});
    const storage = new MemoryStorage();
    let runtime: AiAnalystModuleRuntime | undefined;
    const Harness = ({scopeId}: {readonly scopeId: string}) => {
      runtime = useBrowserAiAnalystRuntime({
        service,
        storage,
        scopeId,
        locale: 'en',
        enabled: true,
        credentialConfigured: true,
        onOpenSettings: jest.fn(),
      });
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness scopeId="account-a" />);
    });
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = runtime?.startRecommendation?.({
        request: {kind: 'now', patientNotes: 'Private account A question'},
        locale: 'en',
      });
      await requestStarted;
    });
    expect(requestJson).toHaveBeenCalledTimes(1);
    act(() => {
      tree!.update(<Harness scopeId="account-b" />);
    });
    await act(async () => {
      resolveRequest?.({version: 1, content: 'Private account A answer'});
      await pending;
    });

    expect(runtime?.snapshot).toMatchObject({
      messages: [],
      draft: '',
      error: undefined,
    });
    expect(JSON.stringify(runtime?.snapshot)).not.toContain('account A');
    act(() => tree!.unmount());
  });

  it('sends the same factual Nightscout evidence that is visible in the conversation', async () => {
    const requestJson = jest
      .fn()
      .mockResolvedValue({version: 1, content: 'Grounded response.'});
    const evidenceProvider: BrowserAiEvidenceProvider = {
      loadVisibleContext: jest
        .fn()
        .mockResolvedValue(
          'Nightscout evidence. Source scope: ns_source_a. Current snapshot: 109 mg/dL. Coverage: 96%.',
        ),
    };
    let runtime: AiAnalystModuleRuntime | undefined;
    const Harness = () => {
      runtime = useBrowserAiAnalystRuntime({
        service: new BrowserAiService({requestJson}),
        storage: new MemoryStorage(),
        scopeId: 'account-a-workspace-primary',
        locale: 'en',
        enabled: true,
        credentialConfigured: true,
        evidenceProvider,
        onOpenSettings: jest.fn(),
      });
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    await act(async () =>
      runtime?.start({
        specialist: 'hypo-investigation',
        locale: 'en',
        focus: {kind: 'period', startMs: 100, endMs: 200},
      }),
    );
    act(() => runtime?.setDraft('What low events are visible?'));
    await act(async () => runtime?.send());

    expect(evidenceProvider.loadVisibleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        specialist: 'general-chat',
        rangeDays: 30,
        locale: 'en',
        focus: {kind: 'period', startMs: 100, endMs: 200},
        signal: expect.any(AbortSignal),
      }),
    );
    expect(runtime?.snapshot.visibleContext).toContain('ns_source_a');
    const [, request] = requestJson.mock.calls[0] as [
      string,
      {body: {messages: readonly {role: string; content: string}[]}},
    ];
    expect(request.body.messages).toContainEqual({
      role: 'user',
      content: expect.stringContaining('Source scope: ns_source_a'),
    });
    expect(JSON.stringify(request.body.messages)).toContain('109 mg/dL');
    act(() => tree!.unmount());
  });

  it('aborts Nightscout evidence loading when the Workspace scope changes', async () => {
    let evidenceSignal: AbortSignal | undefined;
    let markEvidenceStarted: () => void = () => undefined;
    const evidenceStarted = new Promise<void>(resolve => {
      markEvidenceStarted = resolve;
    });
    const evidenceProvider: BrowserAiEvidenceProvider = {
      loadVisibleContext: ({signal}) => {
        evidenceSignal = signal;
        markEvidenceStarted();
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
    };
    const requestJson = jest.fn();
    const service = new BrowserAiService({requestJson});
    const storage = new MemoryStorage();
    let runtime: AiAnalystModuleRuntime | undefined;
    const Harness = ({scopeId}: {readonly scopeId: string}) => {
      runtime = useBrowserAiAnalystRuntime({
        service,
        storage,
        scopeId,
        locale: 'en',
        enabled: true,
        credentialConfigured: true,
        evidenceProvider,
        onOpenSettings: jest.fn(),
      });
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness scopeId="account-a" />);
    });
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = runtime?.startRecommendation?.({
        request: {kind: 'now'},
        locale: 'en',
      });
      await evidenceStarted;
    });
    expect(evidenceSignal?.aborted).toBe(false);

    // Commit the scope change before awaiting the request it is expected to
    // cancel. React defers renderer updates made inside an async `act` until
    // that callback yields, which would otherwise make this test deadlock.
    act(() => {
      tree!.update(<Harness scopeId="account-b" />);
    });
    await act(async () => {
      await pending;
    });

    expect(evidenceSignal?.aborted).toBe(true);
    expect(requestJson).not.toHaveBeenCalled();
    expect(runtime?.snapshot).toMatchObject({
      messages: [],
      draft: '',
      busy: false,
      error: undefined,
    });
    act(() => tree!.unmount());
  });
});
