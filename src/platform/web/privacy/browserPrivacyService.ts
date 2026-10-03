import type {AuthenticatedWebApiClient} from '../api';
import type {IndexedDbKeyValueStore} from '../storage';
import type {BrowserFirebaseAuth} from '../auth';
import {IndexedDbMealImageBlobRepository} from '../mealMedia/browserMealImageBlobStore';
import {
  decodePrivacyConsent,
  PRIVACY_POLICY_VERSION,
  type PrivacyConsent,
} from '../../../modules/privacy';
import {blockAndDrainLocalAccountWrites, purgeLocalAccountData} from '../../../modules/privacy/localAccountCleanup';

const key = (uid: string) => `privacy.consent.v1:${uid}`;
export const createBrowserPrivacyService = (input: {
  readonly api: AuthenticatedWebApiClient;
  readonly storage: IndexedDbKeyValueStore;
  readonly auth: BrowserFirebaseAuth;
}) => ({
  async startDeletion(
    uid: string,
    receipt: string,
  ): Promise<{version?: unknown; deleted?: unknown}> {
    const start = (value: string) =>
      input.api.requestJson('/v1/account/delete', {
        method: 'POST',
        expectedUserId: uid,
        timeoutMs: 85_000,
        body: {
          version: 1,
          confirmation: 'DELETE_MY_SHANIDMS_ACCOUNT',
          receipt: value,
        },
      }) as Promise<{version?: unknown; deleted?: unknown}>;
    try {
      return await start(receipt);
    } catch (error) {
      if (
        (error as {code?: string})?.code !== 'invalid_deletion_receipt' ||
        input.auth.getIdentity()?.uid !== uid
      ) {
        throw error;
      }
      const issued = (await input.api.requestJson(
        '/v1/account/delete/receipt',
        {method: 'POST', expectedUserId: uid, body: {version: 1}},
      )) as {receipt?: unknown};
      if (
        typeof issued.receipt !== 'string' ||
        !/^[a-f0-9]{64}$/.test(issued.receipt)
      ) {
        throw new Error('Deletion receipt was not confirmed.');
      }
      await input.storage.setItem(
        `privacy.deletion.receipt:${uid}`,
        issued.receipt,
      );
      return start(issued.receipt);
    }
  },
  async recoveryOwner(): Promise<string | null> {
    return input.storage.getItem('privacy.deletion.recovery.v1');
  },
  async load(
    uid: string,
  ): Promise<{consent: PrivacyConsent | null; deleting: boolean}> {
    const pending = await input.storage.getItem(
      `privacy.deletion.pending:${uid}`,
    );
    if (await input.storage.getItem(`privacy.consent.pending:${uid}`)) {
      return {consent: null, deleting: pending !== null};
    }
    const raw = await input.storage.getItem(key(uid));
    let cached: PrivacyConsent | null = null;
    try {
      cached = decodePrivacyConsent(raw ? JSON.parse(raw) : null);
    } catch {
      /* fail closed */
    }
    try {
      const value = (await input.api.requestJson('/v1/privacy/status', {
        expectedUserId: uid,
      })) as {consent?: unknown; deleting?: unknown};
      const consent = decodePrivacyConsent(value.consent);
      if (consent) {
        await input.storage.setItem(key(uid), JSON.stringify(consent));
      } else {
        await input.storage.removeItem(key(uid));
      }
      return {consent, deleting: pending !== null || value.deleting === true};
    } catch {
      return {consent: cached, deleting: pending !== null};
    }
  },
  async save(
    uid: string,
    cloudSync: boolean,
    aiProcessing: boolean,
  ): Promise<PrivacyConsent> {
    if (await input.storage.getItem(`privacy.deletion.pending:${uid}`)) {
      throw new Error('Finish account deletion first.');
    }
    let consent: PrivacyConsent = {
      policyVersion: PRIVACY_POLICY_VERSION,
      cloudSync,
      aiProcessing: cloudSync && aiProcessing,
      updatedAtMs: Date.now(),
    };
    const previous = await input.storage.getItem(key(uid));
    const wasPending =
      (await input.storage.getItem(`privacy.consent.pending:${uid}`)) !== null;
    await input.storage.setItem(`privacy.consent.pending:${uid}`, 'requested');
    await input.storage.removeItem(key(uid));
    if (cloudSync || previous !== null || wasPending) {
      const value = (await input.api.requestJson('/v1/privacy/consent', {
        method: 'POST',
        expectedUserId: uid,
        body: {
          version: 1,
          policyVersion: PRIVACY_POLICY_VERSION,
          cloudSync,
          aiProcessing: cloudSync && aiProcessing,
        },
      })) as {consent?: unknown};
      const decoded = decodePrivacyConsent(value.consent);
      if (!decoded) {
        throw new Error('Consent save was not confirmed.');
      }
      consent = decoded;
    }
    await input.storage.setItem(key(uid), JSON.stringify(consent));
    await input.storage.removeItem(`privacy.consent.pending:${uid}`);
    return consent;
  },
  async deleteAccount(uid: string): Promise<void> {
    const pendingKey = `privacy.deletion.pending:${uid}`;
    if ((await input.storage.getItem(pendingKey)) !== 'cloud-complete') {
      const receiptKey = `privacy.deletion.receipt:${uid}`;
      let receipt = await input.storage.getItem(receiptKey);
      const resumed = receipt !== null;
      if (receipt === null) {
        const issued = (await input.api.requestJson(
          '/v1/account/delete/receipt',
          {method: 'POST', expectedUserId: uid, body: {version: 1}},
        )) as {receipt?: unknown};
        if (
          typeof issued.receipt !== 'string' ||
          !/^[a-f0-9]{64}$/.test(issued.receipt)
        ) {
          throw new Error('Deletion receipt was not confirmed.');
        }
        receipt = issued.receipt;
        await input.storage.setItem(receiptKey, receipt);
      }
      await input.storage.setItem('privacy.deletion.recovery.v1', uid);
      await input.storage.setItem(pendingKey, 'requested');
      await blockAndDrainLocalAccountWrites(uid);
      let value: {version?: unknown; deleted?: unknown};
      if (resumed) {
        try {
          value = (await input.api.requestJson('/v1/account/delete/finish', {
            method: 'POST',
            timeoutMs: 85_000,
            body: {version: 1, receipt},
          })) as typeof value;
        } catch (error) {
          if (input.auth.getIdentity()?.uid !== uid) {
            throw error;
          }
          value = await this.startDeletion(uid, receipt);
        }
      } else {
        value = await this.startDeletion(uid, receipt);
      }
      if (value.version !== 1 || value.deleted !== true) {
        throw new Error('Account deletion was not confirmed.');
      }
      await input.storage.setItem(pendingKey, 'cloud-complete');
    }
    await blockAndDrainLocalAccountWrites(uid);
    const blobs = new IndexedDbMealImageBlobRepository(globalThis.indexedDB);
    await blobs.removeAccount(uid);
    await purgeLocalAccountData(input.storage, uid, uri => blobs.remove(uri));
    if (input.auth.getIdentity()?.uid === uid) {
      await input.auth.signOut();
    }
    await input.storage.removeItem(pendingKey);
    await input.storage.removeItem(`privacy.deletion.receipt:${uid}`);
    await input.storage.removeItem('privacy.deletion.recovery.v1');
  },
});
