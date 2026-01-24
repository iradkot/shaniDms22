import {validateOpenAiApiKey} from 'app/services/llm/providers/openaiProvider';

function makeResponse(params: {ok: boolean; status: number; body?: any}) {
  const bodyText =
    params.body == null ? '' : typeof params.body === 'string' ? params.body : JSON.stringify(params.body);

  return {
    ok: params.ok,
    status: params.status,
    text: async () => bodyText,
  } as any;
}

describe('validateOpenAiApiKey', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch as any;
    jest.clearAllMocks();
  });

  it('returns missing when empty', async () => {
    const res = await validateOpenAiApiKey('');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('missing');
    }
  });

  it('returns ok when OpenAI accepts key', async () => {
    global.fetch = jest.fn(async () => makeResponse({ok: true, status: 200})) as any;

    const res = await validateOpenAiApiKey('sk-test');
    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('maps 401/403 to unauthorized', async () => {
    global.fetch = jest
      .fn(async () =>
        makeResponse({
          ok: false,
          status: 401,
          body: {error: {message: 'Invalid authentication'}},
        }),
      ) as any;

    const res = await validateOpenAiApiKey('sk-bad');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('unauthorized');
      expect(res.message).toMatch(/invalid/i);
    }
  });

  it('maps 429 to rate_limited', async () => {
    global.fetch = jest
      .fn(async () =>
        makeResponse({
          ok: false,
          status: 429,
          body: {error: {message: 'Rate limit exceeded'}},
        }),
      ) as any;

    const res = await validateOpenAiApiKey('sk-rate');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('rate_limited');
    }
  });

  it('maps thrown errors to network', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('Network down');
    }) as any;

    const res = await validateOpenAiApiKey('sk-any');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('network');
      expect(res.message).toMatch(/network down/i);
    }
  });
});
