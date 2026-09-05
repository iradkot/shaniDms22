import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
  type ProductPersonalizationKeyValueStore,
} from '../../../product/personalization';
import {createNativeProductPersonalizationRemoteRegistration} from './nativeFirebaseProductPersonalizationRemoteAdapter';

const nativeStorage: ProductPersonalizationKeyValueStore = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

export const nativeProductPersonalizationStore =
  new KeyValueProductPersonalizationStore(nativeStorage);

export const nativeProductPersonalizationSyncStore =
  new KeyValueProductPersonalizationSyncStore(nativeStorage);

let mutationSequence = 0;

const nextNativeMutationId = (): string => {
  mutationSequence += 1;
  const random = Math.floor(Math.random() * 0x100000000)
    .toString(36)
    .padStart(7, '0');
  return `preference_${Date.now().toString(36)}_${mutationSequence.toString(
    36,
  )}_${random}`;
};

const remoteRegistration =
  createNativeProductPersonalizationRemoteRegistration();

export const nativeProductPersonalizationRepository =
  new OfflineFirstProductPersonalizationRepository({
    localStore: nativeProductPersonalizationStore,
    syncStore: nativeProductPersonalizationSyncStore,
    ...(remoteRegistration.enabled
      ? {remote: remoteRegistration.adapter}
      : {}),
    clock: {now: () => Date.now()},
    mutationIds: {next: nextNativeMutationId},
  });
