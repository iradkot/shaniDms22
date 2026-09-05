import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  KeyValueAlertRuleSyncStore,
  KeyValueUpdateCenterSyncStore,
  OfflineFirstAlertRulesRepository,
  OfflineFirstUpdateCenterRepository,
  type AlertSyncRemoteAdapter,
  type AlertSyncRetryTrigger,
} from '../../../modules/alerts';
import {
  createNativeAlertRulesLocalReplica,
  createNativeUpdateCenterLocalReplica,
  type NativeAlertRulesOptions,
  type NativeUpdateCenterOptions,
  type NativeUpdateCenterRepository,
} from './localNotificationRepositories';
import {createNativeAlertsRemoteRegistration} from './nativeFirebaseAlertsRemoteAdapter';
import {nativeAlertRetryTrigger} from './nativeAlertRetryTrigger';

let mutationSequence = 0;

const nextMutationId = (): string => {
  mutationSequence += 1;
  return `alert_${Date.now().toString(36)}_${mutationSequence.toString(
    36,
  )}_${Math.floor(Math.random() * 0x100000000).toString(36)}`;
};

export interface NativeAlertSyncOptions {
  readonly ownerProductUserId?: string;
  readonly remote?: AlertSyncRemoteAdapter;
  readonly rulesVerified?: boolean;
}

const resolveSync = (
  workspaceId: string | undefined,
  options: NativeAlertSyncOptions,
):
  | {
      readonly ownerProductUserId: string;
      readonly workspaceId: string;
      readonly remote: AlertSyncRemoteAdapter;
    }
  | undefined => {
  if (workspaceId === undefined) {
    return undefined;
  }
  const ownerProductUserId =
    options.ownerProductUserId ?? getAuth(getApp()).currentUser?.uid;
  if (ownerProductUserId === undefined) {
    return undefined;
  }
  if (options.remote !== undefined) {
    return {ownerProductUserId, workspaceId, remote: options.remote};
  }
  const registration = createNativeAlertsRemoteRegistration({
    ...(options.rulesVerified === undefined
      ? {}
      : {rulesVerified: options.rulesVerified}),
  });
  return registration.enabled
    ? {ownerProductUserId, workspaceId, remote: registration.adapter}
    : undefined;
};

export const createNativeAlertRulesRepository = (
  options: NativeAlertRulesOptions & NativeAlertSyncOptions = {},
) => {
  const local = createNativeAlertRulesLocalReplica(options);
  const sync = resolveSync(options.scopeId, options);
  if (sync === undefined) {
    return local;
  }
  return new OfflineFirstAlertRulesRepository({
    local,
    store: new KeyValueAlertRuleSyncStore(AsyncStorage, sync),
    scope: sync,
    clock: {now: Date.now},
    ids: {next: nextMutationId},
    remote: sync.remote,
  });
};

export const createNativeUpdateCenterRepository = (
  options: NativeUpdateCenterOptions & NativeAlertSyncOptions = {},
): NativeUpdateCenterRepository => {
  const local = createNativeUpdateCenterLocalReplica(options);
  const sync = resolveSync(options.scopeId, options);
  if (sync === undefined) {
    return local;
  }
  return new OfflineFirstUpdateCenterRepository({
    local,
    store: new KeyValueUpdateCenterSyncStore(AsyncStorage, sync),
    scope: sync,
    clock: {now: Date.now},
    remote: sync.remote,
  });
};

interface ActivatableAlertRepository {
  activate(retryTrigger: AlertSyncRetryTrigger): () => void;
}

const isActivatable = (value: unknown): value is ActivatableAlertRepository =>
  typeof (value as {activate?: unknown} | undefined)?.activate === 'function';

/** Activates and disposes every remote-capable native Alerts repository. */
export const activateNativeAlertSynchronization = (
  repositories: {
    readonly rules?: unknown;
    readonly updates?: unknown;
  },
  retryTrigger: AlertSyncRetryTrigger = nativeAlertRetryTrigger,
): (() => void) => {
  const cleanups = [repositories.rules, repositories.updates]
    .filter(isActivatable)
    .map(repository => repository.activate(retryTrigger));
  return () => cleanups.forEach(cleanup => cleanup());
};
