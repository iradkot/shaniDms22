import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';

import {NightscoutConfigProvider, useNightscoutConfig} from '../src/contexts/NightscoutConfigContext';
import type {NightscoutConfigContextValue} from '../src/contexts/NightscoutConfigContext';

const mockConfigureNightscoutInstance = jest.fn();
const mockClearNightscoutInstance = jest.fn();

jest.mock('app/api/shaniNightscoutInstances', () => {
  return {
    configureNightscoutInstance: (...args: any[]) => mockConfigureNightscoutInstance(...args),
    clearNightscoutInstance: (...args: any[]) => mockClearNightscoutInstance(...args),
  };
});

describe('NightscoutConfigContext', () => {
  beforeEach(async () => {
    mockConfigureNightscoutInstance.mockClear();
    mockClearNightscoutInstance.mockClear();
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
        <NightscoutConfigProvider>
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
      throw new Error('Nightscout context was unexpectedly null after addProfile');
    }

    expect(ctx.profiles.length).toBe(1);
    expect(ctx.activeProfile?.baseUrl).toBe('https://example.com');

    expect(mockConfigureNightscoutInstance).toHaveBeenCalledTimes(1);
    const call = mockConfigureNightscoutInstance.mock.calls[0][0];
    expect(call.baseUrl).toBe('https://example.com');
    expect(typeof call.apiSecretSha1).toBe('string');
    expect(call.apiSecretSha1).toHaveLength(40);

    // Verify it persisted.
    const stored = await AsyncStorage.getItem('nightscout.profiles.v1');
    expect(stored).toBeTruthy();
  });

  it('updates the active profile URL and keeps secret when blank', async () => {
    let ctx: NightscoutConfigContextValue | null = null;

    const Consumer = () => {
      ctx = useNightscoutConfig();
      return null;
    };

    await act(async () => {
      renderer.create(
        <NightscoutConfigProvider>
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
        <NightscoutConfigProvider>
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
});
