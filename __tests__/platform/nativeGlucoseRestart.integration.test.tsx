import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, {AxiosError, type AxiosAdapter} from 'axios';
import renderer, {act} from 'react-test-renderer';

import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  NightscoutConfigProvider,
  type NightscoutConfigContextValue,
  useNightscoutConfig,
} from 'app/contexts/NightscoutConfigContext';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {createNativeDailyOverviewDataSource} from 'app/platform/native/product/nativeDailyOverviewDataSource';
import {createNativeDayGraphDataSource} from 'app/platform/native/product/nativeDayGraphDataSource';
import type {NightscoutVaultSynchronizer} from 'app/services/backend/nightscoutVaultSynchronizer';
import {persistNightscoutProfiles} from 'app/services/nightscoutProfiles';

const authSession = {
  getCurrentUserId: () => 'restart-test-user',
  subscribe: () => () => {},
};
const vaultSynchronizer: NightscoutVaultSynchronizer = {
  getSnapshot: () => ({state: 'idle', pending: false}),
  subscribe: () => () => {},
  requestReconciliation: async () => {},
  retryPending: async () => {},
  activate: () => () => {},
};
const apiSecretSha1 = 'a'.repeat(40);
const timestampMs = Date.UTC(2026, 8, 5, 12);
const glucoseRecord = {
  _id: 'entry-1',
  date: timestampMs,
  dateString: new Date(timestampMs).toISOString(),
  sgv: 123,
  direction: 'Flat',
};
const period = {startMs: timestampMs - 300_000, endMs: timestampMs + 300_000};

describe('native glucose after restoring a saved Nightscout source', () => {
  const previousAdapter = nightscoutInstance.defaults.adapter;
  const previousDefaultAdapter = axios.defaults.adapter;
  let tree: renderer.ReactTestRenderer | undefined;
  let config: NightscoutConfigContextValue | undefined;
  let latest: ReturnType<typeof useLatestNightscoutSnapshot> | undefined;
  let httpRequestCount = 0;

  const Consumer = () => {
    config = useNightscoutConfig();
    latest = useLatestNightscoutSnapshot({pollingEnabled: false});
    return null;
  };

  const mountProvider = async () => {
    await act(async () => {
      tree = renderer.create(
        <NightscoutConfigProvider
          authSession={authSession}
          vaultSynchronizer={vaultSynchronizer}>
          <Consumer />
        </NightscoutConfigProvider>,
      );
    });
  };

  beforeEach(async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.clear();
    clearNightscoutInstance();
    config = undefined;
    latest = undefined;
    httpRequestCount = 0;
    await persistNightscoutProfiles(
      [
        {
          id: 'saved-source',
          label: 'Saved source',
          baseUrl: 'https://nightscout.example',
          apiSecretSha1,
          createdAt: 1,
        },
      ],
      'saved-source',
      authSession.getCurrentUserId(),
    );

    // Keep the provider, credential restore, request client, API decoders and
    // product adapters real. Only the HTTP boundary is replaced. This models a
    // protected source's actual API v1 secret extraction contract:
    // https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/authorization/index.js
    const transport: AxiosAdapter = async request => {
      httpRequestCount += 1;
      if (request.baseURL !== 'https://nightscout.example') {
        throw new AxiosError('Unknown fixture source', 'ERR_NETWORK', request);
      }
      const suppliedSecret =
        request.params?.secret ?? request.headers.get('api-secret');
      if (suppliedSecret !== apiSecretSha1) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', request, null, {
          data: {status: 401},
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: request,
        });
      }
      return {
        data: request.url?.startsWith('/api/v1/entries') ? [glucoseRecord] : [],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      };
    };
    nightscoutInstance.defaults.adapter = transport;
    axios.defaults.adapter = transport;
    await mountProvider();
    expect(config?.isLoaded).toBe(true);
    expect(config?.activeProfile?.id).toBe('saved-source');
  });

  afterEach(async () => {
    await act(async () => tree?.unmount());
    tree = undefined;
    clearNightscoutInstance();
    nightscoutInstance.defaults.adapter = previousAdapter;
    axios.defaults.adapter = previousDefaultAdapter;
    jest.restoreAllMocks();
  });

  it('shows the current glucose snapshot after restart', () => {
    expect(latest?.snapshot?.bg.sgv).toBe(123);
  });

  it('restores old-APK glucose through explicit saved-source recovery and keeps it after restart', async () => {
    await act(async () => tree?.unmount());
    tree = undefined;
    clearNightscoutInstance();
    await AsyncStorage.clear();
    const legacyProfile = {
      id: 'legacy-source',
      label: 'Source from old APK',
      baseUrl: 'https://nightscout.example',
      apiSecretSha1,
      createdAt: 1,
    };
    // Old APKs saved an unscoped v1 source and no account-ownership marker.
    await AsyncStorage.multiSet([
      ['nightscout.profiles.v1', JSON.stringify([legacyProfile])],
      ['nightscout.activeProfileId.v1', legacyProfile.id],
    ]);
    httpRequestCount = 0;

    await mountProvider();
    expect(config?.isLoaded).toBe(true);
    expect(config?.profiles).toEqual([]);
    expect(config?.activeProfile).toBeNull();
    expect(config?.pendingLegacyProfileCount).toBe(1);
    expect(latest?.snapshot).toBeNull();
    expect(httpRequestCount).toBe(0);

    // Exercise the same explicit callback exposed by Settings: real recovery,
    // real connection verification, real API client and real glucose adapters.
    await act(async () => {
      await config?.recoverLegacyProfiles();
    });
    expect(config?.pendingLegacyProfileCount).toBe(0);
    expect(config?.activeProfile?.id).toBe(legacyProfile.id);
    expect(latest?.snapshot?.bg.sgv).toBe(123);
    await expect(
      createNativeDayGraphDataSource({useE2EFixtures: false}).loadDayGraph({
        dayStartMs: period.startMs,
        dayEndMs: period.endMs,
      }),
    ).resolves.toMatchObject({glucoseSamples: [{timestampMs, valueMgDl: 123}]});
    await expect(
      createNativeDailyOverviewDataSource({
        useE2EFixtures: false,
      }).loadDailyOverview(period),
    ).resolves.toMatchObject({glucoseSamples: [{timestampMs, valueMgDl: 123}]});

    await act(async () => tree?.unmount());
    tree = undefined;
    clearNightscoutInstance();
    await mountProvider();
    expect(config?.pendingLegacyProfileCount).toBe(0);
    expect(config?.activeProfile?.id).toBe(legacyProfile.id);
    expect(latest?.snapshot?.bg.sgv).toBe(123);
  });

  it('retries the same source immediately after its saved credential is corrected', async () => {
    const profile = {
      baseUrl: 'https://nightscout.example',
      ownerUserId: authSession.getCurrentUserId(),
    };
    await act(async () => {
      configureNightscoutInstance({...profile, apiSecretSha1: 'b'.repeat(40)});
      await latest?.refresh();
    });
    expect(latest?.snapshot).toBeNull();

    await act(async () => {
      configureNightscoutInstance({...profile, apiSecretSha1});
    });
    expect(latest?.snapshot?.bg.sgv).toBe(123);
  });

  it('loads glucose in Day Graph using its default native request path', async () => {
    const source = createNativeDayGraphDataSource({useE2EFixtures: false});
    await expect(
      source.loadDayGraph({dayStartMs: period.startMs, dayEndMs: period.endMs}),
    ).resolves.toMatchObject({
      glucoseSamples: [{timestampMs, valueMgDl: 123}],
    });
  });

  it('loads glucose in Daily Overview using its default native request path', async () => {
    const source = createNativeDailyOverviewDataSource({useE2EFixtures: false});
    await expect(source.loadDailyOverview(period)).resolves.toMatchObject({
      glucoseSamples: [{timestampMs, valueMgDl: 123}],
    });
  });
});
