import {
  NativeAuthenticatedBackendError,
  createNativeAuthenticatedBackendClient,
} from 'app/services/backend/nativeAuthenticatedBackendClient';
import {createNativeNightscoutVaultClient} from 'app/services/backend/nativeNightscoutVaultClient';

const USER_ID = 'firebase-user-a';
const SECRET = 'a'.repeat(40);

describe('native Nightscout vault client', () => {
  it('sends the credential only in the authenticated provision request body', async () => {
    const requestJson = jest.fn().mockResolvedValue({
      version: 1,
      configured: true,
      sourceId: 'ns_source',
      workspaceId: 'workspace_source',
    });
    const client = createNativeNightscoutVaultClient({api: {requestJson}});

    await client.provision(
      {baseUrl: 'https://nightscout.example', apiSecretSha1: SECRET},
      USER_ID,
    );

    expect(requestJson).toHaveBeenCalledWith(
      '/v1/vault/nightscout/provision',
      {
        method: 'POST',
        expectedUserId: USER_ID,
        body: {
          version: 1,
          url: 'https://nightscout.example',
          apiKey: SECRET,
        },
      },
    );
  });

  it('removes through the owner-bound endpoint and rejects malformed confirmation', async () => {
    const requestJson = jest.fn().mockResolvedValue({
      version: 1,
      configured: true,
    });
    const client = createNativeNightscoutVaultClient({api: {requestJson}});

    await expect(client.remove(USER_ID)).rejects.toThrow(
      'did not confirm credential removal',
    );
    expect(requestJson).toHaveBeenCalledWith(
      '/v1/vault/nightscout/remove',
      {
        method: 'POST',
        expectedUserId: USER_ID,
        body: {version: 1},
      },
    );
  });

  it('rejects an absent or changed Firebase session before network I/O', async () => {
    const fetch = jest.fn();
    const api = createNativeAuthenticatedBackendClient({
      baseUrl: 'https://backend.example',
      getSession: async () => null,
      fetch,
    });

    await expect(
      api.requestJson('/v1/vault/nightscout/remove', {
        method: 'POST',
        expectedUserId: USER_ID,
        body: {version: 1},
      }),
    ).rejects.toMatchObject<Partial<NativeAuthenticatedBackendError>>({
      code: 'unauthenticated',
    });
    expect(fetch).not.toHaveBeenCalled();

    const changedSessionApi = createNativeAuthenticatedBackendClient({
      baseUrl: 'https://backend.example',
      getSession: async () => ({userId: 'different-user', idToken: 'token'}),
      fetch,
    });
    await expect(
      changedSessionApi.requestJson('/v1/vault/nightscout/remove', {
        method: 'POST',
        expectedUserId: USER_ID,
        body: {version: 1},
      }),
    ).rejects.toMatchObject({code: 'unauthenticated'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses a Firebase bearer token and validates a bounded JSON response', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({version: 1, configured: false}),
    });
    const api = createNativeAuthenticatedBackendClient({
      baseUrl: 'https://backend.example/',
      getSession: async () => ({userId: USER_ID, idToken: 'firebase-token'}),
      fetch,
    });

    await api.requestJson('/v1/vault/nightscout/remove', {
      method: 'POST',
      expectedUserId: USER_ID,
      body: {version: 1},
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://backend.example/v1/vault/nightscout/remove',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({version: 1}),
      }),
    );
  });

  it('is deterministic in E2E mode and never performs vault network I/O', async () => {
    const requestJson = jest.fn();
    const client = createNativeNightscoutVaultClient({
      api: {requestJson},
      e2e: true,
    });

    await client.provision(
      {baseUrl: 'https://nightscout.example', apiSecretSha1: SECRET},
      'e2e-product-user',
    );
    await client.remove('e2e-product-user');

    expect(requestJson).not.toHaveBeenCalled();
  });
});
