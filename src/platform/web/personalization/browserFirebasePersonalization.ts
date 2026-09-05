import {createFirebaseProductPersonalizationRemoteAdapter} from '../../native/personalization/firebaseProductPersonalizationRemoteAdapter';
import {
  KeyValueProductPersonalizationStore,
  KeyValueProductPersonalizationSyncStore,
  OfflineFirstProductPersonalizationRepository,
} from '../../../product/personalization';
import type {BrowserFirebaseAuth} from '../auth';
import type {IndexedDbKeyValueStore} from '../storage';
import type {ReturnTypeOfFirestoreRestGateway} from '../types';
import {createOpaqueBrowserId} from '../identity';

export const createBrowserProductPersonalizationRepository = (input: {
  readonly storage: IndexedDbKeyValueStore;
  readonly gateway?: ReturnTypeOfFirestoreRestGateway;
  readonly auth?: Pick<BrowserFirebaseAuth, 'getIdentity'>;
}) =>
  new OfflineFirstProductPersonalizationRepository({
    localStore: new KeyValueProductPersonalizationStore(input.storage),
    syncStore: new KeyValueProductPersonalizationSyncStore(input.storage),
    ...(input.gateway === undefined || input.auth === undefined
      ? {}
      : {
          remote: createFirebaseProductPersonalizationRemoteAdapter({
            gateway: input.gateway,
            authenticatedUid: () => input.auth?.getIdentity()?.uid ?? null,
          }),
        }),
    clock: {now: Date.now},
    mutationIds: {next: () => `personalization-${createOpaqueBrowserId()}`},
  });
