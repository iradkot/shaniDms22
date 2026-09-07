import {
  configureShaniLlmProxyRuntime,
  provisionLlmCredential,
  testLlmConnection,
  analyzeMealImageViaProxy,
} from 'app/services/llm/shaniLlmProxy';

describe('native AI credential upload', () => {
  afterEach(() => configureShaniLlmProxyRuntime(null));

  it('allows a normal meal photo larger than the text-chat request limit', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          version: 1,
          provider: 'openai',
          content: 'Meal analysis',
        }),
    }));
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'test-token',
      fetch: fetchMock,
    });
    await expect(
      analyzeMealImageViaProxy({
        provider: 'openai',
        model: 'test-model',
        instruction: 'Describe this meal.',
        mimeType: 'image/jpeg',
        base64: 'A'.repeat(800_000),
      }),
    ).resolves.toBe('Meal analysis');
  });

  it.each([
    [401, 'invalid_credential'],
    [403, 'provider_permission_denied'],
    [429, 'provider_quota_exceeded'],
    [401, 'unauthenticated'],
  ])('keeps the server error distinction %s / %s', async (status, code) => {
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'test-token',
      fetch: async () => ({
        ok: false,
        status: Number(status),
        text: async () => JSON.stringify({code}),
      }),
    });
    await expect(
      provisionLlmCredential('openai', 'test-key'),
    ).rejects.toMatchObject({code});
  });

  it('identifies an undeployed Firebase function even when its response is HTML', async () => {
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'test-token',
      fetch: async () => ({
        ok: false,
        status: 404,
        text: async () => '<html>Page not found</html>',
      }),
    });
    await expect(
      provisionLlmCredential('openai', 'test-key'),
    ).rejects.toMatchObject({code: 'backend_unconfigured'});
  });

  it('does not upload a key into a different account during token acquisition', async () => {
    let owner = 'account-a';
    const fetchMock = jest.fn();
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getCurrentUserId: () => owner,
      getFirebaseIdToken: async () => {
        owner = 'account-b';
        return 'account-b-token';
      },
      fetch: fetchMock,
    });
    await expect(
      provisionLlmCredential('openai', 'test-key', 'account-a'),
    ).rejects.toMatchObject({code: 'account_changed'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tests the vaulted credential without sending a key or health data', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          version: 1,
          provider: 'openai',
          model: 'test-model',
          connected: true,
        }),
    }));
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'test-token',
      fetch: fetchMock,
    });
    await expect(
      testLlmConnection('openai', 'test-model'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.test/v1/vault/llm/test',
      expect.objectContaining({
        body: JSON.stringify({
          version: 1,
          provider: 'openai',
          model: 'test-model',
        }),
      }),
    );
  });

  it('uploads a project key on a native runtime without TextEncoder', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'TextEncoder',
    );
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({version: 1, configured: true}),
    }));
    configureShaniLlmProxyRuntime({
      baseUrl: 'https://backend.example.test',
      getFirebaseIdToken: async () => 'firebase-test-token',
      fetch: fetchMock,
    });
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(
        provisionLlmCredential('openai', `sk-proj-${'x'.repeat(160)}`),
      ).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'TextEncoder', descriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'TextEncoder');
      }
    }
  });
});
