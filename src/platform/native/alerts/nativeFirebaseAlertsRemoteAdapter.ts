import type {
  AlertFirestoreGateway,
  AlertSyncRemoteAdapter,
} from '../../../modules/alerts';
import {createFirestoreAlertsRemoteAdapter} from '../../../modules/alerts';
import {FIRESTORE_RULES_RELEASE_VERIFIED} from '../runtimeConfig';

export type NativeAlertsRemoteRegistration =
  | {
      readonly enabled: false;
      readonly reason: 'firestore_rules_not_emulator_verified';
    }
  | {readonly enabled: true; readonly adapter: AlertSyncRemoteAdapter};

const createLazyGateway = (): AlertFirestoreGateway => {
  let loaded: AlertFirestoreGateway | undefined;
  const gateway = (): AlertFirestoreGateway => {
    if (loaded === undefined) {
      const native =
        require('./reactNativeFirebaseAlertsGateway') as typeof import('./reactNativeFirebaseAlertsGateway');
      loaded = native.createReactNativeFirebaseAlertsGateway();
    }
    return loaded;
  };
  return {
    get: path => gateway().get(path),
    list: path => gateway().list(path),
    runTransaction: operation => gateway().runTransaction(operation),
  };
};

export const createNativeAlertsRemoteRegistration = (input: {
  readonly rulesVerified?: boolean;
  readonly gateway?: AlertFirestoreGateway;
} = {}): NativeAlertsRemoteRegistration => {
  if (input.rulesVerified ?? FIRESTORE_RULES_RELEASE_VERIFIED) {
    return {
      enabled: true,
      adapter: createFirestoreAlertsRemoteAdapter(
        input.gateway ?? createLazyGateway(),
      ),
    };
  }
  return {
    enabled: false,
    reason: 'firestore_rules_not_emulator_verified',
  };
};
