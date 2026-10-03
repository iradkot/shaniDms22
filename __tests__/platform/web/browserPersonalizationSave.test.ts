import {
  DEFAULT_HOME_PREFERENCES,
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
  createDefaultProductPersonalization,
  selectLayoutProfile,
  updateHomePreferences,
  type PersonalizationSynchronizationResult,
  type ProductPersonalizationSyncScope,
  type StoredProductPersonalization,
} from 'app/product/personalization';
import {queueBrowserPersonalizationSave} from '../../../web/browserPersonalizationSave';

const scope: ProductPersonalizationSyncScope = {
  productUserId: 'account-one',
  workspaceId: 'workspace-one',
  nightscoutSourceId: 'source-one',
  layout: 'phone',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

function repository() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let sequence = 0;
  return new OfflineFirstProductPersonalizationRepository({
    localStore: new KeyValueProductPersonalizationStore(storage),
    syncStore: new KeyValueProductPersonalizationSyncStore(storage),
    clock: {now: () => 10},
    mutationIds: {next: () => `browser-home-${++sequence}`},
  });
}

const synchronized = (
  preferences: StoredProductPersonalization,
): PersonalizationSynchronizationResult => ({
  preferences,
  pendingCount: 0,
  failedSections: [],
  remoteEnabled: false,
});

describe('browser personalization save boundary', () => {
  it('finishes an old account save durably without publishing into the new session', async () => {
    const durable = repository();
    const write = deferred<void>();
    const entered = deferred<void>();
    const publish = jest.fn();
    const synchronize = jest.fn(durable.synchronize.bind(durable));
    let current = true;
    const pending = queueBrowserPersonalizationSave({
      repository: {
        open: durable.open.bind(durable),
        save: async (...args) => {
          entered.resolve();
          await write.promise;
          return durable.save(...args);
        },
        synchronize,
      },
      scope,
      change: value =>
        updateHomePreferences(value, 'phone', {
          ...DEFAULT_HOME_PREFERENCES,
          glucoseWindowHours: 12,
        }),
      writeTail: {current: Promise.resolve()},
      revision: {current: 0},
      isCurrentScope: () => current,
      publish,
    });
    await entered.promise;
    expect(publish).not.toHaveBeenCalled();
    current = false;
    write.resolve();
    await pending;
    expect(publish).not.toHaveBeenCalled();
    expect(synchronize).not.toHaveBeenCalled();
    expect(
      selectLayoutProfile(await durable.open(scope), 'phone').home
        ?.glucoseWindowHours,
    ).toBe(12);
    const nextAccount = await durable.open({
      ...scope,
      productUserId: 'account-two',
    });
    expect(selectLayoutProfile(nextAccount, 'phone').home).toBeUndefined();
  });

  it('resolves local saves without waiting for cloud and ignores older same-scope results', async () => {
    const durable = repository();
    const firstSync = deferred<PersonalizationSynchronizationResult>();
    const secondSync = deferred<PersonalizationSynchronizationResult>();
    const synchronize = jest
      .fn()
      .mockImplementationOnce(() => firstSync.promise)
      .mockImplementationOnce(() => secondSync.promise);
    const publish = jest.fn();
    const input = {
      repository: {
        open: durable.open.bind(durable),
        save: durable.save.bind(durable),
        synchronize,
      },
      scope,
      writeTail: {current: Promise.resolve()},
      revision: {current: 0},
      isCurrentScope: () => true,
      publish,
    };
    await queueBrowserPersonalizationSave({
      ...input,
      change: value =>
        updateHomePreferences(value, 'phone', {
          ...DEFAULT_HOME_PREFERENCES,
          glucoseWindowHours: 12,
        }),
    });
    const first = publish.mock.calls[0]![0] as StoredProductPersonalization;
    await queueBrowserPersonalizationSave({
      ...input,
      change: value =>
        updateHomePreferences(value, 'phone', {
          ...selectLayoutProfile(value, 'phone').home!,
          glucoseWindowHours: 'full-day',
        }),
    });
    expect(publish).toHaveBeenCalledTimes(2);
    const second = publish.mock.calls[1]![0] as StoredProductPersonalization;
    expect(selectLayoutProfile(second, 'phone').home?.glucoseWindowHours).toBe(
      'full-day',
    );
    firstSync.resolve(synchronized(first));
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(2);
    secondSync.resolve(synchronized(second));
    await Promise.resolve();
    expect(publish).toHaveBeenLastCalledWith(second);
  });

  it('ignores a late sync after account, source, layout or generation changes', async () => {
    for (const nextIdentity of [
      'account-two:source-one:phone:1',
      'account-one:source-two:phone:1',
      'account-one:source-one:tablet:1',
      'account-one:source-one:phone:2',
    ]) {
      const durable = repository();
      const cloud = deferred<PersonalizationSynchronizationResult>();
      const publish = jest.fn();
      let identity = 'account-one:source-one:phone:1';
      const captured = identity;
      await queueBrowserPersonalizationSave({
        repository: {
          open: durable.open.bind(durable),
          save: durable.save.bind(durable),
          synchronize: () => cloud.promise,
        },
        scope,
        change: value =>
          updateHomePreferences(value, 'phone', DEFAULT_HOME_PREFERENCES),
        writeTail: {current: Promise.resolve()},
        revision: {current: 0},
        isCurrentScope: () => identity === captured,
        publish,
      });
      expect(publish).toHaveBeenCalledTimes(1);
      identity = nextIdentity;
      cloud.resolve(synchronized(createDefaultProductPersonalization()));
      await Promise.resolve();
      expect(publish).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a failed local write without publishing and retries against durable data', async () => {
    const durable = repository();
    const save = jest
      .fn(durable.save.bind(durable))
      .mockRejectedValueOnce(new Error('storage full'));
    const publish = jest.fn();
    const neverSync = deferred<PersonalizationSynchronizationResult>();
    const input = {
      repository: {
        open: durable.open.bind(durable),
        save,
        synchronize: () => neverSync.promise,
      },
      scope,
      writeTail: {current: Promise.resolve()},
      revision: {current: 0},
      isCurrentScope: () => true,
      publish,
    };
    await expect(
      queueBrowserPersonalizationSave({
        ...input,
        change: value =>
          updateHomePreferences(value, 'phone', {
            ...DEFAULT_HOME_PREFERENCES,
            glucoseWindowHours: 12,
          }),
      }),
    ).rejects.toThrow('storage full');
    expect(publish).not.toHaveBeenCalled();
    await queueBrowserPersonalizationSave({
      ...input,
      change: value => {
        expect(selectLayoutProfile(value, 'phone').home).toBeUndefined();
        return updateHomePreferences(value, 'phone', DEFAULT_HOME_PREFERENCES);
      },
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(
      selectLayoutProfile(await durable.open(scope), 'phone').home,
    ).toEqual(DEFAULT_HOME_PREFERENCES);
  });
});
