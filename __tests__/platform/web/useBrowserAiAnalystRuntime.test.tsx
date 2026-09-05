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
  it('preserves a failed question and retries it without duplicate history', async () => {
    const requestJson = jest
      .fn<Promise<unknown>, [string]>()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({version: 1, content: 'Review this with care.'});
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
    act(() => {
      tree = renderer.create(<Harness />);
    });
    act(() => runtime?.setDraft('What changed overnight?'));
    await act(async () => runtime?.send());

    expect(runtime?.snapshot).toMatchObject({
      draft: 'What changed overnight?',
      error: 'Temporary failure',
      messages: [],
    });

    await act(async () => runtime?.retry());

    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(runtime?.snapshot).toMatchObject({
      draft: '',
      error: undefined,
      messages: [
        {role: 'user', content: 'What changed overnight?'},
        {role: 'assistant', content: expect.stringContaining('Review this')},
      ],
    });
    act(() => tree!.unmount());
  });

  it('never publishes a response from a previous account scope', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const requestJson = jest.fn(
      () =>
        new Promise<unknown>(resolve => {
          resolveRequest = resolve;
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
    act(() => {
      tree = renderer.create(<Harness scopeId="account-a" />);
    });
    act(() => runtime?.setDraft('Private account A question'));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = runtime?.send();
    });
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
        specialist: 'hypo-investigation',
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
    const evidenceProvider: BrowserAiEvidenceProvider = {
      loadVisibleContext: ({signal}) => {
        evidenceSignal = signal;
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
    let runtime: AiAnalystModuleRuntime | undefined;
    const Harness = ({scopeId}: {readonly scopeId: string}) => {
      runtime = useBrowserAiAnalystRuntime({
        service: new BrowserAiService({requestJson}),
        storage: new MemoryStorage(),
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
    act(() => {
      tree = renderer.create(<Harness scopeId="account-a" />);
    });
    act(() => runtime?.setDraft('Use account A evidence'));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = runtime?.send();
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
