import {
  createNightscoutVaultSynchronizer,
  type NightscoutVaultActiveProfileReader,
  type NightscoutVaultAuthSession,
  type NightscoutVaultRemote,
  type StringKeyValueStore,
} from 'app/services/backend/nightscoutVaultSynchronizer';

const USER_ID = 'firebase-user-a';
const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);
const SECRET_C = 'c'.repeat(40);

class MemoryStringStore implements StringKeyValueStore {
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

class MutableAuthSession implements NightscoutVaultAuthSession {
  userId: string | null = USER_ID;
  private readonly listeners = new Set<(userId: string | null) => void>();

  getCurrentUserId(): string | null {
    return this.userId;
  }

  subscribe(listener: (userId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(userId: string | null): void {
    this.userId = userId;
    this.listeners.forEach(listener => listener(userId));
  }
}

const activeProfileReader = (
  current: {value: {baseUrl: string; apiSecretSha1: string} | null},
): NightscoutVaultActiveProfileReader => ({
  readActiveProfile: async () => current.value,
});

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('Nightscout vault synchronizer', () => {
  it('survives an offline restart without storing the URL or credential in its outbox', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current = {
      value: {
        baseUrl: 'https://private-nightscout.example',
        apiSecretSha1: SECRET_A,
      },
    };
    const firstRemote: NightscoutVaultRemote = {
      provision: jest.fn().mockRejectedValue(new Error('offline')),
      remove: jest.fn(),
    };
    const first = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote: firstRemote,
    });

    await first.requestReconciliation('provision');
    await first.retryPending();

    expect(first.getSnapshot().state).toBe('error');
    expect(strings.values.size).toBe(1);
    const persisted = [...strings.values.values()][0];
    expect(persisted).toBeDefined();
    expect(persisted).not.toContain(current.value.baseUrl);
    expect(persisted).not.toContain(SECRET_A);
    expect(persisted).not.toMatch(/api.?key|secret|base.?url/i);

    const secondRemote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(),
    };
    const afterRestart = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote: secondRemote,
    });

    await afterRestart.retryPending();

    expect(secondRemote.provision).toHaveBeenCalledWith(current.value, USER_ID);
    expect(strings.values.size).toBe(0);
    expect(afterRestart.getSnapshot()).toEqual({state: 'idle', pending: false});
  });

  it('coalesces superseded profile switches to the latest active profile', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current: {
      value: {baseUrl: string; apiSecretSha1: string} | null;
    } = {
      value: {baseUrl: 'https://a.example', apiSecretSha1: SECRET_A},
    };
    let releaseFirst: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const firstCall = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const provision = jest
      .fn<Promise<void>, [{baseUrl: string; apiSecretSha1: string}]>()
      .mockImplementationOnce(() => {
        markStarted?.();
        return firstCall;
      })
      .mockResolvedValue(undefined);
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote: {provision, remove: jest.fn()},
    });

    await sync.requestReconciliation('provision');
    await started;
    expect(provision).toHaveBeenCalledTimes(1);

    current.value = {baseUrl: 'https://b.example', apiSecretSha1: SECRET_B};
    await sync.requestReconciliation('provision');
    current.value = {baseUrl: 'https://c.example', apiSecretSha1: SECRET_C};
    await sync.requestReconciliation('provision');
    releaseFirst?.();
    await sync.retryPending();

    expect(provision.mock.calls).toEqual([
      [{baseUrl: 'https://a.example', apiSecretSha1: SECRET_A}, USER_ID],
      [{baseUrl: 'https://c.example', apiSecretSha1: SECRET_C}, USER_ID],
    ]);
    expect(strings.values.size).toBe(0);
  });

  it('provisions the replacement on switch and removes only when no active source remains', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current: {
      value: {baseUrl: string; apiSecretSha1: string} | null;
    } = {
      value: {baseUrl: 'https://b.example', apiSecretSha1: SECRET_B},
    };
    const remote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote,
    });

    await sync.requestReconciliation('provision');
    await sync.retryPending();
    expect(remote.provision).toHaveBeenCalledWith(current.value, USER_ID);
    expect(remote.remove).not.toHaveBeenCalled();

    current.value = null;
    await sync.requestReconciliation('remove');
    await sync.retryPending();
    expect(remote.remove).toHaveBeenCalledWith(USER_ID);
  });

  it('reconciles a profile added while a removal is still in flight', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current: {
      value: {baseUrl: string; apiSecretSha1: string} | null;
    } = {value: null};
    let finishRemoval: (() => void) | undefined;
    let markRemovalStarted: (() => void) | undefined;
    const removalStarted = new Promise<void>(resolve => {
      markRemovalStarted = resolve;
    });
    const removalFinished = new Promise<void>(resolve => {
      finishRemoval = resolve;
    });
    const remote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockImplementation(async () => {
        markRemovalStarted?.();
        await removalFinished;
      }),
    };
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote,
    });

    await sync.requestReconciliation('remove');
    await removalStarted;
    current.value = {baseUrl: 'https://c.example', apiSecretSha1: SECRET_C};
    await sync.requestReconciliation('provision');
    finishRemoval?.();
    await sync.retryPending();

    expect(remote.remove).toHaveBeenCalledWith(USER_ID);
    expect(remote.provision).toHaveBeenCalledWith(current.value, USER_ID);
    expect(sync.getSnapshot()).toEqual({state: 'idle', pending: false});
  });

  it('does not invent a server mutation when authentication changes', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    auth.userId = null;
    const current = {
      value: {baseUrl: 'https://a.example', apiSecretSha1: SECRET_A},
    };
    const remote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote,
    });
    const stop = sync.activate();

    await sync.requestReconciliation('provision');
    expect(remote.provision).not.toHaveBeenCalled();
    expect(strings.values.size).toBe(0);
    expect(sync.getSnapshot()).toMatchObject({
      state: 'error',
      pending: false,
      error: {code: 'unauthenticated'},
    });

    auth.emit(USER_ID);
    await flush();
    await sync.retryPending();
    expect(remote.provision).not.toHaveBeenCalled();
    expect(strings.values.size).toBe(0);
    stop();
  });

  it('does not erase an existing remote vault on a fresh device', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const remote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader({value: null}),
      remote,
    });
    const stop = sync.activate();

    auth.emit(USER_ID);
    await flush();
    await sync.retryPending();

    expect(remote.provision).not.toHaveBeenCalled();
    expect(remote.remove).not.toHaveBeenCalled();
    expect(strings.values.size).toBe(0);
    stop();
  });

  it('does not strand a new account intent when authentication changes during a request', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current = {
      value: {baseUrl: 'https://a.example', apiSecretSha1: SECRET_A},
    };
    let finishFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>(resolve => {
      markFirstStarted = resolve;
    });
    const firstFinished = new Promise<void>(resolve => {
      finishFirst = resolve;
    });
    const provision = jest
      .fn()
      .mockImplementationOnce(async () => {
        markFirstStarted?.();
        await firstFinished;
      })
      .mockResolvedValue(undefined);
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote: {provision, remove: jest.fn()},
    });
    const stop = sync.activate();

    await sync.requestReconciliation('provision');
    await firstStarted;
    auth.emit('firebase-user-b');
    await sync.requestReconciliation('provision');
    await flush();
    finishFirst?.();
    await sync.retryPending();

    expect(provision.mock.calls.map(call => call[1])).toEqual([
      USER_ID,
      'firebase-user-b',
    ]);
    expect(strings.values.size).toBe(0);
    stop();
  });

  it('does not let a status observer break durable queueing or local callers', async () => {
    const strings = new MemoryStringStore();
    const auth = new MutableAuthSession();
    const current = {
      value: {baseUrl: 'https://a.example', apiSecretSha1: SECRET_A},
    };
    const remote: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(),
    };
    const sync = createNightscoutVaultSynchronizer({
      strings,
      auth,
      profiles: activeProfileReader(current),
      remote,
    });
    sync.subscribe(() => {
      throw new Error('broken observer');
    });

    await expect(
      sync.requestReconciliation('provision'),
    ).resolves.toBeUndefined();
    await sync.retryPending();

    expect(remote.provision).toHaveBeenCalledWith(current.value, USER_ID);
    expect(strings.values.size).toBe(0);
  });
});
