import {
  createFirestoreAlertsRemoteAdapter,
  KeyValueAlertRuleSyncStore,
  KeyValueUpdateCenterSyncStore,
  OfflineFirstAlertRulesRepository,
  OfflineFirstUpdateCenterRepository,
  type AlertSyncRemoteAdapter,
  type AlertSyncScope,
} from '../../../modules/alerts';
import type {BrowserFirebaseAuth} from '../auth';
import type {IndexedDbKeyValueStore} from '../storage';
import type {ReturnTypeOfFirestoreRestGateway} from '../types';
import {createOpaqueBrowserId} from '../identity';
import {
  createBrowserAlertRulesLocalReplica,
  createBrowserUpdateCenterLocalReplica,
} from './browserAlertRepositories';
import {createBrowserAlertsFirestoreGateway} from './browserAlertsFirestoreGateway';

export interface BrowserAlertsSyncOptions {
  readonly scope: AlertSyncScope;
  readonly remote: AlertSyncRemoteAdapter;
}

export const createBrowserFirebaseAlertsRemoteAdapter = (input: {
  readonly projectId: string;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'>;
  readonly gateway: ReturnTypeOfFirestoreRestGateway;
  readonly fetch?: typeof globalThis.fetch;
}): AlertSyncRemoteAdapter =>
  createFirestoreAlertsRemoteAdapter(
    createBrowserAlertsFirestoreGateway({
      projectId: input.projectId,
      auth: input.auth,
      transactions: input.gateway,
      ...(input.fetch === undefined ? {} : {fetch: input.fetch}),
    }),
  );

export const createBrowserAlertRulesRepository = (input: {
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scopeId: string;
  readonly createId?: () => string;
  readonly sync?: BrowserAlertsSyncOptions;
}) => {
  const local = createBrowserAlertRulesLocalReplica(input);
  if (input.sync === undefined) {
    return local;
  }
  return new OfflineFirstAlertRulesRepository({
    local,
    store: new KeyValueAlertRuleSyncStore(input.storage, input.sync.scope),
    scope: input.sync.scope,
    clock: {now: Date.now},
    ids: {next: () => `alert-${createOpaqueBrowserId()}`},
    remote: input.sync.remote,
  });
};

export const createBrowserUpdateCenterRepository = (input: {
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scopeId: string;
  readonly createId?: () => string;
  readonly sync?: BrowserAlertsSyncOptions;
}) => {
  const local = createBrowserUpdateCenterLocalReplica(input);
  if (input.sync === undefined) {
    return local;
  }
  return new OfflineFirstUpdateCenterRepository({
    local,
    store: new KeyValueUpdateCenterSyncStore(input.storage, input.sync.scope),
    scope: input.sync.scope,
    clock: {now: Date.now},
    remote: input.sync.remote,
  });
};
