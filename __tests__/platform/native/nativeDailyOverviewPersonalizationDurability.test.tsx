import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
  recordRecentModule,
  selectLayoutProfile,
  updateDailyOverviewPreferences,
  type ProductPersonalizationKeyValueStore,
} from 'app/product/personalization';
import {createStoredDestinationTarget} from 'app/product/destinations';
import {
  useNativeProductPersonalization,
  type NativeProductPersonalizationState,
} from 'app/platform/native/personalization/useNativeProductPersonalization';

let mockRepository: OfflineFirstProductPersonalizationRepository;
jest.mock(
  'app/platform/native/personalization/nativeProductPersonalizationStore',
  () => ({
    get nativeProductPersonalizationRepository() {
      return mockRepository;
    },
  }),
);

const design = {
  schemaVersion: 1,
  rangeStyle: 'bar',
  cardOrder: ['mean', 'ranges', 'coverage', 'glucose', 'insulin'],
} as const;
const target = createStoredDestinationTarget('core.trends');
let state: NativeProductPersonalizationState;
const Probe = ({userId = 'account-a'}: {readonly userId?: string}) => {
  state = useNativeProductPersonalization({
    firebaseUserId: userId,
    nightscoutBaseUrl: `https://${userId}.example`,
    layout: 'phone',
  });
  return null;
};
const ready = () => {
  if (state.status !== 'ready') {
    throw new Error('Expected hydrated personalization');
  }
  return state;
};
const currentDesign = () =>
  selectLayoutProfile(ready().preferences, 'phone').dailyOverview;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return {promise, resolve};
};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const createRepository = (storage: ProductPersonalizationKeyValueStore) => {
  let sequence = 0;
  return new OfflineFirstProductPersonalizationRepository({
    localStore: new KeyValueProductPersonalizationStore(storage),
    syncStore: new KeyValueProductPersonalizationSyncStore(storage),
    clock: {now: () => 10},
    mutationIds: {next: () => `design_${++sequence}`},
  });
};
const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
let tree: renderer.ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => {
    tree = renderer.create(<Probe />);
    await settle();
  });
};
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

it('keeps a failed daily design out of the shared snapshot, later visits, and an offline restart', async () => {
  const storage = createStorage();
  const setItem = storage.setItem;
  let diskFull = false;
  storage.setItem = async (key, value) => {
    if (diskFull) {
      throw new Error('disk full');
    }
    await setItem(key, value);
  };
  mockRepository = createRepository(storage);
  await mount();
  diskFull = true;
  let saved!: Promise<boolean>;
  act(() => {
    saved = ready().save(
      current => updateDailyOverviewPreferences(current, 'phone', design),
      {optimistic: false},
    );
  });
  expect(currentDesign()).toBeUndefined();
  await act(async () => {
    expect(await saved).toBe(false);
  });
  expect(ready().saveError).toBeDefined();
  expect(currentDesign()).toBeUndefined();

  diskFull = false;
  await act(async () => {
    expect(
      await ready().save(current => recordRecentModule(current, target, 123)),
    ).toBe(true);
  });
  expect(currentDesign()).toBeUndefined();
  expect(ready().preferences.device.recentModules[0]?.target).toEqual(target);
  act(() => tree?.unmount());
  mockRepository = createRepository(storage);
  await mount();
  expect(currentDesign()).toBeUndefined();
  expect(ready().preferences.device.recentModules[0]?.target).toEqual(target);
});

it('does not roll back a newer queued visit when a deferred daily save fails', async () => {
  mockRepository = createRepository(createStorage());
  await mount();
  const started = deferred();
  const release = deferred();
  jest.spyOn(mockRepository, 'save').mockImplementationOnce(async () => {
    started.resolve();
    await release.promise;
    throw new Error('write failed');
  });
  let dailySave!: Promise<boolean>;
  let visitSave!: Promise<boolean>;
  await act(async () => {
    dailySave = ready().save(
      current => updateDailyOverviewPreferences(current, 'phone', design),
      {optimistic: false},
    );
    await started.promise;
  });
  act(() => {
    visitSave = ready().save(current =>
      recordRecentModule(current, target, 123),
    );
  });
  expect(ready().preferences.device.recentModules[0]?.target).toEqual(target);
  expect(currentDesign()).toBeUndefined();
  await act(async () => {
    release.resolve();
    expect(await Promise.all([dailySave, visitSave])).toEqual([false, true]);
  });
  expect(ready().preferences.device.recentModules[0]?.target).toEqual(target);
  expect(currentDesign()).toBeUndefined();
});

it('retains a confirmed earlier design if a subsequent queued deferred save fails', async () => {
  const storage = createStorage();
  mockRepository = createRepository(storage);
  await mount();
  const started = deferred();
  const release = deferred();
  const persist = mockRepository.save.bind(mockRepository);
  jest
    .spyOn(mockRepository, 'save')
    .mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      return persist(...args);
    })
    .mockRejectedValueOnce(new Error('second write failed'));
  const firstDesign = {...design, rangeStyle: 'list'} as const;
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  await act(async () => {
    first = ready().save(
      current => updateDailyOverviewPreferences(current, 'phone', firstDesign),
      {optimistic: false},
    );
    await started.promise;
  });
  act(() => {
    second = ready().save(
      current => updateDailyOverviewPreferences(current, 'phone', design),
      {optimistic: false},
    );
  });
  expect(currentDesign()).toBeUndefined();
  await act(async () => {
    release.resolve();
    expect(await Promise.all([first, second])).toEqual([true, false]);
  });
  expect(currentDesign()).toEqual(firstDesign);
  act(() => tree?.unmount());
  mockRepository = createRepository(storage);
  await mount();
  expect(currentDesign()).toEqual(firstDesign);
});

it('does not reuse a completed old save as the confirmed baseline after leaving and revisiting the same account', async () => {
  mockRepository = createRepository(createStorage());
  await mount();
  const started = deferred();
  const release = deferred();
  // Hold a successful completion past a new account session opening its own
  // confirmed snapshot. The completion must not replace that session's baseline.
  jest
    .spyOn(mockRepository, 'save')
    .mockImplementationOnce(async (_scope, _before, desired) => {
      started.resolve();
      await release.promise;
      return desired;
    })
    .mockRejectedValueOnce(new Error('new session write failed'));
  let oldSave!: Promise<boolean>;
  await act(async () => {
    oldSave = ready().save(
      current => updateDailyOverviewPreferences(current, 'phone', design),
      {optimistic: false},
    );
    await started.promise;
  });
  await act(async () => {
    tree?.update(<Probe userId="account-b" />);
    await settle();
  });
  await act(async () => {
    tree?.update(<Probe />);
    await settle();
  });
  expect(currentDesign()).toBeUndefined();
  const releaseSync = deferred();
  const synchronize = mockRepository.synchronize.bind(mockRepository);
  jest.spyOn(mockRepository, 'synchronize').mockImplementation(async scope => {
    await releaseSync.promise;
    return synchronize(scope);
  });
  await act(async () => {
    release.resolve();
    expect(await oldSave).toBe(true);
  });
  await act(async () => {
    expect(
      await ready().save(
        current =>
          updateDailyOverviewPreferences(current, 'phone', {
            ...design,
            rangeStyle: 'list',
          }),
        {optimistic: false},
      ),
    ).toBe(false);
  });
  expect(currentDesign()).toBeUndefined();
  await act(async () => {
    releaseSync.resolve();
    await settle();
  });
});
