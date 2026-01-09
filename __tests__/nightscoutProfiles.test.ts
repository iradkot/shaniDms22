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

    it('accepts http and trims trailing slash', () => {
      expect(normalizeNightscoutUrl('http://example.com/')).toBe('http://example.com');
    });

    it('preserves sub-path and trims trailing slashes', () => {
      expect(normalizeNightscoutUrl('https://example.com/nightscout/')).toBe(
        'https://example.com/nightscout',
      );
    });

    it('removes query/hash', () => {
      expect(normalizeNightscoutUrl('https://example.com/ns/?a=b#x')).toBe(
        'https://example.com/ns',
      );
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

    it('persistNightscoutProfiles and loadNightscoutProfiles roundtrip', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

      const profile = createNightscoutProfile({
        baseUrl: 'https://example.com',
        apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
      });

      await persistNightscoutProfiles([profile], profile.id);

      const loaded = await loadNightscoutProfiles();
      expect(loaded.profiles).toHaveLength(1);
      expect(loaded.profiles[0].baseUrl).toBe('https://example.com');
      expect(loaded.activeProfileId).toBe(profile.id);
      expect(await hasAnyNightscoutProfile()).toBe(true);
    });

    it('persistNightscoutProfiles removes activeProfileId when null', async () => {
      await AsyncStorage.setItem('nightscout.activeProfileId.v1', 'some-id');
      await persistNightscoutProfiles([], null);
      expect(await AsyncStorage.getItem('nightscout.activeProfileId.v1')).toBeNull();
    });
  });
});
