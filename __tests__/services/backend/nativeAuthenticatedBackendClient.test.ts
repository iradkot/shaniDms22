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

  it('rejects at the default deadline when session lookup never settles', async () => {
    jest.useFakeTimers();
    const getSession = jest.fn(() => new Promise<never>(() => undefined));
    const fetch = jest.fn();
    const client = makeClient({fetch, getSession});
    let outcome: unknown = 'pending';
    const pending = client.requestJson('/v1/privacy/consent', request()).then(
      value => {
        outcome = value;
      },
      error => {
        outcome = error;
      },
    );

    await jest.advanceTimersByTimeAsync(30_000);

    expect(outcome).toMatchObject({code: 'timeout'});
    expect(fetch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await pending;
  });

  it.each(['fetch', 'body'] as const)(
    'rejects at the deadline when %s ignores the abort signal',
    async stage => {
      jest.useFakeTimers();
      const never = new Promise<never>(() => undefined);
      const text = jest.fn(() => never);
      const fetch = jest.fn(() =>
        stage === 'fetch'
          ? never
          : Promise.resolve({ok: true, status: 200, text}),
      );
      const client = makeClient({fetch});
      let outcome: unknown = 'pending';
      const pending = client
        .requestJson('/v1/test', request(undefined, 10))
        .then(
          value => {
            outcome = value;
          },
          error => {
            outcome = error;
          },
        );

      await jest.advanceTimersByTimeAsync(10);

      expect(outcome).toMatchObject({code: 'timeout'});
      expect(jest.getTimerCount()).toBe(0);
      await pending;
    },
  );

  it.each(['session', 'fetch', 'body'] as const)(
    'settles cancellation even when %s never settles',
    async stage => {
      jest.useFakeTimers();
      const never = new Promise<never>(() => undefined);
      const getSession = jest.fn(() =>
        stage === 'session'
          ? never
          : Promise.resolve({userId: USER_ID, idToken: 'firebase-id-token'}),
      );
      const text = jest.fn(() => never);
      const fetch = jest.fn(() =>
        stage === 'fetch'
          ? never
          : Promise.resolve({ok: true, status: 200, text}),
      );
      const controller = new AbortController();
      const client = makeClient({fetch, getSession});
      let outcome: unknown = 'pending';
      const pending = client
        .requestJson('/v1/test', request(controller.signal))
        .then(
          value => {
            outcome = value;
          },
          error => {
            outcome = error;
          },
        );
      await jest.advanceTimersByTimeAsync(0);
      controller.abort();
      await jest.advanceTimersByTimeAsync(0);

      expect(outcome).toMatchObject({name: 'AbortError'});
      expect(jest.getTimerCount()).toBe(0);
      await pending;
    },
  );

  it('does not send a request if session lookup completes after the deadline', async () => {
    jest.useFakeTimers();
    let resolveSession!: (value: {userId: string; idToken: string}) => void;
    const getSession = jest.fn(
      () =>
        new Promise<{userId: string; idToken: string}>(resolve => {
          resolveSession = resolve;
        }),
    );
    const fetch = jest.fn();
    const client = makeClient({fetch, getSession});
    let outcome: unknown = 'pending';
    const pending = client
      .requestJson('/v1/privacy/consent', request(undefined, 10))
      .then(
        value => {
          outcome = value;
        },
        error => {
          outcome = error;
        },
      );
    await jest.advanceTimersByTimeAsync(10);

    expect(outcome).toMatchObject({code: 'timeout'});
    resolveSession({userId: USER_ID, idToken: 'firebase-id-token'});
    await jest.advanceTimersByTimeAsync(0);

    expect(fetch).not.toHaveBeenCalled();
    await pending;
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
    jest.useFakeTimers();
    let resolveBody!: (value: string) => void;
    const body = new Promise<string>(resolve => {
      resolveBody = resolve;
    });
    const text = jest.fn(() => body);
    const fetch = jest.fn().mockResolvedValue({ok: true, status: 200, text});
    const client = makeClient({fetch});
    const controller = new AbortController();

    const pending = client.requestJson('/v1/test', request(controller.signal));
    await jest.advanceTimersByTimeAsync(0);
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
    await jest.advanceTimersByTimeAsync(0);
    expect(text).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10);
    resolveBody(JSON.stringify({version: 1}));

    await expect(pending).rejects.toMatchObject<
      Partial<NativeAuthenticatedBackendError>
    >({code: 'timeout'});
  });
});
