import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {AppState, type AppStateStatus} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {sha1} from 'js-sha1';
import {
  AiSettingsProvider,
  type AiCredentialRemote,
  useAiSettings,
} from '../src/contexts/AiSettingsContext';
import {serverVaultCredentialMarker} from '../src/services/llm/shaniLlmProxy';
import {isConfiguredAiCredential} from '../src/services/llm/credentialReadiness';

const USER_A = 'ai-sync-user-a';
const USER_B = 'ai-sync-user-b';
const service = (owner: string) => `shani.ai.openai.v2.u${sha1(owner)}`;
const intentKey = (owner: string) => `ai.credential.intent.v1:u${sha1(owner)}`;
const failure = (code: string) => Object.assign(new Error('Untrusted upstream detail'), {code});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
};
const flush = async () => {
  for (let index = 0; index < 35; index += 1) {
    await Promise.resolve();
  }
};
const authSession = () => {
  let user: string | null = USER_A;
  const listeners = new Set<(uid: string | null) => void>();
  return {
    getCurrentUserId: () => user,
    subscribe: (listener: (uid: string | null) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    switchTo: (uid: string | null) => {
      user = uid;
      listeners.forEach(listener => listener(uid));
    },
  };
};

describe('signed-in AI credential synchronization', () => {
  let context: ReturnType<typeof useAiSettings>;
  let tree: renderer.ReactTestRenderer | undefined;
  let foreground: ((state: AppStateStatus) => void) | undefined;

  beforeEach(async () => {
    await AsyncStorage.clear();
    await Promise.all([
      'shani.ai.openai',
      'shani.ai.openai.v2.signed-out-local',
      service(USER_A),
      service(USER_B),
    ].map(value => Keychain.resetGenericPassword({service: value})));
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      foreground = listener;
      return {remove: jest.fn()};
    });
  });

  afterEach(() => {
    if (tree) {
      act(() => tree!.unmount());
    }
    tree = undefined;
    foreground = undefined;
    jest.restoreAllMocks();
  });

  const mount = async (
    remote: AiCredentialRemote,
    auth = authSession(),
  ) => {
    const Probe = () => { context = useAiSettings(); return null; };
    await act(async () => {
      tree = renderer.create(
        <AiSettingsProvider authSession={auth} credentialRemote={remote}>
          <Probe />
        </AiSettingsProvider>,
      );
      await flush();
    });
    return auth;
  };

  it('keeps a failed upload secure and unavailable until retry confirms it', async () => {
    const provision = jest.fn()
      .mockRejectedValueOnce(failure('network'))
      .mockResolvedValue(undefined);
    await mount({status: async () => false, provision, remove: async () => undefined});
    await act(async () => {
      await expect(context.setSetting('apiKey', 'synthetic-key-a')).rejects.toMatchObject({code: 'network'});
    });
    expect(context.settings.apiKey).toBe('');
    expect(context.credentialSyncStatus).toMatchObject({state: 'error', pending: true, code: 'network'});
    expect(JSON.stringify(context.credentialSyncStatus)).not.toContain('Untrusted');
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toMatchObject({password: 'synthetic-key-a'});
    expect(await AsyncStorage.getItem(intentKey(USER_A))).toBe('provision');
    const stored = await Promise.all((await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)));
    expect(stored.join('\n')).not.toContain('synthetic-key-a');
    await act(async () => { await context.retryCredentialSync(); });
    expect(provision).toHaveBeenLastCalledWith('synthetic-key-a', USER_A);
    expect(context.settings.apiKey).toBe(serverVaultCredentialMarker);
    expect(context.credentialSyncStatus).toEqual({state: 'configured', pending: false});
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toBe(false);
    expect(await AsyncStorage.getItem(intentKey(USER_A))).toBeNull();
  });

  it('serializes a slow initial status read before a new save', async () => {
    const status = deferred<boolean>();
    const provision = jest.fn(async () => undefined);
    await mount({status: () => status.promise, provision, remove: async () => undefined});
    expect(context.isLoaded).toBe(true);
    let saving!: Promise<void>;
    await act(async () => {
      saving = context.setSetting('apiKey', 'synthetic-key-a');
      await flush();
    });
    expect(provision).not.toHaveBeenCalled();
    await act(async () => {
      status.resolve(false);
      await saving;
    });
    expect(context.credentialSyncStatus.state).toBe('configured');
    expect(context.settings.apiKey).toBe(serverVaultCredentialMarker);
  });

  it('keeps an existing server key usable when its replacement is rejected and retries the staged replacement', async () => {
    const replacement = deferred<void>();
    const provision = jest.fn()
      .mockImplementationOnce(async () => { await replacement.promise; throw failure('invalid_credential'); })
      .mockResolvedValue(undefined);
    await mount({status: async () => true, provision, remove: async () => undefined});
    let saving!: Promise<void>;
    await act(async () => {
      saving = context.setSetting('apiKey', 'synthetic-replacement');
      await flush();
    });
    expect(context.credentialSyncStatus.state).toBe('syncing');
    expect(isConfiguredAiCredential(context.settings.apiKey)).toBe(true);
    await act(async () => {
      replacement.resolve();
      await expect(saving).rejects.toMatchObject({code: 'invalid_credential'});
    });
    expect(context.settings.apiKey).toBe(serverVaultCredentialMarker);
    expect(context.credentialSyncStatus).toMatchObject({state: 'error', pending: true, code: 'invalid_credential'});
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toMatchObject({password: 'synthetic-replacement'});
    expect(await AsyncStorage.getItem(intentKey(USER_A))).toBe('provision');
    await act(async () => { await context.retryCredentialSync(); });
    expect(provision).toHaveBeenLastCalledWith('synthetic-replacement', USER_A);
    expect(context.credentialSyncStatus.state).toBe('configured');
    expect(isConfiguredAiCredential(context.settings.apiKey)).toBe(true);
  });

  it('recovers existing server readiness after restarting with a rejected replacement staged', async () => {
    await Keychain.setGenericPassword('credential', 'synthetic-replacement', {service: service(USER_A)});
    await AsyncStorage.setItem(intentKey(USER_A), 'provision');
    const provision = jest.fn().mockRejectedValue(failure('invalid_credential'));
    await mount({status: async () => true, provision, remove: async () => undefined});
    expect(context.settings.apiKey).toBe(serverVaultCredentialMarker);
    expect(isConfiguredAiCredential(context.settings.apiKey)).toBe(true);
    expect(context.credentialSyncStatus).toMatchObject({state: 'error', pending: true});
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toMatchObject({password: 'synthetic-replacement'});
  });

  it('queues a replacement behind retry without deleting the new key or intent', async () => {
    const retry = deferred<void>();
    const provision = jest.fn()
      .mockRejectedValueOnce(failure('network'))
      .mockImplementationOnce(() => retry.promise)
      .mockResolvedValue(undefined);
    await mount({status: async () => false, provision, remove: async () => undefined});
    await act(async () => {
      await context.setSetting('apiKey', 'synthetic-key-a').catch(() => undefined);
    });
    let syncing!: Promise<void>;
    let replacing!: Promise<void>;
    await act(async () => {
      syncing = context.retryCredentialSync();
      replacing = context.setSetting('apiKey', 'synthetic-key-b');
      await flush();
    });
    expect(provision).toHaveBeenCalledTimes(2);
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toMatchObject({password: 'synthetic-key-a'});
    await act(async () => { retry.resolve(); await Promise.all([syncing, replacing]); });
    expect(provision.mock.calls).toEqual([
      ['synthetic-key-a', USER_A], ['synthetic-key-a', USER_A], ['synthetic-key-b', USER_A],
    ]);
    expect(context.credentialSyncStatus.state).toBe('configured');
    expect(await AsyncStorage.getItem(intentKey(USER_A))).toBeNull();
  });

  it('ignores a previous account status response and binds new requests to the new owner', async () => {
    const oldStatus = deferred<boolean>();
    const status = jest.fn()
      .mockImplementationOnce(() => oldStatus.promise)
      .mockResolvedValue(false);
    const provision = jest.fn(async () => undefined);
    const auth = await mount({status, provision, remove: async () => undefined});
    await act(async () => { auth.switchTo(USER_B); await flush(); });
    expect(context.settings.apiKey).toBe('');
    await act(async () => { oldStatus.resolve(true); await flush(); });
    expect(context.credentialSyncStatus.state).toBe('idle');
    expect(status.mock.calls).toEqual([[USER_A], [USER_B]]);
    await act(async () => { await context.setSetting('apiKey', 'synthetic-key-b'); });
    expect(provision).toHaveBeenCalledWith('synthetic-key-b', USER_B);
  });

  it('keeps failed removal unavailable and retries the removal instead of provisioning', async () => {
    const remove = jest.fn().mockRejectedValueOnce(failure('timeout')).mockResolvedValue(undefined);
    const provision = jest.fn();
    await mount({status: async () => true, provision, remove});
    await act(async () => { await context.setSetting('apiKey', '').catch(() => undefined); });
    expect(context.settings.apiKey).toBe('');
    expect(context.credentialSyncStatus).toMatchObject({state: 'error', pending: true});
    await act(async () => { await context.retryCredentialSync(); });
    expect(provision).not.toHaveBeenCalled();
    expect(remove).toHaveBeenLastCalledWith(USER_A);
    expect(context.credentialSyncStatus).toEqual({state: 'idle', pending: false});
  });

  it('does not expose a completed old-account upload in the newly signed-in account', async () => {
    const upload = deferred<void>();
    const provision = jest.fn(() => upload.promise);
    const auth = await mount({status: async () => false, provision, remove: async () => undefined});
    let saving!: Promise<void>;
    await act(async () => {
      saving = context.setSetting('apiKey', 'synthetic-key-a');
      await flush();
    });
    expect(context.credentialSyncStatus.state).toBe('syncing');
    await act(async () => { auth.switchTo(USER_B); await flush(); });
    await act(async () => {
      upload.resolve();
      await expect(saving).rejects.toMatchObject({code: 'account_changed'});
      await flush();
    });
    expect(context.credentialSyncStatus).toEqual({state: 'idle', pending: false});
    expect(context.settings.apiKey).toBe('');
    expect(provision).toHaveBeenCalledWith('synthetic-key-a', USER_A);
    expect(await Keychain.getGenericPassword({service: service(USER_B)})).toBe(false);
    expect(await AsyncStorage.getItem(intentKey(USER_B))).toBeNull();
  });

  it('clears a confirmed intent before deleting the staging copy and recovers interrupted cleanup', async () => {
    const provision = jest.fn(async () => undefined);
    const status = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    await mount({status, provision, remove: async () => undefined});
    const originalReset = Keychain.resetGenericPassword;
    let clearedIntent: string | null | undefined;
    jest.spyOn(Keychain, 'resetGenericPassword').mockImplementationOnce(async options => {
      if (options?.service === service(USER_A)) {
        clearedIntent = await AsyncStorage.getItem(intentKey(USER_A));
        throw failure('network');
      }
      return originalReset(options);
    });
    await act(async () => { await context.setSetting('apiKey', 'synthetic-key-a').catch(() => undefined); });
    expect(clearedIntent).toBeNull();
    expect(context.credentialSyncStatus).toMatchObject({state: 'error', pending: false});
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toMatchObject({password: 'synthetic-key-a'});
    await act(async () => { await context.retryCredentialSync(); });
    expect(provision).toHaveBeenCalledTimes(1);
    expect(context.credentialSyncStatus.state).toBe('configured');
    expect(await Keychain.getGenericPassword({service: service(USER_A)})).toBe(false);
  });

  it.each([
    ['network', 2],
    ['invalid_credential', 1],
  ])('retries %s on a foreground transition without repeatedly retrying rejected credentials', async (code, expectedCalls) => {
    const provision = jest.fn().mockRejectedValue(failure(String(code)));
    await mount({status: async () => false, provision, remove: async () => undefined});
    await act(async () => { await context.setSetting('apiKey', 'synthetic-key-a').catch(() => undefined); });
    await act(async () => {
      foreground?.('background');
      foreground?.('active');
      foreground?.('active');
      await flush();
    });
    expect(provision).toHaveBeenCalledTimes(Number(expectedCalls));
  });
});
