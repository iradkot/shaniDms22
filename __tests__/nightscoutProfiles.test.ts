import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {
  createNightscoutProfile,
  hasAnyNightscoutProfile,
  loadNightscoutProfiles,
  normalizeNightscoutApiSecretToSha1,
  normalizeNightscoutUrl,
  persistNightscoutProfiles,
} from '../src/services/nightscoutProfiles';

describe('nightscoutProfiles', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
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

      await persistNightscoutProfiles(
        [profile],
        profile.id,
        'firebase-user-a',
      );

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
      expect(await AsyncStorage.getItem('nightscout.profiles.v1')).not.toBeNull();

      const loaded = await loadNightscoutProfiles('firebase-user-a');
      expect(loaded.profiles).toEqual([legacy]);
      expect(await AsyncStorage.getItem('nightscout.profiles.v1')).toBeNull();
      expect(await AsyncStorage.getItem('nightscout.legacyOwnerUid.v1')).toBeNull();
    });

    it('keeps the signed-out local namespace separate from Firebase users', async () => {
      const localProfile = createNightscoutProfile({
        baseUrl: 'https://local-mode.example',
        apiSecretSha1: 'a'.repeat(40),
      });
      await persistNightscoutProfiles([localProfile], localProfile.id, null);

      expect((await loadNightscoutProfiles()).profiles).toEqual([localProfile]);
      expect((await loadNightscoutProfiles('firebase-user-a')).profiles).toEqual(
        [],
      );
    });

    it('persistNightscoutProfiles removes activeProfileId when null', async () => {
      await AsyncStorage.setItem('nightscout.activeProfileId.v1', 'some-id');
      await persistNightscoutProfiles([], null);
      expect(await AsyncStorage.getItem('nightscout.activeProfileId.v1')).toBeNull();
    });
  });
});
