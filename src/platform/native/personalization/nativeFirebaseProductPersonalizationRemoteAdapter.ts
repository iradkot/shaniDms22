import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import type {ProductPersonalizationRemoteAdapter} from '../../../product/personalization';
import {
  createFirebaseProductPersonalizationRemoteAdapter,
  type PersonalizationFirestoreGateway,
} from './firebaseProductPersonalizationRemoteAdapter';
import {FIRESTORE_RULES_RELEASE_VERIFIED} from '../runtimeConfig';

export const PERSONALIZATION_FIRESTORE_RULES_RELEASE_VERIFIED =
  FIRESTORE_RULES_RELEASE_VERIFIED;

export type NativeProductPersonalizationRemoteRegistration =
  | {
      readonly enabled: false;
      readonly reason: 'firestore_rules_not_emulator_verified';
    }
  | {
      readonly enabled: true;
      readonly adapter: ProductPersonalizationRemoteAdapter;
    };

export interface NativeProductPersonalizationRemoteRegistrationOptions {
  readonly rulesVerified?: boolean;
  readonly gateway?: PersonalizationFirestoreGateway;
  readonly authenticatedUid?: () => string | null;
}

const createLazyGateway = (): PersonalizationFirestoreGateway => {
  let loaded: PersonalizationFirestoreGateway | undefined;
  const gateway = (): PersonalizationFirestoreGateway => {
    if (loaded === undefined) {
      const native =
        require('./reactNativeFirebasePersonalizationGateway') as typeof import('./reactNativeFirebasePersonalizationGateway');
      loaded = native.createReactNativeFirebasePersonalizationGateway();
    }
    return loaded;
  };
  return {
    get: path => gateway().get(path),
    runTransaction: operation => gateway().runTransaction(operation),
  };
};

export const createNativeProductPersonalizationRemoteRegistration = (
  options: NativeProductPersonalizationRemoteRegistrationOptions = {},
): NativeProductPersonalizationRemoteRegistration => {
  const verified =
    options.rulesVerified ?? PERSONALIZATION_FIRESTORE_RULES_RELEASE_VERIFIED;
  if (!verified) {
    return {
      enabled: false,
      reason: 'firestore_rules_not_emulator_verified',
    };
  }
  return {
    enabled: true,
    adapter: createFirebaseProductPersonalizationRemoteAdapter({
      gateway: options.gateway ?? createLazyGateway(),
      authenticatedUid:
        options.authenticatedUid ??
        (() => getAuth(getApp()).currentUser?.uid ?? null),
    }),
  };
};
