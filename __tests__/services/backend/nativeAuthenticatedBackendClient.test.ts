import {
  NativeAuthenticatedBackendError,
  createNativeAuthenticatedBackendClient,
} from 'app/services/backend/nativeAuthenticatedBackendClient';

const USER_ID = 'firebase-user-a';

const makeClient = (input: {
  readonly fetch: jest.Mock;
  readonly getSession?: jest.Mock;
}) =>
  createNativeAuthenticatedBackendClient({
    baseUrl: 'https://backend.example.test',
    getSession:
      input.getSession ??
      jest.fn().mockResolvedValue({
        userId: USER_ID,
        idToken: 'firebase-id-token',
      }),
    fetch: input.fetch,
  });

const request = (signal?: AbortSignal, timeoutMs?: number) => ({
  method: 'POST' as const,
  expectedUserId: USER_ID,
  body: {version: 1},
  ...(signal === undefined ? {} : {signal}),
  ...(timeoutMs === undefined ? {} : {timeoutMs}),
});

describe('NativeAuthenticatedBackendClient cancellation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not resolve auth or send a request for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const getSession = jest.fn().mockResolvedValue({
      userId: USER_ID,
      idToken: 'firebase-id-token',
    });
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({version: 1}),
    });
    const client = makeClient({fetch, getSession});

    await expect(
      client.requestJson('/v1/test', request(controller.signal)),
    ).rejects.toMatchObject({name: 'AbortError'});

    expect(getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps external cancellation active while the response body is read', async () => {
    let resolveBody!: (value: string) => void;
    const body = new Promise<string>(resolve => {
      resolveBody = resolve;
    });
    const text = jest.fn(() => body);
    const fetch = jest.fn().mockResolvedValue({ok: true, status: 200, text});
    const client = makeClient({fetch});
    const controller = new AbortController();

    const pending = client.requestJson('/v1/test', request(controller.signal));
    await Promise.resolve();
    await Promise.resolve();
    expect(text).toHaveBeenCalledTimes(1);

    controller.abort();
    resolveBody(JSON.stringify({version: 1}));

    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    const sentSignal = fetch.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(sentSignal.aborted).toBe(true);
  });

  it('keeps the deadline active while the response body is read', async () => {
    jest.useFakeTimers();
    let resolveBody!: (value: string) => void;
    const body = new Promise<string>(resolve => {
      resolveBody = resolve;
    });
    const text = jest.fn(() => body);
    const fetch = jest.fn().mockResolvedValue({ok: true, status: 200, text});
    const client = makeClient({fetch});

    const pending = client.requestJson('/v1/test', request(undefined, 10));
    await Promise.resolve();
    await Promise.resolve();
    expect(text).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10);
    resolveBody(JSON.stringify({version: 1}));

    await expect(pending).rejects.toMatchObject<
      Partial<NativeAuthenticatedBackendError>
    >({code: 'timeout'});
  });
});
