import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';

import {
  GlucoseSettingsProvider,
  useGlucoseSettings,
} from 'app/contexts/GlucoseSettingsContext';
import {
  ProactiveCareSettingsProvider,
  useProactiveCareSettings,
} from 'app/contexts/ProactiveCareSettingsContext';
import type {NightscoutVaultAuthSession} from 'app/services/backend/nightscoutVaultSynchronizer';

class MutableAuthSession implements NightscoutVaultAuthSession {
  private readonly listeners = new Set<(userId: string | null) => void>();

  constructor(private userId: string | null) {}

  getCurrentUserId = (): string | null => this.userId;

  subscribe = (listener: (userId: string | null) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  switchTo(userId: string | null): void {
    this.userId = userId;
    this.listeners.forEach(listener => listener(userId));
  }
}

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('account-scoped native settings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('isolates glucose thresholds and clears the previous account before loading', async () => {
    const auth = new MutableAuthSession('account-a');
    let context: ReturnType<typeof useGlucoseSettings> | undefined;
    const renderedHypoValues: number[] = [];
    const Consumer = () => {
      context = useGlucoseSettings();
      renderedHypoValues.push(context.settings.hypo);
      return null;
    };

    await act(async () => {
      renderer.create(
        <GlucoseSettingsProvider authSession={auth}>
          <Consumer />
        </GlucoseSettingsProvider>,
      );
    });
    const defaultHypo = context?.settings.hypo;
    expect(defaultHypo).toBeDefined();

    act(() => context?.setSetting('hypo', 75));
    await act(flushPersistence);
    expect(context?.settings.hypo).toBe(75);

    await act(async () => {
      auth.switchTo('account-b');
      await flushPersistence();
    });
    expect(context?.settings.hypo).toBe(defaultHypo);
    expect(renderedHypoValues).toContain(defaultHypo as number);

    act(() => context?.setSetting('hypo', 80));
    await act(flushPersistence);
    await act(async () => {
      auth.switchTo('account-a');
      await flushPersistence();
    });
    expect(context?.settings.hypo).toBe(75);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'glucose.settings.v1:account-a',
        'glucose.settings.v1:account-b',
      ]),
    );
  });

  it('isolates proactive-care and medical alert preferences per account', async () => {
    const auth = new MutableAuthSession('account-a');
    let context: ReturnType<typeof useProactiveCareSettings> | undefined;
    const Consumer = () => {
      context = useProactiveCareSettings();
      return null;
    };

    await act(async () => {
      renderer.create(
        <ProactiveCareSettingsProvider authSession={auth}>
          <Consumer />
        </ProactiveCareSettingsProvider>,
      );
    });
    act(() =>
      context?.setSetting('events', {
        ...context.settings.events,
        hypoNow: false,
      }),
    );
    await act(flushPersistence);

    await act(async () => {
      auth.switchTo('account-b');
      await flushPersistence();
    });
    expect(context?.settings.events.hypoNow).toBe(true);
    act(() => context?.setSetting('enabled', false));
    await act(flushPersistence);

    await act(async () => {
      auth.switchTo('account-a');
      await flushPersistence();
    });
    expect(context?.settings.enabled).toBe(true);
    expect(context?.settings.events.hypoNow).toBe(false);
  });

  it('does not expose an ownerless legacy value to an authenticated account', async () => {
    await AsyncStorage.setItem(
      'proactive.care.settings.v1',
      JSON.stringify({enabled: false}),
    );
    const auth = new MutableAuthSession('account-a');
    let context: ReturnType<typeof useProactiveCareSettings> | undefined;
    const Consumer = () => {
      context = useProactiveCareSettings();
      return null;
    };

    await act(async () => {
      renderer.create(
        <ProactiveCareSettingsProvider authSession={auth}>
          <Consumer />
        </ProactiveCareSettingsProvider>,
      );
    });

    expect(context?.settings.enabled).toBe(true);
    expect(await AsyncStorage.getItem('proactive.care.settings.v1')).toBeTruthy();
  });
});
