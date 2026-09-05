import {validateOpenAiApiKey} from 'app/services/llm/providers/openaiProvider';
import {configureShaniLlmProxyRuntime} from 'app/services/llm/shaniLlmProxy';

const makeResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

describe('validateOpenAiApiKey through ShaniDms', () => {
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
    configureShaniLlmProxyRuntime(null);
  });

  it('returns missing without making a request', async () => {
    await expect(validateOpenAiApiKey('')).resolves.toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates transiently through the authenticated backend', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(200, {version: 1, valid: true}),
    );

    await expect(validateOpenAiApiKey('sk-test')).resolves.toEqual({ok: true});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://backend.example.test/v1/vault/llm/validate',
    );
    expect(url).not.toContain('api.openai.com');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer firebase-id-token',
      'Cache-Control': 'no-store',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      version: 1,
      provider: 'openai',
      credential: 'sk-test',
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
  ] as const)('maps backend status %s to %s', async (status, reason) => {
    fetchMock.mockResolvedValue(
      makeResponse(status, {
        version: 1,
        code: reason,
        message: `backend ${reason}`,
      }),
    );

    await expect(validateOpenAiApiKey('sk-test')).resolves.toMatchObject({
      ok: false,
      reason,
      message: `backend ${reason}`,
    });
  });

  it('maps transport failures to network', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));

    await expect(validateOpenAiApiKey('sk-test')).resolves.toMatchObject({
      ok: false,
      reason: 'network',
      message: 'Network down',
    });
  });
});
