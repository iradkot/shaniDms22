import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createNightscoutVaultSynchronizer,
  type NightscoutVaultRemote,
} from 'app/services/backend/nightscoutVaultSynchronizer';
import {nativeNightscoutVaultActiveProfileReader} from 'app/services/backend/nativeNightscoutVaultSync';
import {persistNightscoutProfiles} from 'app/services/nightscoutProfiles';

const USER_ID = 'firebase-user-a';
const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);

describe('native Nightscout vault retry integration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('re-reads the latest credential from secure storage after an offline restart', async () => {
    const profile = {
      id: 'ns_profile',
      label: 'Private Nightscout',
      baseUrl: 'https://private.example',
      apiSecretSha1: SECRET_A,
      createdAt: 1,
    };
    await persistNightscoutProfiles([profile], profile.id, USER_ID);
    const auth = {
      getCurrentUserId: () => USER_ID,
      subscribe: () => () => {},
    };
    const offline: NightscoutVaultRemote = {
      provision: jest.fn().mockRejectedValue(new Error('offline')),
      remove: jest.fn(),
    };
    const first = createNightscoutVaultSynchronizer({
      strings: AsyncStorage,
      auth,
      profiles: nativeNightscoutVaultActiveProfileReader,
      remote: offline,
    });
    await first.requestReconciliation('provision');
    await first.retryPending();

    const keys = await AsyncStorage.getAllKeys();
    const rawValues = await Promise.all(
      keys.map(key => AsyncStorage.getItem(key)),
    );
    expect(rawValues.join('\n')).not.toContain(SECRET_A);
    const outbox = rawValues.find(value => value?.includes('revision'));
    expect(outbox).toBeDefined();
    expect(outbox).not.toContain(profile.baseUrl);

    await persistNightscoutProfiles(
      [{...profile, apiSecretSha1: SECRET_B}],
      profile.id,
      USER_ID,
    );
    const online: NightscoutVaultRemote = {
      provision: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(),
    };
    const afterRestart = createNightscoutVaultSynchronizer({
      strings: AsyncStorage,
      auth,
      profiles: nativeNightscoutVaultActiveProfileReader,
      remote: online,
    });
    await afterRestart.retryPending();

    expect(online.provision).toHaveBeenCalledWith(
      {baseUrl: profile.baseUrl, apiSecretSha1: SECRET_B},
      USER_ID,
    );
  });
});
