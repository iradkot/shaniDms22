import {BrowserAiService} from '../../../src/platform/web/ai/browserAiService';
import {AuthenticatedWebApiClient} from '../../../src/platform/web/api/authenticatedWebApiClient';

describe('browser AI connection', () => {
  afterEach(() => jest.useRealTimers());

  it('does not accept malformed save or remove acknowledgements', async () => {
    const requestJson = jest.fn().mockResolvedValue({version: 1});
    const service = new BrowserAiService({requestJson});
    await expect(service.provision('sk-test-credential')).rejects.toMatchObject(
      {
        code: 'invalid_response',
      },
    );
    await expect(service.remove()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('normalizes pasted surrounding whitespace before sending the key', async () => {
    const requestJson = jest
      .fn()
      .mockResolvedValue({version: 1, configured: true});
    await new BrowserAiService({requestJson}).provision(
      '  sk-test-credential\n',
    );
    expect(requestJson).toHaveBeenCalledWith('/v1/vault/llm/provision', {
      method: 'POST',
      body: {version: 1, provider: 'openai', credential: 'sk-test-credential'},
    });
  });

  it('tests only the saved key and validates the model acknowledgement', async () => {
    const requestJson = jest.fn().mockResolvedValue({
      version: 1,
      provider: 'openai',
      model: 'gpt-5.5',
      connected: true,
    });
    const service = new BrowserAiService({requestJson});
    await service.testConnection();
    expect(requestJson).toHaveBeenCalledWith('/v1/vault/llm/test', {
      method: 'POST',
      timeoutMs: 85_000,
      body: {version: 1, provider: 'openai', model: 'gpt-5.5'},
    });
    requestJson.mockResolvedValue({
      version: 1,
      provider: 'openai',
      model: 'other',
      connected: true,
    });
    await expect(service.testConnection()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('lets AI finish after the general 25-second HTTP deadline', async () => {
    jest.useFakeTimers();
    let finish!: (value: unknown) => void;
    const body = new Promise<unknown>(resolve => {
      finish = resolve;
    });
    const request = jest
      .fn()
      .mockResolvedValue({ok: true, status: 200, json: () => body});
    const api = new AuthenticatedWebApiClient({
      baseUrl: 'https://api.example.test',
      auth: {getIdToken: async () => 'firebase-test-token'},
      fetch: request,
    });
    const pending = new BrowserAiService(api).chat([
      {role: 'user', content: 'Hello'},
    ]);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(30_000);
    finish({version: 1, content: 'Hello back'});
    await expect(pending).resolves.toBe('Hello back');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects empty image analysis instead of displaying success', async () => {
    const requestJson = jest
      .fn()
      .mockResolvedValue({version: 1, content: '   '});
    await expect(
      new BrowserAiService({requestJson}).analyzeMealImage({
        mimeType: 'image/jpeg',
        base64: 'aW1hZ2U=',
        instruction: 'Describe',
      }),
    ).rejects.toMatchObject({code: 'invalid_response'});
  });
});
