import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AxiosError, type AxiosAdapter} from 'axios';
import {fetchLatestBgEntry} from 'app/api/apiRequests';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {useNativeRecommendationPorts} from 'app/platform/native/ai/useNativeRecommendationPorts';
import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';
import {nativeCurrentDataSource} from 'app/services/currentData/nativeCurrentDataSource';

jest.mock('app/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({
    settings: {enabled: true, openAiModel: 'fixture-model'},
  }),
}));
jest.mock('app/services/llm/llmClient', () => ({createLlmProvider: jest.fn()}));

const nowMs = Date.UTC(2026, 8, 29, 10);
const sampleMs = nowMs - 4 * 60_000;
// Latest records can have a valid numeric date without the optional dateString
// indexed by the historical query. This reproduces the reported 4/243 minute gap.
const glucose = {date: sampleMs, sgv: 123};
const oldGlucose = {
  date: nowMs - 243 * 60_000,
  sgv: 181,
  dateString: new Date(nowMs - 243 * 60_000).toISOString(),
};
const deviceStatus = {
  created_at: new Date(sampleMs).toISOString(),
  loop: {
    iob: {iob: 1.2, timestamp: new Date(sampleMs).toISOString()},
    cob: {cob: 18, timestamp: new Date(sampleMs - 60_000).toISOString()},
  },
};
const scope = {
  productUserId: 'current-fixture-owner',
  workspaceId: 'current-fixture-workspace',
} as AiWorkspaceScope;

describe('current AI evidence agrees with the available latest source independently of history', () => {
  const originalAdapter = nightscoutInstance.defaults.adapter;
  let tree: TestRenderer.ReactTestRenderer;
  let ports: ReturnType<typeof useNativeRecommendationPorts>;
  let historyFails: boolean;
  let deviceFails: boolean;
  let glucoseFails: boolean;
  let historyOld: boolean;
  let historyGate: Promise<void> | undefined;
  const Harness = () => {
    ports = useNativeRecommendationPorts(scope, 'en');
    return null;
  };

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await AsyncStorage.clear();
    clearNightscoutInstance();
    configureNightscoutInstance({
      baseUrl: 'https://current-fixture.example',
      ownerUserId: 'current-fixture-owner',
      apiSecretSha1: 'a'.repeat(40),
    });
    historyFails = true;
    deviceFails = false;
    glucoseFails = false;
    historyOld = false;
    historyGate = undefined;
    const transport: AxiosAdapter = async request => {
      const url = new URL(request.url!, request.baseURL);
      const isRange = [...url.searchParams.keys()].some(key =>
        key.startsWith('find['),
      );
      if (isRange && historyGate) {
        await historyGate;
      }
      if (
        (historyFails && isRange) ||
        (deviceFails && url.pathname.includes('devicestatus')) ||
        (glucoseFails && url.pathname.includes('entries'))
      ) {
        throw new AxiosError(
          'Fixture history unavailable',
          'ERR_BAD_RESPONSE',
          request,
          null,
          {
            status: 503,
            statusText: 'Unavailable',
            data: {},
            headers: {},
            config: request,
          },
        );
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
        data: url.pathname.includes('entries')
          ? [isRange && historyOld ? oldGlucose : glucose]
          : url.pathname.includes('devicestatus')
          ? [deviceStatus]
          : [],
      };
    };
    nightscoutInstance.defaults.adapter = transport;
    act(() => {
      tree = TestRenderer.create(<Harness />);
    });
  });
  afterEach(() => {
    act(() => tree.unmount());
    nightscoutInstance.defaults.adapter = originalAdapter;
    clearNightscoutInstance();
    jest.restoreAllMocks();
  });

  const evidence = async () => {
    const loaded = await ports.loadEvidence(
      {locale: 'en', request: {kind: 'now'}},
      new AbortController().signal,
    );
    const text = typeof loaded === 'string' ? loaded : loaded.text;
    if (typeof loaded !== 'string') {
      expect(loaded.currentFactsExpireAtMs).toBeGreaterThan(nowMs);
    }
    return JSON.parse(text.slice(text.indexOf('\n') + 1));
  };

  it('keeps the current glucose available when historical reads fail', async () => {
    // Same latest endpoint family used by the widget. Real native transport,
    // decoder, AI ports and evidence serializer; only HTTP is synthetic.
    expect(await fetchLatestBgEntry()).toMatchObject({
      sgv: 123,
      date: sampleMs,
    });
    const actual = await evidence();
    expect(actual.currentSnapshot).toMatchObject({
      fresh: true,
      latest: {mgdl: 123, tMs: sampleMs},
    });
    expect(actual.glucose.available).toBe(false);
  });

  it('retains independently timestamped IOB and COB instead of always declaring them unknown', async () => {
    historyFails = false;
    const actual = await evidence();
    expect(actual.currentDeviceStatus).toMatchObject({
      available: true,
      iobU: 1.2,
      cobG: 18,
    });
    expect(actual.currentDeviceStatus.iob).toMatchObject({
      sourceTimestampMs: sampleMs,
      ageMs: 4 * 60_000,
    });
    expect(actual.currentDeviceStatus.cob).toMatchObject({
      sourceTimestampMs: sampleMs - 60_000,
      ageMs: 5 * 60_000,
    });
  });

  it('uses the four-minute latest reading when the historical query only sees a 243-minute reading', async () => {
    historyFails = false;
    historyOld = true;
    const actual = await evidence();
    expect(actual.currentSnapshot).toMatchObject({
      fresh: true,
      latest: {mgdl: 123, tMs: sampleMs},
      ageMinutes: 4,
    });
    expect(actual.glucose).toMatchObject({available: true, sampleCount: 1});
  });

  it('keeps current glucose when the independent device status request fails', async () => {
    deviceFails = true;
    const actual = await evidence();
    expect(actual.currentSnapshot.fresh).toBe(true);
    expect(actual.currentDeviceStatus).toMatchObject({
      available: false,
      iobU: null,
      cobG: null,
    });
  });

  it('rejects an old snapshot if the source changes away and back while history is still loading', async () => {
    let releaseHistory!: () => void;
    historyGate = new Promise(resolve => {
      releaseHistory = resolve;
    });
    const pending = evidence();
    // Ensure the latest read finished before changing the source. The final
    // evidence boundary must still reject it when the slower history returns.
    expect((await nativeCurrentDataSource.loadCurrent()).glucose.status).toBe(
      'fresh',
    );
    act(() => {
      configureNightscoutInstance({
        baseUrl: 'https://other-fixture.example',
        ownerUserId: 'other-owner',
      });
      configureNightscoutInstance({
        baseUrl: 'https://current-fixture.example',
        ownerUserId: 'current-fixture-owner',
        apiSecretSha1: 'a'.repeat(40),
      });
    });
    releaseHistory();
    await expect(pending).rejects.toThrow('source changed');
  });

  it('keeps independently verified IOB and COB when glucose is unavailable', async () => {
    glucoseFails = true;
    const actual = await evidence();
    expect(actual.currentSnapshot).toMatchObject({fresh: false, latest: null});
    expect(actual.currentDeviceStatus).toMatchObject({
      available: true,
      iobU: 1.2,
      cobG: 18,
    });
  });
});
