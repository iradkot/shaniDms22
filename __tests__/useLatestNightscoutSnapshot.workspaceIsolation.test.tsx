import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';

import {
  NightscoutConfigProvider,
  type NightscoutConfigContextValue,
  useNightscoutConfig,
} from 'app/contexts/NightscoutConfigContext';
import {
  useLatestNightscoutSnapshot,
  type LatestNightscoutSnapshot,
} from 'app/hooks/useLatestNightscoutSnapshot';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import type {NightscoutVaultSynchronizer} from 'app/services/backend/nightscoutVaultSynchronizer';
import {persistNightscoutProfiles} from 'app/services/nightscoutProfiles';

const signedOutAuth = {
  getCurrentUserId: () => null,
  subscribe: () => () => {},
};
const noVaultSync: NightscoutVaultSynchronizer = {
  getSnapshot: () => ({state: 'idle', pending: false}),
  subscribe: () => () => {},
  requestReconciliation: async () => {},
  retryPending: async () => {},
  activate: () => () => {},
};

const mockFetchLatestBgEntry = jest.fn();
const mockFetchLatestDeviceStatusEntry = jest.fn();

jest.mock('app/api/apiRequests', () => ({
  fetchLatestBgEntry: (...args: unknown[]) =>
    mockFetchLatestBgEntry(...args),
  fetchLatestDeviceStatusEntry: (...args: unknown[]) =>
    mockFetchLatestDeviceStatusEntry(...args),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
};

const bg = (sgv: number, date: number) =>
  ({
    sgv,
    date,
    dateString: new Date(date).toISOString(),
    trend: 0,
    direction: 'Flat',
    device: 'test',
    type: 'sgv',
  }) as const;

describe('latest Nightscout snapshot Workspace isolation', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    clearNightscoutInstance();
    await AsyncStorage.clear();
    await persistNightscoutProfiles(
      [
        {
          id: 'alpha',
          label: 'Alpha',
          baseUrl: 'https://alpha.example',
          apiSecretSha1: 'a'.repeat(40),
          createdAt: 1,
        },
        {
          id: 'beta',
          label: 'Beta',
          baseUrl: 'https://beta.example',
          apiSecretSha1: 'b'.repeat(40),
          createdAt: 2,
        },
      ],
      'alpha',
      null,
    );
  });

  afterEach(() => {
    clearNightscoutInstance();
  });

  it('clears the previous subject immediately and ignores its late response', async () => {
    const staleAlphaBg = deferred<ReturnType<typeof bg> | null>();
    const staleAlphaDevice = deferred<null>();
    const betaBg = deferred<ReturnType<typeof bg> | null>();
    const betaDevice = deferred<null>();

    mockFetchLatestBgEntry
      .mockResolvedValueOnce(bg(111, 1000))
      .mockImplementationOnce(() => staleAlphaBg.promise)
      .mockImplementationOnce(() => betaBg.promise);
    mockFetchLatestDeviceStatusEntry
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => staleAlphaDevice.promise)
      .mockImplementationOnce(() => betaDevice.promise);

    let config: NightscoutConfigContextValue | null = null;
    let latest:
      | {
          snapshot: LatestNightscoutSnapshot | null;
          isLoading: boolean;
          error: unknown;
          refresh: () => Promise<void>;
        }
      | null = null;

    const Consumer = () => {
      config = useNightscoutConfig();
      latest = useLatestNightscoutSnapshot({pollingEnabled: false});
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NightscoutConfigProvider
          authSession={signedOutAuth}
          vaultSynchronizer={noVaultSync}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });

    expect(mockFetchLatestBgEntry).toHaveBeenCalledTimes(1);
    expect(latest?.snapshot?.bg.sgv).toBe(111);

    act(() => {
      void latest?.refresh();
    });
    expect(mockFetchLatestBgEntry).toHaveBeenCalledTimes(2);

    await act(async () => {
      await config?.setActiveProfileId('beta');
    });

    expect(latest?.snapshot).toBeNull();
    expect(mockFetchLatestBgEntry).toHaveBeenCalledTimes(3);

    await act(async () => {
      betaBg.resolve(bg(222, 2000));
      betaDevice.resolve(null);
      await betaBg.promise;
    });
    expect(latest?.snapshot?.bg.sgv).toBe(222);

    await act(async () => {
      staleAlphaBg.resolve(bg(112, 1500));
      staleAlphaDevice.resolve(null);
      await staleAlphaBg.promise;
    });
    expect(latest?.snapshot?.bg.sgv).toBe(222);

    act(() => {
      tree!.unmount();
    });
  });

  it('tracks the configured source when used above the profile provider', async () => {
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    mockFetchLatestBgEntry.mockResolvedValueOnce(bg(123, 3000));
    mockFetchLatestDeviceStatusEntry.mockResolvedValueOnce(null);

    let latest: LatestNightscoutSnapshot | null = null;
    const Consumer = () => {
      latest = useLatestNightscoutSnapshot({pollingEnabled: false}).snapshot;
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Consumer />);
    });

    expect(mockFetchLatestBgEntry).toHaveBeenCalledTimes(1);
    expect(latest?.bg.sgv).toBe(123);

    act(() => {
      tree!.unmount();
    });
  });
});
