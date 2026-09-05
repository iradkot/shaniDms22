import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';
import {
  NightscoutConfigProvider,
  useNightscoutConfig,
  type NightscoutConfigContextValue,
} from '../src/contexts/NightscoutConfigContext';
import {loadNightscoutProfiles} from '../src/services/nightscoutProfiles';
import type {
  NightscoutVaultAuthSession,
  NightscoutVaultSynchronizer,
} from '../src/services/backend/nightscoutVaultSynchronizer';

const mockConfigure = jest.fn();
const mockTestConnection = jest.fn();
jest.mock('app/api/shaniNightscoutInstances', () => ({
  configureNightscoutInstance: (...args: unknown[]) => mockConfigure(...args),
  clearNightscoutInstance: jest.fn(),
}));
jest.mock('app/services/nightscoutConnectionTest', () => ({
  testNightscoutConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

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

const legacyProfile = {
  id: 'ns_context_recovery',
  label: 'Old device connection',
  baseUrl: 'https://recovery.example.com',
  apiSecretSha1: 'a'.repeat(40),
  createdAt: 1700000000000,
};
const reconcile = jest.fn(async () => {});
const vault: NightscoutVaultSynchronizer = {
  getSnapshot: () => ({state: 'idle', pending: false}),
  subscribe: () => () => {},
  requestReconciliation: reconcile,
  retryPending: async () => {},
  activate: () => () => {},
};

describe('Nightscout recovery through the account context', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  let context: NightscoutConfigContextValue;
  let auth: MutableAuthSession;
  const Consumer = () => {
    context = useNightscoutConfig();
    return null;
  };
  const mount = async (userId: string | null = 'owner-a') => {
    auth = new MutableAuthSession(userId);
    await act(async () => {
      tree = renderer.create(
        <NightscoutConfigProvider authSession={auth} vaultSynchronizer={vault}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    mockTestConnection
      .mockReset()
      .mockResolvedValue({ok: true, entriesCount: 1});
    await AsyncStorage.clear();
    await AsyncStorage.setItem(
      'nightscout.profiles.v1',
      JSON.stringify([legacyProfile]),
    );
  });
  afterEach(async () => {
    await act(async () => tree?.unmount());
    tree = undefined;
  });

  it('shows only the pending count until explicit recovery, then selects the verified source', async () => {
    await mount();
    expect(context.isLoaded).toBe(true);
    expect(context.profiles).toEqual([]);
    expect(context.pendingLegacyProfileCount).toBe(1);
    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(mockConfigure).not.toHaveBeenCalled();
    await act(async () => context.recoverLegacyProfiles());
    expect(mockTestConnection).toHaveBeenCalledWith({
      baseUrl: legacyProfile.baseUrl,
      apiSecretSha1: legacyProfile.apiSecretSha1,
    });
    expect(context.activeProfile).toEqual(legacyProfile);
    expect(context.pendingLegacyProfileCount).toBe(0);
    expect(mockConfigure).toHaveBeenCalledWith({
      baseUrl: legacyProfile.baseUrl,
      apiSecretSha1: legacyProfile.apiSecretSha1,
      ownerUserId: 'owner-a',
    });
    expect(reconcile).toHaveBeenCalledWith('provision');
  });

  it('keeps the saved source pending after failed verification', async () => {
    await mount();
    mockTestConnection.mockRejectedValueOnce(new Error('Unavailable'));
    await act(async () => {
      await expect(context.recoverLegacyProfiles()).rejects.toThrow(
        'Unavailable',
      );
    });
    expect(context.pendingLegacyProfileCount).toBe(1);
    expect(context.profiles).toEqual([]);
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('hides the pending count and rejects recovery while signed out', async () => {
    await mount(null);
    expect(context.pendingLegacyProfileCount).toBe(0);
    await expect(context.recoverLegacyProfiles()).rejects.toThrow('Sign in');
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'cancels a verification spanning an account change (switch back: %s)',
    async switchBack => {
      await mount();
      let finishVerification: (() => void) | undefined;
      mockTestConnection.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishVerification = resolve;
          }),
      );
      let result: Promise<void>;
      await act(async () => {
        result = context.recoverLegacyProfiles();
        // Wait until the real storage path reaches the injected network boundary.
        for (
          let attempt = 0;
          attempt < 30 && !finishVerification;
          attempt += 1
        ) {
          await new Promise<void>(resolve => setImmediate(resolve));
        }
        expect(finishVerification).toBeDefined();
        auth.switchTo('owner-b');
        if (switchBack) {
          auth.switchTo('owner-a');
        }
        finishVerification!();
        await expect(result).rejects.toThrow('account changed');
      });
      expect(context.profiles).toEqual([]);
      expect(context.pendingLegacyProfileCount).toBe(1);
      expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
      expect((await loadNightscoutProfiles('owner-b')).profiles).toEqual([]);
      expect(mockConfigure).not.toHaveBeenCalled();
      expect(reconcile).not.toHaveBeenCalled();
    },
  );
});
