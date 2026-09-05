import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {AppState} from 'react-native';

import {loadNightscoutProfiles} from 'app/services/nightscoutProfiles';
import {isE2E} from 'app/utils/e2e';

import {nativeNightscoutVaultClient} from './nativeNightscoutVaultClient';
import {
  createNightscoutVaultSynchronizer,
  type NightscoutVaultActiveProfileReader,
  type NightscoutVaultAuthSession,
  type NightscoutVaultRetryTrigger,
} from './nightscoutVaultSynchronizer';

const E2E_USER_ID = 'e2e-product-user';

export const nativeNightscoutVaultAuthSession: NightscoutVaultAuthSession = {
  getCurrentUserId: () =>
    isE2E ? E2E_USER_ID : getAuth(getApp()).currentUser?.uid ?? null,
  subscribe(listener) {
    if (isE2E) {
      return () => {};
    }
    return getAuth(getApp()).onAuthStateChanged(user => {
      listener(user?.uid ?? null);
    });
  },
};

export const nativeNightscoutVaultActiveProfileReader: NightscoutVaultActiveProfileReader = {
  async readActiveProfile(expectedUserId) {
    const stored = await loadNightscoutProfiles(expectedUserId);
    if (stored.profiles.length === 0) {
      return null;
    }
    // Match the Context's startup repair. A missing active ID must never turn a
    // still-present local profile into a destructive server removal.
    const active =
      stored.profiles.find(profile => profile.id === stored.activeProfileId) ??
      stored.profiles[0];
    if (
      !active ||
      !/^https?:\/\//i.test(active.baseUrl) ||
      !/^[a-f0-9]{40}$/i.test(active.apiSecretSha1)
    ) {
      const error = new Error(
        'The active Nightscout credential is unavailable in secure storage',
      ) as Error & {code: string};
      error.code = 'storage';
      throw error;
    }
    return {
      baseUrl: active.baseUrl,
      apiSecretSha1: active.apiSecretSha1,
    };
  },
};

export const nativeNightscoutVaultForegroundRetryTrigger: NightscoutVaultRetryTrigger = {
  subscribe(listener) {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        listener();
      }
    });
    return () => subscription.remove();
  },
};

/** Process-wide coordinator; its outbox is durable and scoped by Firebase UID. */
export const nativeNightscoutVaultSynchronizer =
  createNightscoutVaultSynchronizer({
    strings: AsyncStorage,
    auth: nativeNightscoutVaultAuthSession,
    profiles: nativeNightscoutVaultActiveProfileReader,
    remote: nativeNightscoutVaultClient,
    retryTrigger: nativeNightscoutVaultForegroundRetryTrigger,
  });
