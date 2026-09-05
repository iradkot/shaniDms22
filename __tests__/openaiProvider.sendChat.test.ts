import {OpenAIProvider} from 'app/services/llm/providers/openaiProvider';
import {
  ShaniLlmProxyError,
  configureShaniLlmProxyRuntime,
} from 'app/services/llm/shaniLlmProxy';

const makeResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

describe('OpenAIProvider.sendChat through ShaniDms', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'firebase-id-token',
      fetch: fetchMock,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    configureShaniLlmProxyRuntime(null);
  });

  it('sends the typed chat contract without sending the provider key', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        version: 1,
        provider: 'openai',
        model: 'gpt-5-mini',
        content: 'Evidence-backed answer',
      }),
    );
    const provider = new OpenAIProvider({apiKey: 'must-not-leave-client'});

    await expect(
      provider.sendChat({
        model: 'gpt-5-mini',
        messages: [{role: 'user', content: 'Summarize today'}],
        temperature: 0.2,
        maxOutputTokens: 300,
      }),
    ).resolves.toEqual({
      content: 'Evidence-backed answer',
      raw: {proxy: true, provider: 'openai', model: 'gpt-5-mini'},
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://backend.example.test/v1/llm/chat');
    expect(url).not.toContain('api.openai.com');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer firebase-id-token',
      'Cache-Control': 'no-store',
    });
    const serialized = String(init.body);
    expect(serialized).not.toContain('must-not-leave-client');
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      provider: 'openai',
      model: 'gpt-5-mini',
      messages: [{role: 'user', content: 'Summarize today'}],
      temperature: 0.2,
      maxOutputTokens: 300,
    });
  });

  it('rejects malformed requests before any network call', async () => {
    const provider = new OpenAIProvider();

    await expect(
      provider.sendChat({model: '', messages: []}),
    ).rejects.toMatchObject({code: 'invalid_request'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a signed-in Firebase identity', async () => {
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => null,
      fetch: fetchMock,
    });

    await expect(
      new OpenAIProvider().sendChat({
        model: 'gpt-5-mini',
        messages: [{role: 'user', content: 'hello'}],
      }),
    ).rejects.toMatchObject({code: 'unauthenticated'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps rate limits and rejects malformed backend responses', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(429, {
        version: 1,
        code: 'rate_limited',
        message: 'Try again later',
      }),
    );
    const provider = new OpenAIProvider();
    const request = {
      model: 'gpt-5-mini',
      messages: [{role: 'user' as const, content: 'hello'}],
    };

    await expect(provider.sendChat(request)).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
    });

    fetchMock.mockResolvedValueOnce(
      makeResponse(200, {version: 1, provider: 'openai', content: ''}),
    );
    await expect(provider.sendChat(request)).rejects.toBeInstanceOf(
      ShaniLlmProxyError,
    );
  });

  it('does not resolve auth or send a request for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const getFirebaseIdToken = jest.fn().mockResolvedValue('firebase-id-token');
    fetchMock.mockResolvedValue(
      makeResponse(200, {
        version: 1,
        provider: 'openai',
        model: 'gpt-5-mini',
        content: 'should not be returned',
      }),
    );
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken,
      fetch: fetchMock,
    });

    await expect(
      new OpenAIProvider().sendChat({
        model: 'gpt-5-mini',
        messages: [{role: 'user', content: 'hello'}],
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({name: 'AbortError'});

    expect(getFirebaseIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps external cancellation active while the response body is read', async () => {
    let resolveBody!: (value: string) => void;
    const body = new Promise<string>(resolve => {
      resolveBody = resolve;
    });
    const text = jest.fn(() => body);
    fetchMock.mockResolvedValue({ok: true, status: 200, text});
    const controller = new AbortController();

    const pending = new OpenAIProvider().sendChat({
      model: 'gpt-5-mini',
      messages: [{role: 'user', content: 'hello'}],
      abortSignal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(text).toHaveBeenCalledTimes(1);

    controller.abort();
    resolveBody(
      JSON.stringify({
        version: 1,
        provider: 'openai',
        model: 'gpt-5-mini',
        content: 'late response',
      }),
    );

    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    const sentSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(sentSignal.aborted).toBe(true);
  });

  it('keeps the deadline active while the response body is read', async () => {
    jest.useFakeTimers();
    let resolveBody!: (value: string) => void;
    const body = new Promise<string>(resolve => {
      resolveBody = resolve;
    });
    const text = jest.fn(() => body);
    fetchMock.mockResolvedValue({ok: true, status: 200, text});

    const pending = new OpenAIProvider().sendChat({
      model: 'gpt-5-mini',
      messages: [{role: 'user', content: 'hello'}],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(text).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(65_000);
    resolveBody(
      JSON.stringify({
        version: 1,
        provider: 'openai',
        model: 'gpt-5-mini',
        content: 'late response',
      }),
    );

    await expect(pending).rejects.toMatchObject({code: 'timeout'});
  });
});
