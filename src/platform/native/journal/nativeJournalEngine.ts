import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {
  createJournalEngine,
  KeyValueJournalLocalStore,
} from '../../../modules/journal';
import type {
  JournalClock,
  JournalEntityKind,
  JournalIdGenerator,
} from '../../../modules/journal';
import {createNativeJournalRemoteAdapterRegistration} from './nativeFirebaseJournalRemoteAdapter';
import {createNativeNightscoutExternalRecordReader} from './nativeNightscoutExternalRecordReader';
import {nativeMealImageStore} from '../mealMedia';

const clock: JournalClock = {now: () => Date.now()};

class NativeJournalIds implements JournalIdGenerator {
  private sequence = 0;
  private readonly runtimeNonce = `${Date.now()}:${Math.random()}`;

  nextEntryId(kind: JournalEntityKind): string {
    return `${kind}_${this.nextDigest(kind)}`;
  }

  nextOperationId(): string {
    return `operation_${this.nextDigest('operation')}`;
  }

  private nextDigest(namespace: string): string {
    this.sequence += 1;
    return sha1(
      `${namespace}:${this.runtimeNonce}:${
        this.sequence
      }:${Date.now()}:${Math.random()}`,
    );
  }
}

/**
 * One process-wide engine shares its per-Workspace mutation coordinator.
 * Firebase sync and managed image-file Adapters can replace only their Seams.
 */
export const nativeJournalRemoteSyncRegistration =
  createNativeJournalRemoteAdapterRegistration();

export const nativeJournalEngine = createJournalEngine({
  localStore: new KeyValueJournalLocalStore(AsyncStorage),
  clock,
  ids: new NativeJournalIds(),
  mediaStore: nativeMealImageStore,
  externalRecords: createNativeNightscoutExternalRecordReader(),
  ...(nativeJournalRemoteSyncRegistration.enabled
    ? {remoteAdapter: nativeJournalRemoteSyncRegistration.adapter}
    : {}),
});
