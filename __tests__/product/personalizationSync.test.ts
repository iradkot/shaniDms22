import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
  compareSyncPrecedence,
  productPersonalizationSyncStorageKey,
  recordRecentModule,
  replaceFavoriteDestinations,
  selectLayoutProfile,
  skipPersonalizationQuestionnaire,
  updateLayoutProfile,
  updateDayGraphPreferences,
  type PersonalizationSyncMutation,
  type PersonalizationSyncSectionId,
  type ProductPersonalizationKeyValueStore,
  type ProductPersonalizationRemoteAdapter,
  type ProductPersonalizationSyncScope,
  type RemotePersonalizationSnapshot,
} from 'app/product/personalization';

class MemoryStrings implements ProductPersonalizationKeyValueStore {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const remoteKey = (
  scope: ProductPersonalizationSyncScope,
  section: PersonalizationSyncSectionId,
) =>
  section === 'workspace'
    ? `${scope.productUserId}:${scope.workspaceId}:${section}`
    : `${scope.productUserId}:${section}`;

class MemoryRemote implements ProductPersonalizationRemoteAdapter {
  readonly documents = new Map<string, RemotePersonalizationSnapshot>();
  readonly fetches = new Map<PersonalizationSyncSectionId, number>();
  offline = false;

  async fetch(
    scope: ProductPersonalizationSyncScope,
    section: PersonalizationSyncSectionId,
  ): Promise<RemotePersonalizationSnapshot | undefined> {
    this.fetches.set(section, (this.fetches.get(section) ?? 0) + 1);
    if (this.offline) {
      throw new Error('offline');
    }
    return this.documents.get(remoteKey(scope, section));
  }

  async commit(
    scope: ProductPersonalizationSyncScope,
    mutation: PersonalizationSyncMutation,
  ): Promise<RemotePersonalizationSnapshot> {
    if (this.offline) {
      throw new Error('offline');
    }
    const key = remoteKey(scope, mutation.section);
    const current = this.documents.get(key);
    if (current && compareSyncPrecedence(mutation, current) <= 0) {
      return current;
    }
    const committed: RemotePersonalizationSnapshot = {
      ...mutation,
      revision: (current?.revision ?? 0) + 1,
    };
    this.documents.set(key, committed);
    return committed;
  }
}

const scope = (
  layout: ProductPersonalizationSyncScope['layout'] = 'phone',
): ProductPersonalizationSyncScope => ({
  productUserId: 'owner-1',
  workspaceId: 'workspace-1',
  nightscoutSourceId: 'nightscout-1',
  layout,
});

const createRepository = (
  storage: MemoryStrings,
  remote: ProductPersonalizationRemoteAdapter,
  input: {readonly now: number; readonly prefix: string},
) => {
  let sequence = 0;
  return new OfflineFirstProductPersonalizationRepository({
    localStore: new KeyValueProductPersonalizationStore(storage),
    syncStore: new KeyValueProductPersonalizationSyncStore(storage),
    remote,
    clock: {now: () => input.now},
    mutationIds: {next: () => `${input.prefix}_${++sequence}`},
  });
};

describe('offline-first Product Personalization synchronization', () => {
  it('queues chart preferences offline and syncs each form factor independently after reconnecting', async () => {
    const remote = new MemoryRemote();
    remote.offline = true;
    const storage = new MemoryStrings();
    const phone = createRepository(storage, remote, {now: 10, prefix: 'phone'});
    const initial = await phone.open(scope());
    const dayGraph = {schemaVersion: 1, mode: 'mixed', windowHours: 6} as const;
    await phone.save(
      scope(),
      initial,
      updateDayGraphPreferences(initial, 'phone', dayGraph),
    );
    expect(
      selectLayoutProfile(await phone.open(scope()), 'phone').dayGraph,
    ).toEqual(dayGraph);
    expect((await phone.synchronize(scope())).pendingCount).toBe(1);
    remote.offline = false;
    expect((await phone.synchronize(scope())).pendingCount).toBe(0);
    const tablet = createRepository(new MemoryStrings(), remote, {
      now: 20,
      prefix: 'tablet',
    });
    const pulled = await tablet.synchronize(scope('tablet'));
    expect(selectLayoutProfile(pulled.preferences, 'phone').dayGraph).toEqual(
      dayGraph,
    );
    expect(
      selectLayoutProfile(pulled.preferences, 'tablet').dayGraph,
    ).toBeUndefined();
  });
  it('keys user-wide scopes separately from source-bound Workspace state', () => {
    const first = scope('phone');
    const otherWorkspace = {
      ...scope('tablet'),
      workspaceId: 'workspace-2',
      nightscoutSourceId: 'nightscout-2',
    };

    expect(productPersonalizationSyncStorageKey(first, 'account')).toBe(
      productPersonalizationSyncStorageKey(otherWorkspace, 'account'),
    );
    expect(productPersonalizationSyncStorageKey(first, 'workspace')).not.toBe(
      productPersonalizationSyncStorageKey(otherWorkspace, 'workspace'),
    );
    expect(
      productPersonalizationSyncStorageKey(first, 'layout:phone'),
    ).not.toBe(productPersonalizationSyncStorageKey(first, 'layout:tablet'));
  });

  it('bounds the durable outbox to one latest snapshot per sync section', async () => {
    const storage = new MemoryStrings();
    const remote = new MemoryRemote();
    const repository = createRepository(storage, remote, {
      now: 10,
      prefix: 'device_a',
    });
    const initial = await repository.open(scope());
    let changed = replaceFavoriteDestinations(initial, []);
    changed = skipPersonalizationQuestionnaire(changed);
    for (const profile of changed.layout.profiles) {
      changed = updateLayoutProfile(changed, {
        ...profile,
        showCurrentSnapshot: true,
      });
    }

    await repository.save(scope(), initial, changed);
    const syncStore = new KeyValueProductPersonalizationSyncStore(storage);

    expect(await syncStore.countPending(scope())).toBe(5);
  });

  it('keeps device recents local and out of every remote document', async () => {
    const remote = new MemoryRemote();
    const repository = createRepository(new MemoryStrings(), remote, {
      now: 10,
      prefix: 'device_a',
    });
    const initial = await repository.open(scope());
    const withRecent = recordRecentModule(
      initial,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.trends),
      10,
    );

    await repository.save(scope(), initial, withRecent);
    const result = await repository.synchronize(scope());

    expect(result.preferences.device.recentModules).toHaveLength(1);
    expect(result.pendingCount).toBe(0);
    expect(remote.documents.size).toBe(0);
  });

  it('keeps a pending local save visible when the remote is stale or offline', async () => {
    const remote = new MemoryRemote();
    const firstStorage = new MemoryStrings();
    const first = createRepository(firstStorage, remote, {
      now: 10,
      prefix: 'device_a',
    });
    const initial = await first.open(scope());
    const oldPhone = updateLayoutProfile(initial, {
      ...selectLayoutProfile(initial, 'phone'),
      showCurrentSnapshot: true,
    });
    await first.save(scope(), initial, oldPhone);
    await first.synchronize(scope());

    const second = createRepository(new MemoryStrings(), remote, {
      now: 20,
      prefix: 'device_b',
    });
    const pulled = await second.synchronize(scope());
    const newerLocal = updateLayoutProfile(pulled.preferences, {
      ...selectLayoutProfile(pulled.preferences, 'phone'),
      showCurrentSnapshot: false,
      showRecents: false,
    });
    await second.save(scope(), pulled.preferences, newerLocal);
    const phoneFetchesBeforePendingSync =
      remote.fetches.get('layout:phone') ?? 0;
    remote.offline = true;

    const failed = await second.synchronize(scope());

    expect(selectLayoutProfile(failed.preferences, 'phone')).toMatchObject({
      showCurrentSnapshot: false,
      showRecents: false,
    });
    expect(failed.pendingCount).toBe(1);
    expect(failed.failedSections).toContain('layout:phone');
    expect(remote.fetches.get('layout:phone')).toBe(
      phoneFetchesBeforePendingSync,
    );
  });

  it('syncs phone and tablet profiles independently across devices', async () => {
    const remote = new MemoryRemote();
    const phone = createRepository(new MemoryStrings(), remote, {
      now: 10,
      prefix: 'phone',
    });
    const tablet = createRepository(new MemoryStrings(), remote, {
      now: 11,
      prefix: 'tablet',
    });
    const stalePhone = await phone.open(scope('phone'));
    const staleTablet = await tablet.open(scope('tablet'));

    await phone.save(
      scope('phone'),
      stalePhone,
      updateLayoutProfile(stalePhone, {
        ...selectLayoutProfile(stalePhone, 'phone'),
        showCurrentSnapshot: true,
      }),
    );
    await phone.synchronize(scope('phone'));
    await tablet.save(
      scope('tablet'),
      staleTablet,
      updateLayoutProfile(staleTablet, {
        ...selectLayoutProfile(staleTablet, 'tablet'),
        showGri: true,
      }),
    );
    await tablet.synchronize(scope('tablet'));

    const third = createRepository(new MemoryStrings(), remote, {
      now: 12,
      prefix: 'third',
    });
    const synchronized = await third.synchronize(scope('phone'));

    expect(
      selectLayoutProfile(synchronized.preferences, 'phone')
        .showCurrentSnapshot,
    ).toBe(true);
    expect(
      selectLayoutProfile(synchronized.preferences, 'tablet').showGri,
    ).toBe(true);
    expect(remote.documents.has('owner-1:layout:phone')).toBe(true);
    expect(remote.documents.has('owner-1:layout:tablet')).toBe(true);
  });

  it('recovers every section of an interrupted questionnaire save as one batch', async () => {
    class FailOnceStrings extends MemoryStrings {
      failKey: string | undefined;

      override async setItem(key: string, value: string): Promise<void> {
        if (key === this.failKey) {
          this.failKey = undefined;
          throw new Error('simulated interrupted batch');
        }
        await super.setItem(key, value);
      }
    }
    const storage = new FailOnceStrings();
    const remote = new MemoryRemote();
    const repository = createRepository(storage, remote, {
      now: 20,
      prefix: 'device_a',
    });
    const initial = await repository.open(scope());
    let desired = replaceFavoriteDestinations(initial, []);
    desired = skipPersonalizationQuestionnaire(desired);
    desired = updateLayoutProfile(desired, {
      ...selectLayoutProfile(desired, 'phone'),
      showCurrentSnapshot: true,
    });
    storage.failKey = productPersonalizationSyncStorageKey(
      scope(),
      'workspace',
    );

    await expect(repository.save(scope(), initial, desired)).rejects.toThrow(
      'simulated interrupted batch',
    );

    const reopened = await createRepository(storage, remote, {
      now: 21,
      prefix: 'device_b',
    }).open(scope());
    expect(reopened.account.favorites).toEqual([]);
    expect(reopened.workspace.questionnaire.status).toBe('skipped');
    expect(selectLayoutProfile(reopened, 'phone').showCurrentSnapshot).toBe(
      true,
    );
  });

  it('serializes overlapping saves so the later Product User choice wins', async () => {
    const repository = createRepository(
      new MemoryStrings(),
      new MemoryRemote(),
      {
        now: 30,
        prefix: 'device_a',
      },
    );
    const initial = await repository.open(scope());
    const first = replaceFavoriteDestinations(initial, [
      createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
    ]);
    const second = replaceFavoriteDestinations(initial, [
      createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
    ]);

    await Promise.all([
      repository.save(scope(), initial, first),
      repository.save(scope(), initial, second),
    ]);

    expect((await repository.open(scope())).account.favorites).toEqual(
      second.account.favorites,
    );
  });

  it('uses save time and mutation ID as a deterministic tie-break', () => {
    expect(
      compareSyncPrecedence(
        {savedAt: 20, mutationId: 'a'},
        {savedAt: 10, mutationId: 'z'},
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSyncPrecedence(
        {savedAt: 20, mutationId: 'z'},
        {savedAt: 20, mutationId: 'a'},
      ),
    ).toBeGreaterThan(0);
  });
});
