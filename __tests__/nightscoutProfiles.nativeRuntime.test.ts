import AsyncStorage from '@react-native-async-storage/async-storage';
import {URL as ReactNativeURL} from 'react-native/Libraries/Blob/URL';
import {
  loadNightscoutProfiles,
  persistNightscoutProfiles,
} from '../src/services/nightscoutProfiles';

describe('Nightscout restore with the Android URL runtime', () => {
  const originalURL = global.URL;
  const originalSearchParams = global.URLSearchParams;

  afterEach(() => {
    global.URL = originalURL;
    global.URLSearchParams = originalSearchParams;
  });

  it('restores the saved source after an app restart without silently dropping it', async () => {
    await AsyncStorage.clear();
    const profile = {
      id: 'ns_native_restart',
      label: 'Saved source',
      baseUrl: 'https://nightscout.example/monitor',
      apiSecretSha1: 'a'.repeat(40),
      createdAt: 1700000000000,
    };
    await persistNightscoutProfiles([profile], profile.id, 'native-user');

    // Jest normally supplies Node's complete URL implementation. Android's
    // bundled React Native implementation is different and must be exercised.
    global.URL = ReactNativeURL as unknown as typeof URL;
    jest.isolateModules(() => {
      require('../src/platform/native/bootstrap');
    });
    const restored = await loadNightscoutProfiles('native-user');

    expect(restored.profiles.map(source => source.id)).toEqual([profile.id]);
    expect(restored.activeProfileId).toBe(profile.id);
  });
});
