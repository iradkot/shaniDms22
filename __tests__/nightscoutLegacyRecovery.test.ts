import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {
  countRecoverableLegacyNightscoutProfiles,
  loadNightscoutProfiles,
  persistNightscoutProfiles,
  recoverLegacyNightscoutProfiles,
} from '../src/services/nightscoutProfiles';
import {nativeSecureCredentialStore} from '../src/services/secureCredentialStore';

const quarantineKey = 'nightscout.legacyQuarantine.v1';
const legacyKey = 'nightscout.profiles.v1';
const profile = (id = 'ns_prior') => ({
  id,
  label: 'Prior connection',
  baseUrl: `https://${id}.example.com`,
  apiSecretSha1: 'a'.repeat(40),
  createdAt: 1700000000000,
});
const seedShippedQuarantine = async () => {
  const {apiSecretSha1, ...metadata} = profile();
  await AsyncStorage.setItem(
    quarantineKey,
    JSON.stringify({
      schemaVersion: 1,
      reason: 'unattributed',
      quarantinedAt: Date.now(),
      profiles: [metadata],
    }),
  );
  await nativeSecureCredentialStore.write(
    `shani.nightscout.quarantine.${sha1(metadata.id)}`,
    apiSecretSha1,
  );
};
const recover = (
  verifyConnection = jest.fn(async () => {}),
  isOwnerCurrent = () => true,
) =>
  recoverLegacyNightscoutProfiles({
    ownerUserId: 'owner-a',
    verifyConnection,
    isOwnerCurrent,
  });

describe('explicit legacy Nightscout recovery', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('keeps a pre-Hub connection hidden until explicit recovery', async () => {
    await AsyncStorage.setItem(legacyKey, JSON.stringify([profile()]));
    expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(1);
    expect((await loadNightscoutProfiles('owner-b')).profiles).toEqual([]);
    expect(await countRecoverableLegacyNightscoutProfiles(null)).toBe(0);
  });

  it('preserves all owned legacy input when the account has no remaining profile capacity', async () => {
    const existing = Array.from({length: 32}, (_, index) =>
      profile(`ns_existing_${index}`),
    );
    await persistNightscoutProfiles(existing, existing[0]!.id, 'owner-a');
    const rawLegacy = JSON.stringify([profile('ns_overflow')]);
    await AsyncStorage.setItem(legacyKey, rawLegacy);
    await AsyncStorage.setItem('nightscout.legacyOwnerUid.v1', 'owner-a');
    await AsyncStorage.setItem('nightscout.activeProfileId.v1', 'ns_overflow');
    const write = jest.spyOn(nativeSecureCredentialStore, 'write');
    const remove = jest.spyOn(nativeSecureCredentialStore, 'remove');
    expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual(
      existing,
    );
    expect(await AsyncStorage.getItem(legacyKey)).toBe(rawLegacy);
    expect(await AsyncStorage.getItem('nightscout.legacyOwnerUid.v1')).toBe(
      'owner-a',
    );
    expect(await AsyncStorage.getItem('nightscout.activeProfileId.v1')).toBe(
      'ns_overflow',
    );
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves the legacy active selection unless the account already has one (existing selection: %s)',
    async hasExistingSelection => {
      if (hasExistingSelection) {
        const current = profile('ns_current');
        await persistNightscoutProfiles([current], current.id, 'owner-a');
      }
      const second = profile('ns_second');
      await AsyncStorage.setItem(
        legacyKey,
        JSON.stringify([profile(), second]),
      );
      await AsyncStorage.setItem('nightscout.activeProfileId.v1', second.id);
      await loadNightscoutProfiles('owner-a');
      const recovered = await recover();
      expect(recovered.activeProfileId).toBe(
        hasExistingSelection ? 'ns_current' : second.id,
      );
      expect((await loadNightscoutProfiles('owner-a')).activeProfileId).toBe(
        recovered.activeProfileId,
      );
    },
  );

  it('revalidates an already-shipped quarantine, attaches only to the confirmed owner and retries idempotently', async () => {
    await seedShippedQuarantine();
    const verify = jest.fn(async () => {});
    const recovered = await recover(verify);
    expect(verify).toHaveBeenCalledWith(profile());
    expect(recovered.profiles).toEqual([profile()]);
    expect(recovered.activeProfileId).toBe(profile().id);
    expect((await loadNightscoutProfiles('owner-b')).profiles).toEqual([]);
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(0);
    expect(await recover(verify)).toEqual(recovered);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(quarantineKey)).toBeNull();
    const values = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
    expect(JSON.stringify(values)).not.toContain(profile().apiSecretSha1);
  });

  it('retains quarantine when verification fails', async () => {
    await seedShippedQuarantine();
    await expect(
      recover(
        jest.fn(async () => {
          throw new Error('Connection denied');
        }),
      ),
    ).rejects.toThrow('Connection denied');
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(1);
    expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
  });

  it('does not attribute a connection after the signed-in account changes during verification', async () => {
    await seedShippedQuarantine();
    let current = true;
    const verify = jest.fn(async () => {
      current = false;
    });
    await expect(recover(verify, () => current)).rejects.toThrow(
      'account changed',
    );
    expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
    expect((await loadNightscoutProfiles('owner-b')).profiles).toEqual([]);
    expect(await countRecoverableLegacyNightscoutProfiles('owner-b')).toBe(1);
  });

  it('preserves earlier quarantine when another legacy payload is migrated', async () => {
    await seedShippedQuarantine();
    await AsyncStorage.setItem(
      legacyKey,
      JSON.stringify([profile('ns_second')]),
    );
    await loadNightscoutProfiles('owner-a');
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(2);
    expect((await recover()).profiles.map(item => item.id)).toEqual([
      'ns_prior',
      'ns_second',
    ]);
  });

  it('keeps legacy input when the runtime cannot decode its URL', async () => {
    const savedUrl = global.URL;
    const raw = JSON.stringify([profile()]);
    await AsyncStorage.setItem(legacyKey, raw);
    global.URL = class extends savedUrl {
      get username(): string {
        throw new Error('URL.username is not implemented');
      }
    };
    try {
      expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
      expect(await AsyncStorage.getItem(legacyKey)).toBe(raw);
    } finally {
      global.URL = savedUrl;
    }
  });

  it('rejects signed-out recovery', async () => {
    await seedShippedQuarantine();
    const verifyConnection = jest.fn(async () => {});
    await expect(
      recoverLegacyNightscoutProfiles({
        ownerUserId: '',
        verifyConnection,
        isOwnerCurrent: () => true,
      }),
    ).rejects.toThrow('Sign in');
    expect(verifyConnection).not.toHaveBeenCalled();
  });

  it('does not save any connection when a later credential fails verification', async () => {
    await AsyncStorage.setItem(
      legacyKey,
      JSON.stringify([profile(), profile('ns_second')]),
    );
    await loadNightscoutProfiles('owner-a');
    const verify = jest.fn(async () => {});
    verify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Unavailable'));
    await expect(recover(verify)).rejects.toThrow('Unavailable');
    expect((await loadNightscoutProfiles('owner-a')).profiles).toEqual([]);
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(2);
  });

  it('preserves both sources when quarantined profile IDs collide', async () => {
    await seedShippedQuarantine();
    const another = {
      ...profile(),
      baseUrl: 'https://another.example.com',
      apiSecretSha1: 'b'.repeat(40),
    };
    await AsyncStorage.setItem(legacyKey, JSON.stringify([another]));
    await loadNightscoutProfiles('owner-a');
    const recovered = await recover();
    expect(recovered.profiles.map(item => item.baseUrl)).toEqual([
      profile().baseUrl,
      another.baseUrl,
    ]);
    expect(recovered.profiles.map(item => item.apiSecretSha1)).toEqual([
      profile().apiSecretSha1,
      another.apiSecretSha1,
    ]);
    expect(new Set(recovered.profiles.map(item => item.id)).size).toBe(2);
  });

  it('keeps an existing active source and avoids duplicate URLs on recovery', async () => {
    const active = profile('ns_active');
    await persistNightscoutProfiles(
      [active, {...profile(), id: 'ns_current'}],
      active.id,
      'owner-a',
    );
    await seedShippedQuarantine();
    const recovered = await recover();
    expect(recovered.profiles.map(item => item.id)).toEqual([
      active.id,
      'ns_current',
    ]);
    expect(recovered.activeProfileId).toBe(active.id);
  });

  it('preserves both raw payloads if earlier quarantine cannot be decoded', async () => {
    const damaged = '{damaged';
    const legacy = JSON.stringify([profile('ns_second')]);
    await AsyncStorage.setItem(quarantineKey, damaged);
    await AsyncStorage.setItem(legacyKey, legacy);
    await expect(loadNightscoutProfiles('owner-a')).rejects.toThrow(
      'Saved connections could not be read',
    );
    expect(await AsyncStorage.getItem(quarantineKey)).toBe(damaged);
    expect(await AsyncStorage.getItem(legacyKey)).toBe(legacy);
  });

  it('can retry cleanup without duplicating a connection already persisted', async () => {
    await seedShippedQuarantine();
    const remove = jest
      .mocked(AsyncStorage.removeItem)
      .getMockImplementation()!;
    const failedCleanup = jest
      .mocked(AsyncStorage.removeItem)
      .mockImplementation(async key => {
        if (key === quarantineKey) {
          throw new Error('Storage unavailable');
        }
        return remove(key);
      });
    try {
      await expect(recover()).rejects.toThrow('Storage unavailable');
    } finally {
      failedCleanup.mockImplementation(remove);
    }
    expect((await recover()).profiles).toHaveLength(1);
    expect(await countRecoverableLegacyNightscoutProfiles('owner-a')).toBe(0);
  });
});
