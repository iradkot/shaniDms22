import {BrowserFirebaseAuth} from '../../../src/platform/web';

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const jsonResponse = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
};

describe('BrowserFirebaseAuth', () => {
  it('exchanges a Google credential, persists the account scope and refreshes tokens', async () => {
    const storage = new MemoryStorage();
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localId: 'firebase_uid_1',
          email: 'person@example.com',
          displayName: 'Person',
          idToken: 'initial-id-token-1234567890',
          refreshToken: 'initial-refresh-token-1234567890',
          expiresIn: '3600',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user_id: 'firebase_uid_1',
          id_token: 'refreshed-id-token-1234567890',
          refresh_token: 'refreshed-refresh-token-1234567890',
          expires_in: '3600',
        }),
      );
    const auth = new BrowserFirebaseAuth({
      apiKey: 'firebase-key',
      storage,
      fetch: request,
      now: () => 1_700_000_000_000,
    });

    await auth.initialize();
    expect(auth.getSnapshot()).toEqual({status: 'signed-out'});
    await auth.signInWithGoogleCredential(
      'google-id-token-12345678901234567890',
    );
    expect(auth.getSnapshot()).toEqual({
      status: 'signed-in',
      identity: {
        uid: 'firebase_uid_1',
        email: 'person@example.com',
        displayName: 'Person',
      },
      connection: 'online',
    });
    await expect(auth.getIdToken(true)).resolves.toBe(
      'refreshed-id-token-1234567890',
    );
    expect([...storage.values.values()].join('\n')).not.toContain(
      'google-id-token-12345678901234567890',
    );
  });

  it('keeps a cached account scope when refresh is offline', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(
      'shani.web.firebase-session.v1',
      JSON.stringify({
        schemaVersion: 1,
        identity: {uid: 'firebase_uid_2', email: 'offline@example.com'},
        idToken: 'cached-id-token-1234567890',
        refreshToken: 'cached-refresh-token-1234567890',
        expiresAtMs: 1_700_000_100_000,
      }),
    );
    const auth = new BrowserFirebaseAuth({
      apiKey: 'firebase-key',
      storage,
      fetch: jest.fn().mockRejectedValue(new Error('offline')),
      now: () => 1_700_000_000_000,
    });

    await auth.initialize();
    expect(auth.getSnapshot()).toEqual({
      status: 'signed-in',
      identity: {uid: 'firebase_uid_2', email: 'offline@example.com'},
      connection: 'offline',
    });
  });

  it('cannot restore an old account after sign-out during token refresh', async () => {
    const storage = new MemoryStorage();
    const refreshResponse = deferred<Response>();
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localId: 'account_a',
          email: 'a@example.com',
          idToken: 'account-a-id-token-1234567890',
          refreshToken: 'account-a-refresh-token-1234567890',
          expiresIn: '3600',
        }),
      )
      .mockImplementationOnce(() => refreshResponse.promise);
    const auth = new BrowserFirebaseAuth({
      apiKey: 'firebase-key',
      storage,
      fetch: request,
      now: () => 1_700_000_000_000,
    });

    await auth.initialize();
    await auth.signInWithGoogleCredential(
      'google-account-a-token-1234567890',
    );
    const oldRefresh = auth.getIdToken(true);
    await auth.signOut();
    refreshResponse.resolve(
      jsonResponse(200, {
        user_id: 'account_a',
        id_token: 'late-account-a-token-1234567890',
        refresh_token: 'late-account-a-refresh-1234567890',
        expires_in: '3600',
      }),
    );

    await expect(oldRefresh).rejects.toMatchObject({name: 'AbortError'});
    expect(auth.getSnapshot()).toEqual({status: 'signed-out'});
    expect(auth.getIdentity()).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it('cannot overwrite account B with a late account A refresh', async () => {
    const storage = new MemoryStorage();
    const refreshResponse = deferred<Response>();
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localId: 'account_a',
          email: 'a@example.com',
          idToken: 'account-a-id-token-1234567890',
          refreshToken: 'account-a-refresh-token-1234567890',
          expiresIn: '3600',
        }),
      )
      .mockImplementationOnce(() => refreshResponse.promise)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localId: 'account_b',
          email: 'b@example.com',
          idToken: 'account-b-id-token-1234567890',
          refreshToken: 'account-b-refresh-token-1234567890',
          expiresIn: '3600',
        }),
      );
    const auth = new BrowserFirebaseAuth({
      apiKey: 'firebase-key',
      storage,
      fetch: request,
      now: () => 1_700_000_000_000,
    });

    await auth.initialize();
    await auth.signInWithGoogleCredential(
      'google-account-a-token-1234567890',
    );
    const oldRefresh = auth.getIdToken(true);
    await auth.signInWithGoogleCredential(
      'google-account-b-token-1234567890',
    );
    refreshResponse.resolve(
      jsonResponse(200, {
        user_id: 'account_a',
        id_token: 'late-account-a-token-1234567890',
        refresh_token: 'late-account-a-refresh-1234567890',
        expires_in: '3600',
      }),
    );

    await expect(oldRefresh).rejects.toMatchObject({name: 'AbortError'});
    expect(auth.getSnapshot()).toEqual({
      status: 'signed-in',
      identity: {uid: 'account_b', email: 'b@example.com'},
      connection: 'online',
    });
    expect([...storage.values.values()].join('\n')).toContain('account_b');
    expect([...storage.values.values()].join('\n')).not.toContain(
      'late-account-a-token',
    );
  });
});
