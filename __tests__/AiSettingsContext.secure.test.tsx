import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import renderer, {act} from 'react-test-renderer';
import {
  AiSettingsProvider,
  useAiSettings,
} from '../src/contexts/AiSettingsContext';

const signedOutAuth = {
  getCurrentUserId: () => null,
  subscribe: () => () => {},
};

const ACCOUNT_CREDENTIAL_SERVICE =
  'shani.ai.openai.v2.signed-out-local';

describe('AiSettingsContext secure credential persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await Keychain.resetGenericPassword({service: 'shani.ai.openai'});
    await Keychain.resetGenericPassword({service: ACCOUNT_CREDENTIAL_SERVICE});
  });

  it('keeps the API key in Keychain/Keystore and never in AsyncStorage', async () => {
    let context: ReturnType<typeof useAiSettings> | undefined;
    const Probe = () => {
      context = useAiSettings();
      return null;
    };

    await act(async () => {
      renderer.create(
        <AiSettingsProvider authSession={signedOutAuth}>
          <Probe />
        </AiSettingsProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await context!.setSetting('apiKey', 'sk-private-value');
    });

    const storedValues = await Promise.all(
      (await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)),
    );
    expect(storedValues.join('\n')).not.toContain('sk-private-value');
    expect(
      await Keychain.getGenericPassword({service: ACCOUNT_CREDENTIAL_SERVICE}),
    ).toMatchObject({password: 'sk-private-value'});
    expect(context!.settings.apiKey).toBe('sk-private-value');
  });

  it('migrates a legacy AsyncStorage key and strips unknown fields', async () => {
    await AsyncStorage.setItem(
      'ai.settings.v1',
      JSON.stringify({
        enabled: false,
        apiKey: 'sk-legacy-private',
        personality: 'tachles',
        ignored: 'do-not-retain',
      }),
    );
    let context: ReturnType<typeof useAiSettings> | undefined;
    const Probe = () => {
      context = useAiSettings();
      return null;
    };

    await act(async () => {
      renderer.create(
        <AiSettingsProvider authSession={signedOutAuth}>
          <Probe />
        </AiSettingsProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(context!.settings).toMatchObject({
      enabled: false,
      apiKey: 'sk-legacy-private',
      personality: 'tachles',
    });
    const stored = (
      await Promise.all(
        (await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)),
      )
    ).join('\n');
    expect(stored).not.toContain('sk-legacy-private');
    expect(stored).not.toContain('do-not-retain');
    expect(
      await Keychain.getGenericPassword({service: ACCOUNT_CREDENTIAL_SERVICE}),
    ).toMatchObject({password: 'sk-legacy-private'});
  });
});
