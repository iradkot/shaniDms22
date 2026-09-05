import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  KeyValueProductPersonalizationStore,
  ProductPersonalizationKeyValueStore,
  createDefaultProductPersonalization,
  getPersonalizationLayout,
  productPersonalizationStorageKeys,
  replaceFavoriteDestinations,
  updateLayoutProfile,
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

const phoneScope = {
  productUserId: 'product_user_1',
  workspaceId: 'workspace_1',
  layout: 'phone' as const,
};

describe('KeyValue Product Personalization Store', () => {
  it('round-trips strict scoped preferences', async () => {
    const strings = new MemoryStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const value = replaceFavoriteDestinations(
      createDefaultProductPersonalization(),
      [
        createStoredDestinationTarget(
          CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
        ),
      ],
    );

    await store.write(phoneScope, value);
    const reopened = await store.read(phoneScope);

    expect(reopened).toEqual(value);
    expect(strings.values.size).toBe(5);
  });

  it('migrates an older Account snapshot to visible-by-default Modules', async () => {
    const strings = new MemoryStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const keys = productPersonalizationStorageKeys(phoneScope);
    const fallback = createDefaultProductPersonalization();
    strings.values.set(
      keys.account,
      JSON.stringify({
        schemaVersion: 1,
        favorites: fallback.account.favorites,
      }),
    );

    const migrated = await store.read(phoneScope);

    expect(migrated.account.favorites).toEqual(fallback.account.favorites);
    expect(migrated.account.hiddenModules).toEqual([]);
  });

  it('shares Account and Layout scopes but keeps Workspace and device data separate', async () => {
    const strings = new MemoryStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const initial = replaceFavoriteDestinations(
      createDefaultProductPersonalization(),
      [createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst)],
    );
    await store.write(phoneScope, initial);

    const otherWorkspace = await store.read({
      ...phoneScope,
      workspaceId: 'workspace_2',
    });

    expect(otherWorkspace.account).toEqual(initial.account);
    expect(otherWorkspace.layout).toEqual(initial.layout);
    expect(otherWorkspace.workspace.questionnaire.status).toBe('not-started');
    expect(otherWorkspace.device.recentModules).toEqual([]);
  });

  it('recovers only the corrupt scope from defaults', async () => {
    const strings = new MemoryStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const value = replaceFavoriteDestinations(
      createDefaultProductPersonalization(),
      [createStoredDestinationTarget(CORE_DESTINATION_IDS.meals)],
    );
    await store.write(phoneScope, value);
    const keys = productPersonalizationStorageKeys(phoneScope);
    strings.values.set(keys.device, '{broken json');

    const reopened = await store.read(phoneScope);

    expect(reopened.account.favorites).toEqual(value.account.favorites);
    expect(reopened.device.recentModules).toEqual([]);
  });

  it('rejects transient or medical fields before writing', async () => {
    const store = new KeyValueProductPersonalizationStore(new MemoryStrings());
    const value = createDefaultProductPersonalization();

    await expect(
      store.write(phoneScope, {
        ...value,
        account: {...value.account, glucose: 63},
      }),
    ).rejects.toThrow('Product personalization is invalid');
  });

  it('persists all form-factor profiles without mixing their arrangements', async () => {
    const strings = new MemoryStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const current = createDefaultProductPersonalization();
    const tablet = current.layout.profiles.find(
      profile => profile.layout === 'tablet',
    );
    if (!tablet) {
      throw new Error('Tablet profile missing');
    }
    const changed = updateLayoutProfile(current, {
      ...tablet,
      showCurrentSnapshot: true,
    });

    await store.write(phoneScope, changed);
    const reopened = await store.read({...phoneScope, layout: 'tablet'});

    expect(
      reopened.layout.profiles.find(profile => profile.layout === 'tablet')
        ?.showCurrentSnapshot,
    ).toBe(true);
    expect(
      reopened.layout.profiles.find(profile => profile.layout === 'phone')
        ?.showCurrentSnapshot,
    ).toBe(false);
  });

  it('recovers an interrupted multi-section write from its durable transaction', async () => {
    class FailOnceStrings extends MemoryStrings {
      failKey: string | undefined;

      override async setItem(key: string, value: string): Promise<void> {
        if (this.failKey === key) {
          this.failKey = undefined;
          throw new Error('simulated termination');
        }
        await super.setItem(key, value);
      }
    }

    const strings = new FailOnceStrings();
    const store = new KeyValueProductPersonalizationStore(strings);
    const desired = replaceFavoriteDestinations(
      createDefaultProductPersonalization(),
      [createStoredDestinationTarget(CORE_DESTINATION_IDS.meals)],
    );
    strings.failKey = productPersonalizationStorageKeys(phoneScope).workspace;

    await expect(store.write(phoneScope, desired)).rejects.toThrow(
      'simulated termination',
    );

    const recovered = await store.read(phoneScope);
    expect(recovered).toEqual(desired);
  });
});

describe('form-factor selection', () => {
  it('uses phone, tablet, and desktop thresholds predictably', () => {
    expect(getPersonalizationLayout('ios', 390)).toBe('phone');
    expect(getPersonalizationLayout('android', 900)).toBe('tablet');
    expect(getPersonalizationLayout('web', 1099)).toBe('tablet');
    expect(getPersonalizationLayout('web', 1100)).toBe('desktop');
    expect(getPersonalizationLayout('web', Number.NaN)).toBe('phone');
  });
});
