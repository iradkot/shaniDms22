import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';
import type {AxiosAdapter, AxiosResponse} from 'axios';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {nativeCurrentDataSource} from 'app/services/currentData/nativeCurrentDataSource';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const MIN = 60_000;
const glucose = {date: String(NOW - 4 * MIN), sgv: '123', direction: 'Flat'};
const load = {
  created_at: new Date(NOW - MIN).toISOString(),
  loop: {
    timestamp: new Date(NOW - MIN).toISOString(),
    iob: {iob: -0.2, timestamp: new Date(NOW - 2 * MIN).toISOString()},
    cob: {cob: 0, timestamp: new Date(NOW - 3 * MIN).toISOString()},
    predicted: {
      startDate: new Date(NOW - MIN).toISOString(),
      values: [123, 124, 125, 126],
    },
  },
};
const originalAdapter = nightscoutInstance.defaults.adapter;
let paths: string[];
let failDeviceStatus: boolean;
let tree: renderer.ReactTestRenderer | undefined;
const transport: AxiosAdapter = async request => {
  paths.push(request.url ?? '');
  if (request.url?.includes('devicestatus') && failDeviceStatus) {
    throw new Error('Fixture status outage');
  }
  if (!request.url?.includes('.json?count=')) {
    throw new Error('No history resource is available');
  }
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: request,
    data: request.url.includes('entries')
      ? [glucose]
      : [
          {created_at: new Date(NOW).toISOString(), uploader: {battery: 80}},
          load,
        ],
  };
};

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  paths = [];
  failDeviceStatus = false;
  clearNightscoutInstance();
  configureNightscoutInstance({
    baseUrl: 'https://current-fixture.example',
    ownerUserId: 'fixture-owner',
  });
  nightscoutInstance.defaults.adapter = transport;
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  clearNightscoutInstance();
  nightscoutInstance.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

it('feeds the hook and current source from the same latest transport, preserving independent load clocks and predictions', async () => {
  let hook: ReturnType<typeof useLatestNightscoutSnapshot> | undefined;
  const Harness = () => {
    hook = useLatestNightscoutSnapshot({pollingEnabled: false});
    return null;
  };
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  nightscoutInstance.defaults.adapter = async request => {
    await gate;
    return transport(request);
  };
  const current = nativeCurrentDataSource.loadCurrent();
  act(() => {
    tree = renderer.create(<Harness />);
  });
  await act(async () => {
    release();
    await current;
  });
  const data = await current;
  expect(data.glucose).toMatchObject({
    status: 'fresh',
    value: 123,
    sourceTimestampMs: NOW - 4 * MIN,
  });
  expect(data.iob).toMatchObject({
    status: 'fresh',
    value: -0.2,
    sourceTimestampMs: NOW - 2 * MIN,
  });
  expect(data.cob).toMatchObject({
    status: 'fresh',
    value: 0,
    sourceTimestampMs: NOW - 3 * MIN,
  });
  expect(hook?.snapshot?.currentData).toEqual(data);
  expect(hook?.snapshot?.configurationRevision).toEqual(expect.any(Number));
  expect(hook?.snapshot?.sourceBaseUrl).toBe('https://current-fixture.example');
  expect(data).not.toHaveProperty('sourceBaseUrl');
  expect(hook?.snapshot?.enrichedBg).toMatchObject({
    sgv: 123,
    date: NOW - 4 * MIN,
    iob: -0.2,
    cob: 0,
  });
  expect(hook?.snapshot?.predictions).toHaveLength(3);
  expect(paths.sort()).toEqual([
    '/api/v1/devicestatus.json?count=12',
    '/api/v1/entries.json?count=24',
  ]);
});

it('retains fresh glucose when device status fails without asking for treatment or profile history', async () => {
  failDeviceStatus = true;
  const data = await nativeCurrentDataSource.loadCurrent();
  expect(data.glucose.status).toBe('fresh');
  expect(data.iob).toMatchObject({
    status: 'unavailable',
    value: null,
    reason: 'read-failed',
  });
  expect(paths).toHaveLength(2);
  expect(paths.every(path => path.includes('.json?count='))).toBe(true);
});

it('refreshes on a real foreground return with polling disabled, without duplicate initial active fetches, and removes its listener', async () => {
  const initialState = AppState.currentState;
  AppState.currentState = 'active';
  let onChange: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, listener) => {
      if (event === 'change') {
        onChange = listener as (state: AppStateStatus) => void;
      }
      return {remove};
    });
  try {
    const Harness = () => {
      useLatestNightscoutSnapshot({pollingEnabled: false});
      return null;
    };
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    expect(paths).toHaveLength(2);
    await act(async () => {
      onChange?.('active');
    });
    expect(paths).toHaveLength(2);
    await act(async () => {
      onChange?.('background');
      onChange?.('active');
    });
    expect(paths).toHaveLength(4);
    await act(async () => {
      onChange?.('active');
    });
    expect(paths).toHaveLength(4);
    act(() => tree?.unmount());
    tree = undefined;
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => {
      onChange?.('background');
      onChange?.('active');
    });
    expect(paths).toHaveLength(4);
  } finally {
    AppState.currentState = initialState;
  }
});

it('rejects a real transport response from before an A to B to A configuration change', async () => {
  let release!: (response: AxiosResponse) => void;
  nightscoutInstance.defaults.adapter = async request =>
    request.url?.includes('entries')
      ? new Promise(resolve => {
          release = resolve;
        })
      : transport(request);
  const pending = nativeCurrentDataSource.loadCurrent();
  await Promise.resolve();
  await Promise.resolve();
  configureNightscoutInstance({
    baseUrl: 'https://other-fixture.example',
    ownerUserId: 'fixture-owner',
  });
  configureNightscoutInstance({
    baseUrl: 'https://current-fixture.example',
    ownerUserId: 'fixture-owner',
  });
  release({
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
    data: [glucose],
  });
  await expect(pending).rejects.toThrow('source changed');
});
