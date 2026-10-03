import AsyncStorage from '@react-native-async-storage/async-storage';
import {blockAndDrainNightscoutCacheWrites} from './nightscoutCacheScope';
import {purgeNightscoutRangeCaches} from './nightscoutRangeCache';

/** Removes the exact opaque source namespaces captured before profile removal. */
export const purgeAccountNightscoutCaches = async (
  sourceIdentities: readonly string[],
): Promise<void> => {
  if (
    sourceIdentities.some(
      sourceIdentity => !/^[a-f0-9]{40}$/.test(sourceIdentity),
    )
  ) {
    throw new Error('Invalid account cache source.');
  }
  await blockAndDrainNightscoutCacheWrites(sourceIdentities);
  await purgeNightscoutRangeCaches(sourceIdentities);
  const owned = new Set(sourceIdentities);
  const keys = (await AsyncStorage.getAllKeys()).filter(
    key =>
      key.startsWith('nightscout-cache.v1:') &&
      owned.has(key.split(':')[1] ?? ''),
  );
  await AsyncStorage.multiRemove(keys);
};
