import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApp} from '@react-native-firebase/app';
import {getAuth, signOut} from '@react-native-firebase/auth';
import {sha1} from 'js-sha1';
import {nativeAuthenticatedBackendClient} from '../../../services/backend/nativeAuthenticatedBackendClient';
import {nativeSecureCredentialStore} from '../../../services/secureCredentialStore';
import {
  purgeAccountNightscoutCredentials,
  prepareAccountNightscoutDeletionCacheSources,
} from '../../../services/nightscoutProfiles';
import {purgeAccountNightscoutCaches} from '../../../services/nightscoutAccountCleanup';
import {createReactNativeFsMealImageFileAdapter} from '../mealMedia/reactNativeFsMealImageFileAdapter';
import {blockNativeMealImageOwner} from '../mealMedia/reactNativeFsMealImageFileAdapter';
import {clearNightscoutInstance} from '../../../api/shaniNightscoutInstances';
import {
  decodePrivacyConsent,
  PRIVACY_POLICY_VERSION,
  type PrivacyConsent,
} from '../../../modules/privacy';
import {privacySessionRevision} from '../../../modules/privacy';
import {purgeLocalAccountData} from '../../../modules/privacy/localAccountCleanup';

const key = (uid: string) => `privacy.consent.v1:${uid}`;
const startDeletion = async (
  uid: string,
  receipt: string,
): Promise<Record<string, unknown>> => {
  const start = (value: string) =>
    nativeAuthenticatedBackendClient.requestJson('/v1/account/delete', {
      expectedUserId: uid,
      timeoutMs: 85_000,
      body: {
        version: 1,
        confirmation: 'DELETE_MY_SHANIDMS_ACCOUNT',
        receipt: value,
      },
    });
  try {
    return await start(receipt);
  } catch (error) {
    if (
      (error as {code?: string})?.code !== 'invalid_deletion_receipt' ||
      getAuth(getApp()).currentUser?.uid !== uid
    ) {
      throw error;
    }
    const issued = await nativeAuthenticatedBackendClient.requestJson(
      '/v1/account/delete/receipt',
      {expectedUserId: uid, body: {version: 1}},
    );
    if (
      typeof issued.receipt !== 'string' ||
      !/^[a-f0-9]{64}$/.test(issued.receipt)
    ) {
      throw new Error('Deletion receipt was not confirmed.');
    }
    await AsyncStorage.setItem(
      `privacy.deletion.receipt:${uid}`,
      issued.receipt,
    );
    return start(issued.receipt);
  }
};
export const nativePrivacyService = {
  async recoveryOwner(): Promise<string | null> {
    return AsyncStorage.getItem('privacy.deletion.recovery.v1');
  },
  async load(
    uid: string,
  ): Promise<{consent: PrivacyConsent | null; deleting: boolean}> {
    const pending = await AsyncStorage.getItem(
      `privacy.deletion.pending:${uid}`,
    );
    if (await AsyncStorage.getItem(`privacy.consent.pending:${uid}`)) {
      return {consent: null, deleting: pending !== null};
    }
    const raw = await AsyncStorage.getItem(key(uid));
    let cached: PrivacyConsent | null = null;
    try {
      cached = decodePrivacyConsent(raw ? JSON.parse(raw) : null);
    } catch {
      /* fail closed */
    }
    try {
      const value = await nativeAuthenticatedBackendClient.requestJson(
        '/v1/privacy/status',
        {expectedUserId: uid},
      );
      const consent = decodePrivacyConsent(value.consent);
      if (consent) {
        await AsyncStorage.setItem(key(uid), JSON.stringify(consent));
      } else {
        await AsyncStorage.removeItem(key(uid));
      }
      return {consent, deleting: pending !== null || value.deleting === true};
    } catch {
      // Existing local choice only. All server routes independently check the
      // current consent; missing or outdated local choices never grant access.
      return {consent: cached, deleting: pending !== null};
    }
  },
  async save(
    uid: string,
    cloudSync: boolean,
    aiProcessing: boolean,
  ): Promise<PrivacyConsent> {
    const capturedRevision = privacySessionRevision();
    if (await AsyncStorage.getItem(`privacy.deletion.pending:${uid}`)) {
      throw new Error('Finish account deletion first.');
    }
    let consent: PrivacyConsent = {
      policyVersion: PRIVACY_POLICY_VERSION,
      cloudSync,
      aiProcessing: cloudSync && aiProcessing,
      updatedAtMs: Date.now(),
    };
    // A first local-only choice needs no cloud service. Withdrawals from an
    // earlier cloud choice must reach the server before reporting completion.
    const previous = await AsyncStorage.getItem(key(uid));
    const wasPending =
      (await AsyncStorage.getItem(`privacy.consent.pending:${uid}`)) !== null;
    await AsyncStorage.setItem(`privacy.consent.pending:${uid}`, 'requested');
    await AsyncStorage.removeItem(key(uid));
    if (cloudSync || previous !== null || wasPending) {
      const value = await nativeAuthenticatedBackendClient.requestJson(
        '/v1/privacy/consent',
        {
          expectedUserId: uid,
          body: {
            version: 1,
            policyVersion: PRIVACY_POLICY_VERSION,
            cloudSync,
            aiProcessing: cloudSync && aiProcessing,
          },
        },
      );
      const decoded = decodePrivacyConsent(value.consent);
      if (!decoded) {
        throw new Error('Invalid consent response.');
      }
      consent = decoded;
    }
    if (
      getAuth(getApp()).currentUser?.uid !== uid ||
      privacySessionRevision() !== capturedRevision
    ) {
      throw new Error('Account changed before consent was saved.');
    }
    await AsyncStorage.setItem(key(uid), JSON.stringify(consent));
    await AsyncStorage.removeItem(`privacy.consent.pending:${uid}`);
    return consent;
  },
  async deleteAccount(uid: string): Promise<void> {
    if (
      (await AsyncStorage.getItem(`privacy.deletion.pending:${uid}`)) ===
      'cloud-complete'
    ) {
      return this.finishLocalDeletion(uid);
    }
    const receiptKey = `privacy.deletion.receipt:${uid}`;
    let receipt = await AsyncStorage.getItem(receiptKey);
    const resumed = receipt !== null;
    if (receipt === null) {
      const issued = await nativeAuthenticatedBackendClient.requestJson(
        '/v1/account/delete/receipt',
        {expectedUserId: uid, body: {version: 1}},
      );
      if (
        typeof issued.receipt !== 'string' ||
        !/^[a-f0-9]{64}$/.test(issued.receipt)
      ) {
        throw new Error('Deletion receipt was not confirmed.');
      }
      receipt = issued.receipt;
      await AsyncStorage.setItem(receiptKey, receipt);
    }
    // Rebuild both markers if an earlier attempt stopped between local writes.
    // They must be durable before a server request can remove the Auth account.
    await AsyncStorage.setItem('privacy.deletion.recovery.v1', uid);
    await AsyncStorage.setItem(`privacy.deletion.pending:${uid}`, 'requested');
    await blockNativeMealImageOwner(uid);
    const sourceManifest = `privacy.deletion.sources:${uid}`;
    if ((await AsyncStorage.getItem(sourceManifest)) === null) {
      const identities = await prepareAccountNightscoutDeletionCacheSources(
        uid,
      );
      await AsyncStorage.setItem(sourceManifest, JSON.stringify(identities));
    }
    let value: Record<string, unknown>;
    if (resumed) {
      try {
        value = await nativeAuthenticatedBackendClient.requestJson(
          '/v1/account/delete/finish',
          {expectedUserId: uid, timeoutMs: 85_000, body: {version: 1, receipt}},
        );
      } catch (error) {
        if (getAuth(getApp()).currentUser?.uid !== uid) {
          throw error;
        }
        value = await startDeletion(uid, receipt);
      }
    } else {
      value = await startDeletion(uid, receipt);
    }
    if (value.version !== 1 || value.deleted !== true) {
      throw new Error('Account deletion was not confirmed.');
    }
    await AsyncStorage.setItem(
      `privacy.deletion.pending:${uid}`,
      'cloud-complete',
    );
    await this.finishLocalDeletion(uid);
  },
  async finishLocalDeletion(uid: string): Promise<void> {
    if (
      (await AsyncStorage.getItem(`privacy.deletion.pending:${uid}`)) !==
      'cloud-complete'
    ) {
      throw new Error('Cloud deletion is not complete.');
    }
    let sourceManifest = await AsyncStorage.getItem(
      `privacy.deletion.sources:${uid}`,
    );
    if (sourceManifest === null) {
      const recovered = await prepareAccountNightscoutDeletionCacheSources(uid);
      sourceManifest = JSON.stringify(recovered);
      await AsyncStorage.setItem(
        `privacy.deletion.sources:${uid}`,
        sourceManifest,
      );
    }
    const identities: unknown = JSON.parse(sourceManifest);
    if (
      !Array.isArray(identities) ||
      identities.some(identity => typeof identity !== 'string')
    ) {
      throw new Error('Invalid deletion cache manifest.');
    }
    await purgeAccountNightscoutCaches(identities);
    await purgeAccountNightscoutCredentials(uid);
    await nativeSecureCredentialStore.remove(
      `shani.ai.openai.v2.u${sha1(uid)}`,
    );
    await purgeLocalAccountData(
      AsyncStorage,
      uid,
      createReactNativeFsMealImageFileAdapter().remove,
      sha1(uid),
    );
    const currentUid = getAuth(getApp()).currentUser?.uid;
    if (currentUid && currentUid !== uid) {
      throw Object.assign(
        new Error(
          'Sign out of the current account to finish clearing this device.',
        ),
        {code: 'local_cleanup_account_changed'},
      );
    }
    clearNightscoutInstance();
    const {getFirestore, terminate, clearPersistence} =
      require('@react-native-firebase/firestore') as typeof import('@react-native-firebase/firestore');
    const firestore = getFirestore(getApp());
    await terminate(firestore);
    if (
      getAuth(getApp()).currentUser?.uid &&
      getAuth(getApp()).currentUser?.uid !== uid
    ) {
      throw new Error('Account changed before clearing this device.');
    }
    await clearPersistence(firestore);
    if (getAuth(getApp()).currentUser?.uid === uid) {
      await signOut(getAuth(getApp()));
    }
    await AsyncStorage.removeItem(`privacy.deletion.pending:${uid}`);
    await AsyncStorage.removeItem(`privacy.deletion.receipt:${uid}`);
    await AsyncStorage.removeItem(`privacy.deletion.sources:${uid}`);
    await AsyncStorage.removeItem('privacy.deletion.recovery.v1');
  },
};
