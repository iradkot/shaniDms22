import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';

import {
  NightscoutConfigProvider,
  useNightscoutConfig,
} from '../src/contexts/NightscoutConfigContext';
import type {NightscoutConfigContextValue} from '../src/contexts/NightscoutConfigContext';
import {
  loadNightscoutProfiles,
  persistNightscoutProfiles,
} from '../src/services/nightscoutProfiles';
import {
  createNightscoutVaultSynchronizer,
  type NightscoutVaultAuthSession,
  type NightscoutVaultSynchronizer,
} from '../src/services/backend/nightscoutVaultSynchronizer';

const mockConfigureNightscoutInstance = jest.fn();
const mockClearNightscoutInstance = jest.fn();
const mockTestNightscoutConnection = jest.fn();

jest.mock('app/api/shaniNightscoutInstances', () => {
  return {
    configureNightscoutInstance: (...args: any[]) =>
      mockConfigureNightscoutInstance(...args),
    clearNightscoutInstance: (...args: any[]) =>
      mockClearNightscoutInstance(...args),
  };
});

jest.mock('app/services/nightscoutConnectionTest', () => {
  return {
    testNightscoutConnection: (...args: any[]) =>
      mockTestNightscoutConnection(...args),
  };
});
const noopVaultSynchronizer: NightscoutVaultSynchronizer = {
  getSnapshot: () => ({state: 'idle', pending: false}),
  subscribe: () => () => {},
  requestReconciliation: async () => {},
  retryPending: async () => {},
  activate: () => () => {},
};

class MutableAuthSession implements NightscoutVaultAuthSession {
  private listeners = new Set<(userId: string | null) => void>();

  constructor(public userId: string | null) {}

  getCurrentUserId = () => this.userId;

  subscribe = (listener: (userId: string | null) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  switchTo(userId: string | null) {
    this.userId = userId;
    this.listeners.forEach(listener => listener(userId));
  }
}

describe('NightscoutConfigContext', () => {
  beforeEach(async () => {
    mockConfigureNightscoutInstance.mockClear();
    mockClearNightscoutInstance.mockClear();
    mockTestNightscoutConnection.mockReset();
    mockTestNightscoutConnection.mockResolvedValue({ok: true, entriesCount: 1});
    await AsyncStorage.clear();
  });

  it('adds a profile, selects it, and configures axios', async () => {
    let ctx: NightscoutConfigContextValue | null = null;

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider
          authSession={new MutableAuthSession(null)}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });

    if (!ctx) {
      throw new Error('Nightscout context was not initialized');
    }

    await act(async () => {
      // `ctx` will be updated on re-render by the Consumer.
      await (ctx as NightscoutConfigContextValue).addProfile({
        urlInput: 'example.com/',
        secretInput: 'jvA4cWn9c7zxgTyZ',
      });
    });

    if (!ctx) {
      throw new Error(
        'Nightscout context was unexpectedly null after addProfile',
      );
    }

    expect(ctx.profiles.length).toBe(1);
    expect(ctx.activeProfile?.baseUrl).toBe('https://example.com');

    expect(mockConfigureNightscoutInstance).toHaveBeenCalledTimes(1);
    expect(mockTestNightscoutConnection).toHaveBeenCalledTimes(1);
    const call = mockConfigureNightscoutInstance.mock.calls[0][0];
    expect(call.baseUrl).toBe('https://example.com');
    expect(typeof call.apiSecretSha1).toBe('string');
    expect(call.apiSecretSha1).toHaveLength(40);

    // Verify it persisted.
    const stored = await loadNightscoutProfiles(null);
    expect(stored.profiles).toHaveLength(1);
  });

  it('does not save a profile when the connection test fails', async () => {
    let ctx: NightscoutConfigContextValue | null = null;

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider
          authSession={new MutableAuthSession(null)}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });

    mockTestNightscoutConnection.mockRejectedValueOnce(
      new Error('Invalid Nightscout secret'),
    );

    await expect(
      act(async () => {
        await (ctx as unknown as NightscoutConfigContextValue).addProfile({
          urlInput: 'example.com',
          secretInput: 'wrong-secret',
        });
      }),
    ).rejects.toThrow('Invalid Nightscout secret');

    expect(
      (ctx as unknown as NightscoutConfigContextValue).profiles,
    ).toHaveLength(0);
    expect(mockConfigureNightscoutInstance).not.toHaveBeenCalled();
    expect((await loadNightscoutProfiles(null)).profiles).toHaveLength(0);
  });

  it('updates the active profile URL and keeps secret when blank', async () => {
    let ctx: NightscoutConfigContextValue | null = null;

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider
          authSession={new MutableAuthSession(null)}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });

    if (!ctx) {
      throw new Error('Nightscout context was not initialized');
    }

    await act(async () => {
      await (ctx as NightscoutConfigContextValue).addProfile({
        urlInput: 'https://example.com/',
        secretInput: 'my-secret',
      });
    });

    if (!ctx?.activeProfile) {
      throw new Error('Expected an active profile after addProfile');
    }

    const before = ctx.activeProfile;

    await act(async () => {
      await (ctx as NightscoutConfigContextValue).updateProfile({
        profileId: before.id,
        urlInput: 'example.org',
        secretInput: '',
      });
    });

    if (!ctx?.activeProfile) {
      throw new Error('Expected an active profile after updateProfile');
    }

    expect(ctx.activeProfile.baseUrl).toBe('https://example.org');
    expect(ctx.activeProfile.apiSecretSha1).toBe(before.apiSecretSha1);
  });

  it('deletes the last profile and clears axios configuration', async () => {
    let ctx: NightscoutConfigContextValue | null = null;

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider
          authSession={new MutableAuthSession(null)}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });

    if (!ctx) {
      throw new Error('Nightscout context was not initialized');
    }

    await act(async () => {
      await (ctx as NightscoutConfigContextValue).addProfile({
        urlInput: 'example.com',
        secretInput: 'my-secret',
      });
    });

    if (!ctx?.activeProfile) {
      throw new Error('Expected an active profile after addProfile');
    }

    const id = ctx.activeProfile.id;

    await act(async () => {
      await (ctx as NightscoutConfigContextValue).deleteProfile(id);
    });

    expect(ctx.profiles).toHaveLength(0);
    expect(ctx.activeProfile).toBeNull();
    expect(mockClearNightscoutInstance).toHaveBeenCalledTimes(1);
  });

  it('finishes local secure save without waiting for vault network sync', async () => {
    let ctx: NightscoutConfigContextValue | null = null;
    let releaseProvision: (() => void) | undefined;
    let markProvisionStarted: (() => void) | undefined;
    const provisionStarted = new Promise<void>(resolve => {
      markProvisionStarted = resolve;
    });
    const provisionFinished = new Promise<void>(resolve => {
      releaseProvision = resolve;
    });
    const values = new Map<string, string>();
    const auth = new MutableAuthSession('firebase-user-a');
    const sync = createNightscoutVaultSynchronizer({
      strings: {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, value) => {
          values.set(key, value);
        },
        removeItem: async key => {
          values.delete(key);
        },
      },
      auth,
      profiles: {
        readActiveProfile: async () => {
          const stored = await loadNightscoutProfiles('firebase-user-a');
          const active =
            stored.profiles.find(
              profile => profile.id === stored.activeProfileId,
            ) ?? null;
          return active
            ? {
                baseUrl: active.baseUrl,
                apiSecretSha1: active.apiSecretSha1,
              }
            : null;
        },
      },
      remote: {
        provision: async () => {
          markProvisionStarted?.();
          await provisionFinished;
        },
        remove: async () => {},
      },
    });

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };
    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider authSession={auth} vaultSynchronizer={sync}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
    if (!ctx) {
      throw new Error('Nightscout context was not initialized');
    }

    let localSaveFinished = false;
    await act(async () => {
      await (ctx as NightscoutConfigContextValue).addProfile({
        urlInput: 'https://private.example',
        secretInput: 'plain-secret',
      });
      localSaveFinished = true;
    });
    await provisionStarted;

    expect(localSaveFinished).toBe(true);
    expect((ctx as NightscoutConfigContextValue).vaultSyncStatus.pending).toBe(
      true,
    );

    releaseProvision?.();
    await act(async () => {
      await sync.retryPending();
    });
    expect((ctx as NightscoutConfigContextValue).vaultSyncStatus).toEqual({
      state: 'idle',
      pending: false,
    });
  });

  it('queues only explicit profile mutations and uses an explicit removal intent', async () => {
    let ctx: NightscoutConfigContextValue | null = null;
    const requestReconciliation = jest.fn().mockResolvedValue(undefined);
    const synchronizer: NightscoutVaultSynchronizer = {
      ...noopVaultSynchronizer,
      requestReconciliation,
    };
    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };
    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider vaultSynchronizer={synchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
    expect(requestReconciliation).not.toHaveBeenCalled();

    await act(async () => {
      await (ctx as unknown as NightscoutConfigContextValue).addProfile({
        urlInput: 'https://a.example',
        secretInput: 'secret-a',
      });
    });
    const firstId = (ctx as unknown as NightscoutConfigContextValue)
      .activeProfile?.id;
    if (!firstId) {
      throw new Error('Expected first profile');
    }

    await act(async () => {
      await (ctx as unknown as NightscoutConfigContextValue).addProfile({
        urlInput: 'https://b.example',
        secretInput: 'secret-b',
      });
    });
    const secondId = (ctx as unknown as NightscoutConfigContextValue)
      .activeProfile?.id;
    if (!secondId) {
      throw new Error('Expected second profile');
    }

    await act(async () => {
      await (ctx as unknown as NightscoutConfigContextValue).setActiveProfileId(
        firstId,
      );
      await (ctx as unknown as NightscoutConfigContextValue).updateProfile({
        profileId: firstId,
        urlInput: 'https://a-updated.example',
      });
      await (ctx as unknown as NightscoutConfigContextValue).deleteProfile(
        secondId,
      );
    });

    await act(async () => {
      await (ctx as unknown as NightscoutConfigContextValue).deleteProfile(
        firstId,
      );
    });

    expect(requestReconciliation.mock.calls).toEqual([
      ['provision'],
      ['provision'],
      ['provision'],
      ['provision'],
      ['provision'],
      ['remove'],
    ]);
  });

  it('does not apply a successful connection test after the account changes', async () => {
    const auth = new MutableAuthSession('firebase-user-a');
    let ctx: NightscoutConfigContextValue | null = null;
    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NightscoutConfigProvider
          authSession={auth}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
    let finishConnection: (() => void) | undefined;
    mockTestNightscoutConnection.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishConnection = () =>
            resolve({ok: true, entriesCount: 1, authMethod: 'query'});
        }),
    );
    let result: Promise<unknown> | undefined;
    await act(async () => {
      result = (ctx as unknown as NightscoutConfigContextValue)
        .addProfile({urlInput: 'https://a.example', secretInput: 'secret-a'})
        .catch(error => error);
      await Promise.resolve();
    });
    expect(finishConnection).toBeDefined();
    await act(async () => {
      auth.switchTo('firebase-user-b');
    });
    await act(async () => {
      finishConnection!();
      await result;
    });
    expect(await result).toEqual(
      new Error('The signed-in account changed before saving.'),
    );
    expect((ctx as unknown as NightscoutConfigContextValue).profiles).toEqual(
      [],
    );
    expect((await loadNightscoutProfiles('firebase-user-a')).profiles).toEqual(
      [],
    );
    expect((await loadNightscoutProfiles('firebase-user-b')).profiles).toEqual(
      [],
    );
    expect(mockConfigureNightscoutInstance).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('clears account A immediately and reloads only account B on auth switch', async () => {
    const auth = new MutableAuthSession('firebase-user-a');
    const profileA = {
      id: 'profile_a',
      label: 'A',
      baseUrl: 'https://a.example',
      apiSecretSha1: 'a'.repeat(40),
      createdAt: 1,
    };
    const profileB = {
      id: 'profile_b',
      label: 'B',
      baseUrl: 'https://b.example',
      apiSecretSha1: 'b'.repeat(40),
      createdAt: 2,
    };
    await persistNightscoutProfiles([profileA], profileA.id, 'firebase-user-a');
    await persistNightscoutProfiles([profileB], profileB.id, 'firebase-user-b');
    let ctx: NightscoutConfigContextValue | null = null;
    const renderedProfileUrls: string[][] = [];
    const Consumer = () => {
      ctx = useNightscoutConfig();
      renderedProfileUrls.push(ctx.profiles.map(profile => profile.baseUrl));
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider
          authSession={auth}
          vaultSynchronizer={noopVaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
    expect(ctx?.activeProfile?.baseUrl).toBe('https://a.example');

    await act(async () => {
      auth.switchTo('firebase-user-b');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ctx?.activeProfile?.baseUrl).toBe('https://b.example');
    expect(renderedProfileUrls).toContainEqual([]);
    const configuredUrls = mockConfigureNightscoutInstance.mock.calls.map(
      call => call[0].baseUrl,
    );
    expect(configuredUrls).toEqual(['https://a.example', 'https://b.example']);
    expect(mockClearNightscoutInstance).toHaveBeenCalled();
  });
});
