import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import type {JournalRemoteAdapter} from '../../../modules/journal';
import {
  createFirebaseJournalRemoteAdapter,
  type JournalFirestoreGateway,
} from './firebaseJournalRemoteAdapter';
import {FIRESTORE_RULES_RELEASE_VERIFIED} from '../runtimeConfig';

export const JOURNAL_FIRESTORE_RULES_RELEASE_VERIFIED =
  FIRESTORE_RULES_RELEASE_VERIFIED;

export type NativeJournalRemoteAdapterRegistration =
  | {
      readonly enabled: false;
      readonly reason: 'firestore_rules_not_emulator_verified';
    }
  | {readonly enabled: true; readonly adapter: JournalRemoteAdapter};

export interface NativeJournalRemoteAdapterRegistrationOptions {
  readonly rulesVerified?: boolean;
  readonly gateway?: JournalFirestoreGateway;
  readonly authenticatedUid?: () => string | null;
}

const createDefaultGateway = (): JournalFirestoreGateway => {
  let loaded: JournalFirestoreGateway | undefined;
  const getGateway = (): JournalFirestoreGateway => {
    if (loaded === undefined) {
      // Kept lazy so importing the engine never loads native Firestore in unit tests.
      const nativeGateway =
        require('./reactNativeFirebaseJournalGateway') as typeof import('./reactNativeFirebaseJournalGateway');
      loaded = nativeGateway.createReactNativeFirebaseJournalGateway();
    }
    return loaded;
  };
  return {
    runTransaction: operation => getGateway().runTransaction(operation),
    listOperations: input => getGateway().listOperations(input),
  };
};

/**
 * The one release gate for production Journal writes. Injected dependencies
 * keep the adapter contract testable without loading a native runtime.
 */
export const createNativeJournalRemoteAdapterRegistration = (
  options: NativeJournalRemoteAdapterRegistrationOptions = {},
): NativeJournalRemoteAdapterRegistration => {
  const rulesVerified =
    options.rulesVerified ?? JOURNAL_FIRESTORE_RULES_RELEASE_VERIFIED;
  if (!rulesVerified) {
    return {
      enabled: false,
      reason: 'firestore_rules_not_emulator_verified',
    };
  }
  return {
    enabled: true,
    adapter: createFirebaseJournalRemoteAdapter({
      gateway: options.gateway ?? createDefaultGateway(),
      authenticatedUid:
        options.authenticatedUid ??
        (() => getAuth(getApp()).currentUser?.uid ?? null),
    }),
  };
};
