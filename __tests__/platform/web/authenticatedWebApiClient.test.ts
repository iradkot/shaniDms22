import {
  AuthenticatedWebApiClient,
  WebApiError,
} from '../../../src/platform/web';

const jsonResponse = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response);

describe('AuthenticatedWebApiClient', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds the Firebase bearer token without placing it in the URL or body', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {version: 1, configured: false}));
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-token-123456789012345'},
      fetch: request,
    });

    await client.requestJson('/v1/vault/nightscout/status');
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/vault/nightscout/status');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer firebase-token-123456789012345',
    });
    expect(init.body).toBeUndefined();
  });

  it('rejects paths that could escape the fixed API boundary', async () => {
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-token-123456789012345'},
      fetch: jest.fn(),
    });
    await expect(client.requestJson('/v1/../admin')).rejects.toThrow(
      'path is invalid',
    );
  });

  it('turns bounded server errors into typed errors', async () => {
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-token-123456789012345'},
      fetch: jest.fn().mockResolvedValue(
        jsonResponse(409, {
          version: 1,
          code: 'credential_missing',
          message: 'Configure a key first',
        }),
      ),
    });
    await expect(client.requestJson('/v1/llm/chat')).rejects.toEqual(
      new WebApiError(
        409,
        'credential_missing',
        'The request could not be completed.',
      ),
    );
  });

  it('never exposes raw server messages or malformed error codes', async () => {
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-test-token'},
      fetch: jest.fn().mockResolvedValue(
        jsonResponse(502, {
          code: 'provider sk-secret-test',
          message: 'provider echoed sk-secret-test',
        }),
      ),
    });
    await expect(client.requestJson('/v1/llm/chat')).rejects.toEqual(
      new WebApiError(
        502,
        'upstream_unavailable',
        'The request could not be completed.',
      ),
    );
  });

  it('retains the HTTP status of an HTML deployment error', async () => {
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-test-token'},
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError('HTML response');
        },
      }),
    });
    await expect(
      client.requestJson('/v1/vault/llm/provision'),
    ).rejects.toMatchObject({status: 404, code: 'not_found'});
  });

  it('does not resolve auth or send a request for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const getIdToken = jest.fn().mockResolvedValue('firebase-token');
    const request = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {version: 1}));
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken},
      fetch: request,
    });

    await expect(
      client.requestJson('/v1/llm/chat', {signal: controller.signal}),
    ).rejects.toMatchObject({code: 'cancelled'});

    expect(getIdToken).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps external cancellation active while the response body is read', async () => {
    let resolveBody!: (value: unknown) => void;
    const body = new Promise<unknown>(resolve => {
      resolveBody = resolve;
    });
    const json = jest.fn(() => body);
    const request = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json,
    } as unknown as Response);
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-token'},
      fetch: request,
    });

    const pending = client.requestJson('/v1/llm/chat', {
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(json).toHaveBeenCalledTimes(1);
    expect(removeListener).not.toHaveBeenCalled();

    controller.abort();
    resolveBody({version: 1});

    await expect(pending).rejects.toMatchObject({code: 'cancelled'});
    const sentSignal = request.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(sentSignal.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('keeps the deadline active while the response body is read', async () => {
    jest.useFakeTimers();
    let resolveBody!: (value: unknown) => void;
    const body = new Promise<unknown>(resolve => {
      resolveBody = resolve;
    });
    const json = jest.fn(() => body);
    const request = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json,
    } as unknown as Response);
    const client = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-token'},
      fetch: request,
      timeoutMs: 10,
    });

    const pending = client.requestJson('/v1/llm/chat');
    await Promise.resolve();
    await Promise.resolve();
    expect(json).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(10);
    resolveBody({version: 1});

    await expect(pending).rejects.toMatchObject({code: 'timeout'});
    expect(jest.getTimerCount()).toBe(0);
  });
});
