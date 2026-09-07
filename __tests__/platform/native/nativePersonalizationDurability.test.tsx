import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  DEFAULT_DAY_GRAPH_PREFERENCES,
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
  selectLayoutProfile,
  updateDayGraphPreferences,
  type PersonalizationSyncMutation,
  type ProductPersonalizationRemoteAdapter,
  type RemotePersonalizationSnapshot,
} from 'app/product/personalization';
import {useDayGraphView} from 'app/product/dayGraph/useDayGraphView';
import {useNativeProductPersonalization} from 'app/platform/native/personalization/useNativeProductPersonalization';

let mockRepository: OfflineFirstProductPersonalizationRepository;
jest.mock(
  'app/platform/native/personalization/nativeProductPersonalizationStore',
  () => ({
    get nativeProductPersonalizationRepository() {
      return mockRepository;
    },
  }),
);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
let chart: ReturnType<typeof useDayGraphView>;
const Probe = ({userId = 'account-a'}: {userId?: string | null}) => {
  const state = useNativeProductPersonalization({
    firebaseUserId: userId,
    nightscoutBaseUrl: userId ? `https://${userId}.example` : null,
    layout: 'phone',
  });
  chart = useDayGraphView(
    0,
    undefined,
    state.status !== 'ready'
      ? undefined
      : {
          scopeKey: `${userId}:phone`,
          layout: 'phone',
          hydrated: true,
          value:
            selectLayoutProfile(state.preferences, 'phone').dayGraph ??
            DEFAULT_DAY_GRAPH_PREFERENCES,
          onSave: async value => {
            if (
              !(await state.save(current =>
                updateDayGraphPreferences(current, 'phone', value),
              ))
            )
              {throw new Error('Local save failed');}
          },
        },
  );
  return null;
};

let tree: renderer.ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

it('durably saves rapid chart mode changes and reopens while the initial cloud request is still pending', async () => {
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => storageValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storageValues.set(key, value);
    },
  };
  const cloud = deferred<RemotePersonalizationSnapshot | undefined>();
  const remote: ProductPersonalizationRemoteAdapter = {
    fetch: jest.fn(() => cloud.promise),
    commit: jest.fn(async (_scope, mutation: PersonalizationSyncMutation) => ({
      ...mutation,
      revision: 1,
    })),
  };
  let sequence = 0;
  const reopenRepository = () =>
    new OfflineFirstProductPersonalizationRepository({
      localStore: new KeyValueProductPersonalizationStore(storage),
      syncStore: new KeyValueProductPersonalizationSyncStore(storage),
      remote,
      clock: {now: () => 10},
      mutationIds: {next: () => `mutation_${++sequence}`},
    });
  mockRepository = reopenRepository();
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
  expect(remote.fetch).toHaveBeenCalledTimes(1);
  act(() => {
    chart.setMode('mixed');
    chart.setMode('separate');
    chart.setMode('mixed');
  });
  await act(settle);
  expect(chart.saveStatus).toBe('idle');
  act(() => tree?.unmount());
  tree = undefined;
  mockRepository = reopenRepository();
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
  expect(chart.mode).toBe('mixed');
  await act(async () => {
    cloud.resolve(undefined);
    await settle();
  });
});

it('retries a failed local mode save against durable preferences rather than an optimistic value', async () => {
  const storageValues = new Map<string, string>();
  let diskFull = false;
  const storage = {
    getItem: async (key: string) => storageValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (diskFull) {throw new Error('disk full');}
      storageValues.set(key, value);
    },
  };
  let sequence = 0;
  const reopenRepository = () =>
    new OfflineFirstProductPersonalizationRepository({
      localStore: new KeyValueProductPersonalizationStore(storage),
      syncStore: new KeyValueProductPersonalizationSyncStore(storage),
      clock: {now: () => 10},
      mutationIds: {next: () => `mutation_${++sequence}`},
    });
  mockRepository = reopenRepository();
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
  diskFull = true;
  await act(async () => {
    chart.setMode('mixed');
    await settle();
  });
  expect(chart.saveStatus).toBe('error');
  expect(chart.mode).toBe('mixed');
  diskFull = false;
  await act(async () => {
    chart.setMode('mixed');
    await settle();
  });
  expect(chart.saveStatus).toBe('idle');
  act(() => tree?.unmount());
  tree = undefined;
  mockRepository = reopenRepository();
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
  expect(chart.mode).toBe('mixed');
});

it('finishes an already submitted local save after sign-out without applying its delayed cloud response to another account', async () => {
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => storageValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storageValues.set(key, value);
    },
  };
  const cloud = deferred<RemotePersonalizationSnapshot | undefined>();
  let firstUserId: string | undefined;
  const remote: ProductPersonalizationRemoteAdapter = {
    fetch: async scope => {
      firstUserId ??= scope.productUserId;
      return scope.productUserId === firstUserId ? cloud.promise : undefined;
    },
    commit: async (_scope, mutation) => ({...mutation, revision: 1}),
  };
  let sequence = 0;
  mockRepository = new OfflineFirstProductPersonalizationRepository({
    localStore: new KeyValueProductPersonalizationStore(storage),
    syncStore: new KeyValueProductPersonalizationSyncStore(storage),
    remote,
    clock: {now: () => 10},
    mutationIds: {next: () => `mutation_${++sequence}`},
  });
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
  act(() => {
    chart.setMode('mixed');
    tree?.update(<Probe userId={null} />);
  });
  await act(async () => {
    tree?.update(<Probe userId="account-b" />);
    await settle();
  });
  expect(chart.mode).toBe('separate');
  expect(chart.saveStatus).toBe('idle');
  await act(async () => {
    cloud.resolve(undefined);
    await settle();
  });
  expect(chart.mode).toBe('separate');
  await act(async () => {
    tree?.update(<Probe />);
    await settle();
  });
  expect(chart.mode).toBe('mixed');
});
