import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {nativeSecureCredentialStore} from '../src/services/secureCredentialStore';
import {createNightscoutCacheScope} from '../src/services/nightscoutCacheScope';
import {
  createNightscoutProfile,
  hasAnyNightscoutProfile,
  loadNightscoutProfiles,
  normalizeNightscoutApiSecretToSha1,
  normalizeNightscoutUrl,
  persistNightscoutProfiles,
  prepareAccountNightscoutDeletionCacheSources,
  purgeAccountNightscoutCredentials,
} from '../src/services/nightscoutProfiles';

describe('nightscoutProfiles', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('keeps raw access tokens in secure storage and separates them by account', async () => {
    const profile = createNightscoutProfile({
      baseUrl: 'https://ns.example',
      accessToken: 'shani-0123456789abcdef',
    });
    await persistNightscoutProfiles([profile], profile.id, 'purged-account-a');
    expect(
      (await loadNightscoutProfiles('purged-account-a')).profiles[0],
    ).toEqual(profile);
    expect((await loadNightscoutProfiles('account-b')).profiles).toEqual([]);
    const plainValues = await AsyncStorage.multiGet(
      await AsyncStorage.getAllKeys(),
    );
    expect(JSON.stringify(plainValues)).not.toContain(profile.accessToken);
    expect(JSON.stringify(plainValues)).not.toContain(
      sha1(profile.accessToken!),
    );
    await persistNightscoutProfiles(
      [
        createNightscoutProfile({
          baseUrl: 'https://other.example',
          accessToken: 'other-0123456789abcdef',
        }),
      ],
      null,
      'account-b',
    );
    await purgeAccountNightscoutCredentials('purged-account-a');
    expect((await loadNightscoutProfiles('purged-account-a')).profiles).toEqual(
      [],
    );
    expect((await loadNightscoutProfiles('account-b')).profiles).toHaveLength(
      1,
    );
  });

  it('drains an in-flight credential save before capture and blocks resurrection after deletion', async () => {
    const owner = 'deleted-racing-owner';
    const profile = createNightscoutProfile({
      baseUrl: 'https://racing.example',
      accessToken: 'reader-0123456789abcdef',
    });
    const other = createNightscoutProfile({
      baseUrl: 'https://other.example',
      accessToken: 'other-0123456789abcdef',
    });
    await persistNightscoutProfiles([other], other.id, 'retained-racing-owner');
    let entered!: () => void;
    const insideWrite = new Promise<void>(resolve => {
      entered = resolve;
    });
    let release!: () => void;
    const delayed = new Promise<void>(resolve => {
      release = resolve;
    });
    const originalWrite = nativeSecureCredentialStore.write;
    const write = jest
      .spyOn(nativeSecureCredentialStore, 'write')
      .mockImplementation(async (service, value) => {
        if (value === profile.accessToken) {
          entered();
          await delayed;
        }
        await originalWrite(service, value);
      });
    const pending = persistNightscoutProfiles([profile], profile.id, owner);
    await insideWrite;
    let captured = false;
    const capture = prepareAccountNightscoutDeletionCacheSources(owner).then(
      ids => {
        captured = true;
        return ids;
      },
    );
    await Promise.resolve();
    expect(captured).toBe(false);
    release();
    await pending;
    expect(await capture).toEqual([
      createNightscoutCacheScope(profile.baseUrl, owner)!.sourceIdentity,
    ]);
    await purgeAccountNightscoutCredentials(owner);
    const ownedService = write.mock.calls.find(
      call => call[1] === profile.accessToken,
    )![0];
    expect(
      await nativeSecureCredentialStore.read(ownedService),
    ).toBeUndefined();
    await expect(
      persistNightscoutProfiles([profile], profile.id, owner),
    ).rejects.toThrow('Account deletion is in progress');
    expect((await loadNightscoutProfiles(owner)).profiles).toEqual([]);
    expect(
      (await loadNightscoutProfiles('retained-racing-owner')).profiles,
    ).toEqual([other]);
  });

  it('retains removed source ownership and cleans credentials from an interrupted metadata save', async () => {
    const owner = 'deleted-interrupted-owner';
    const old = createNightscoutProfile({
      baseUrl: 'https://removed.example',
      accessToken: 'old-0123456789abcdef',
    });
    const current = createNightscoutProfile({
      baseUrl: 'https://current.example',
      accessToken: 'current-0123456789abcdef',
    });
    await persistNightscoutProfiles([old], old.id, owner);
    await persistNightscoutProfiles([current], current.id, owner);
    const originalSet = jest
      .mocked(AsyncStorage.setItem)
      .getMockImplementation()!;
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockImplementation(async (key, value) => {
        if (key === `nightscout.profiles.v2:u${sha1(owner)}`) {
          throw new Error('Metadata write failed');
        }
        await originalSet(key, value);
      });
    const interrupted = createNightscoutProfile({
      baseUrl: 'https://interrupted.example',
      accessToken: 'interrupted-0123456789abcdef',
    });
    try {
      await expect(
        persistNightscoutProfiles([interrupted], interrupted.id, owner),
      ).rejects.toThrow('Metadata write failed');
    } finally {
      jest.mocked(AsyncStorage.setItem).mockImplementation(originalSet);
    }
    jest.restoreAllMocks();
    const sources = await prepareAccountNightscoutDeletionCacheSources(owner);
    expect(new Set(sources)).toEqual(
      new Set(
        [old, current, interrupted].map(
          profile =>
            createNightscoutCacheScope(profile.baseUrl, owner)!.sourceIdentity,
        ),
      ),
    );
    await purgeAccountNightscoutCredentials(owner);
    expect(
      await nativeSecureCredentialStore.read(
        `shani.nightscout.v2.u${sha1(owner)}.${interrupted.id}`,
      ),
    ).toBeUndefined();
  });

  it('waits for every credential write after a sibling failure before deleting the account', async () => {
    const owner = 'deleted-partial-write-owner';
    const failing = createNightscoutProfile({
      baseUrl: 'https://failure.example',
      accessToken: 'failure-0123456789abcdef',
    });
    const delayedProfile = createNightscoutProfile({
      baseUrl: 'https://delayed.example',
      accessToken: 'delayed-0123456789abcdef',
    });
    let entered!: () => void;
    const insideWrite = new Promise<void>(resolve => {
      entered = resolve;
    });
    let release!: () => void;
    const delayed = new Promise<void>(resolve => {
      release = resolve;
    });
    const originalWrite = nativeSecureCredentialStore.write;
    jest
      .spyOn(nativeSecureCredentialStore, 'write')
      .mockImplementation(async (service, value) => {
        if (value === failing.accessToken) {
          throw new Error('Credential write failed');
        }
        if (value === delayedProfile.accessToken) {
          entered();
          await delayed;
        }
        await originalWrite(service, value);
      });
    const rejected = persistNightscoutProfiles(
      [failing, delayedProfile],
      delayedProfile.id,
      owner,
    ).then(
      () => null,
      error => error,
    );
    await insideWrite;
    let purged = false;
    const purge = purgeAccountNightscoutCredentials(owner).then(() => {
      purged = true;
    });
    await Promise.resolve();
    expect(purged).toBe(false);
    release();
    expect(await rejected).toEqual(new Error('Credential write failed'));
    await purge;
    expect(
      await nativeSecureCredentialStore.read(
        `shani.nightscout.v2.u${sha1(owner)}.${delayedProfile.id}`,
      ),
    ).toBeUndefined();
  });

  describe('normalizeNightscoutUrl', () => {
    it('defaults to https when scheme is missing', () => {
      expect(normalizeNightscoutUrl('example.com')).toBe('https://example.com');
    });

    it('allows explicit HTTP only for a local Nightscout host', () => {
      expect(normalizeNightscoutUrl('http://192.168.1.20/')).toBe(
        'http://192.168.1.20',
      );
      expect(normalizeNightscoutUrl('http://example.com/')).toBeNull();
    });

    it('preserves sub-path and trims trailing slashes', () => {
      expect(normalizeNightscoutUrl('https://example.com/nightscout/')).toBe(
        'https://example.com/nightscout',
      );
    });

    it('rejects query, fragment, and embedded URL credentials', () => {
      expect(normalizeNightscoutUrl('https://example.com/ns?a=b')).toBeNull();
      expect(normalizeNightscoutUrl('https://example.com/ns#token')).toBeNull();
      expect(
        normalizeNightscoutUrl('https://user:password@example.com/ns'),
      ).toBeNull();
    });

    it('rejects non-http(s) schemes', () => {
      expect(normalizeNightscoutUrl('ftp://example.com')).toBeNull();
    });

    it('rejects empty input', () => {
      expect(normalizeNightscoutUrl('   ')).toBeNull();
    });
  });

  describe('normalizeNightscoutApiSecretToSha1', () => {
    it('returns lowercase when input is already SHA1 hex', () => {
      const existing = '55A342B44E4C1D0D3C293F90042AF4251E150E32';
      expect(normalizeNightscoutApiSecretToSha1(existing)).toBe(
        '55a342b44e4c1d0d3c293f90042af4251e150e32',
      );
    });

    it('hashes a plain secret/token', () => {
      const token = 'jvA4cWn9c7zxgTyZ';
      expect(normalizeNightscoutApiSecretToSha1(token)).toBe(sha1(token));
    });

    it('trims whitespace before hashing', () => {
      const token = '  my-secret  ';
      expect(normalizeNightscoutApiSecretToSha1(token)).toBe(sha1('my-secret'));
    });

    it('rejects empty input', () => {
      expect(normalizeNightscoutApiSecretToSha1('')).toBeNull();
      expect(normalizeNightscoutApiSecretToSha1('   ')).toBeNull();
    });
  });

  describe('storage helpers', () => {
    it('hasAnyNightscoutProfile returns false when empty', async () => {
      expect(await hasAnyNightscoutProfile()).toBe(false);
    });

    it('hasAnyNightscoutProfile returns false when invalid JSON', async () => {
      await AsyncStorage.setItem('nightscout.profiles.v1', 'not-json');
      expect(await hasAnyNightscoutProfile()).toBe(false);
    });

    it('roundtrips only inside the requested Firebase UID namespace', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

      const profile = createNightscoutProfile({
        baseUrl: 'https://example.com',
        apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
      });

      await persistNightscoutProfiles([profile], profile.id, 'firebase-user-a');

      const loaded = await loadNightscoutProfiles('firebase-user-a');
      expect(loaded.profiles).toHaveLength(1);
      expect(loaded.profiles[0].baseUrl).toBe('https://example.com');
      expect(loaded.profiles[0].apiSecretSha1).toBe(
        '55a342b44e4c1d0d3c293f90042af4251e150e32',
      );
      expect(loaded.activeProfileId).toBe(profile.id);
      expect(await hasAnyNightscoutProfile('firebase-user-a')).toBe(true);
      expect(await hasAnyNightscoutProfile('firebase-user-b')).toBe(false);
      expect(await loadNightscoutProfiles('firebase-user-b')).toEqual({
        profiles: [],
        activeProfileId: null,
      });
      const values = await Promise.all(
        (await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)),
      );
      expect(values.join('\n')).not.toContain(profile.apiSecretSha1);
    });

    it('quarantines an unattributed legacy profile instead of attaching it', async () => {
      const legacy = {
        id: 'ns_legacy_123',
        label: 'Legacy',
        baseUrl: 'https://legacy.example.com',
        apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
        createdAt: 1700000000000,
      };
      await AsyncStorage.setItem(
        'nightscout.profiles.v1',
        JSON.stringify([legacy]),
      );

      const loaded = await loadNightscoutProfiles('firebase-user-b');

      expect(loaded).toEqual({profiles: [], activeProfileId: null});
      expect(await AsyncStorage.getItem('nightscout.profiles.v1')).toBeNull();
      const values = await Promise.all(
        (await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)),
      );
      expect(values.join('\n')).not.toContain(legacy.apiSecretSha1);
      expect(values.join('\n')).toContain('unattributed');
    });

    it('migrates legacy data only when a durable owner marker matches', async () => {
      const legacy = {
        id: 'ns_owned_123',
        label: 'Owned legacy',
        baseUrl: 'https://owned.example.com',
        apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
        createdAt: 1700000000000,
      };
      await AsyncStorage.setItem(
        'nightscout.profiles.v1',
        JSON.stringify([legacy]),
      );
      await AsyncStorage.setItem(
        'nightscout.legacyOwnerUid.v1',
        'firebase-user-a',
      );

      expect(await loadNightscoutProfiles('firebase-user-b')).toEqual({
        profiles: [],
        activeProfileId: null,
      });
      expect(
        await AsyncStorage.getItem('nightscout.profiles.v1'),
      ).not.toBeNull();

      const loaded = await loadNightscoutProfiles('firebase-user-a');
      expect(loaded.profiles).toEqual([legacy]);
      expect(await AsyncStorage.getItem('nightscout.profiles.v1')).toBeNull();
      expect(
        await AsyncStorage.getItem('nightscout.legacyOwnerUid.v1'),
      ).toBeNull();
    });

    it('keeps the signed-out local namespace separate from Firebase users', async () => {
      const localProfile = createNightscoutProfile({
        baseUrl: 'https://local-mode.example',
        apiSecretSha1: 'a'.repeat(40),
      });
      await persistNightscoutProfiles([localProfile], localProfile.id, null);

      expect((await loadNightscoutProfiles()).profiles).toEqual([localProfile]);
      expect(
        (await loadNightscoutProfiles('firebase-user-a')).profiles,
      ).toEqual([]);
    });

    it('persistNightscoutProfiles removes activeProfileId when null', async () => {
      await AsyncStorage.setItem('nightscout.activeProfileId.v1', 'some-id');
      await persistNightscoutProfiles([], null);
      expect(
        await AsyncStorage.getItem('nightscout.activeProfileId.v1'),
      ).toBeNull();
    });
  });
});
