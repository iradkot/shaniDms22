import type {Firestore} from 'firebase-admin/firestore';
import type {Auth} from 'firebase-admin/auth';
import type {Bucket} from '@google-cloud/storage';
import {createHash, randomBytes} from 'node:crypto';
import {ApiContractError} from './contracts';
import {
  PRIVACY_POLICY_VERSION,
  type AccountConsent,
  type AccountPrivacyRepository,
} from './accountPrivacy';

/** Private state is outside users so recursive deletion cannot reopen access. */
export class FirestoreAccountPrivacyRepository
  implements AccountPrivacyRepository
{
  constructor(
    private readonly firestore: Firestore,
    private readonly bucket: Bucket,
    private readonly auth: Pick<Auth, 'deleteUser' | 'revokeRefreshTokens'>,
  ) {}
  private state(uid: string) {
    return this.firestore.doc(`privateAccountState/${uid}`);
  }
  private consent(uid: string) {
    return this.firestore.doc(`users/${uid}/privacy/consent`);
  }
  private receipt(value: string) {
    return this.firestore.doc(
      `privateAccountDeletions/${createHash('sha256')
        .update(value)
        .digest('hex')}`,
    );
  }
  async isDeleting(uid: string): Promise<boolean> {
    return (await this.state(uid).get()).data()?.deleting === true;
  }
  async readConsent(uid: string): Promise<AccountConsent | null> {
    const data = (await this.consent(uid).get()).data();
    if (
      data?.policyVersion !== PRIVACY_POLICY_VERSION ||
      typeof data.cloudSync !== 'boolean' ||
      typeof data.aiProcessing !== 'boolean' ||
      (data.aiProcessing && !data.cloudSync) ||
      typeof data.updatedAtMs !== 'number' ||
      !Number.isSafeInteger(data.updatedAtMs)
    ) {
      return null;
    }
    return {
      policyVersion: data.policyVersion,
      cloudSync: data.cloudSync,
      aiProcessing: data.aiProcessing,
      updatedAtMs: data.updatedAtMs,
    };
  }
  async writeConsent(uid: string, consent: AccountConsent): Promise<void> {
    await this.firestore.runTransaction(async transaction => {
      if ((await transaction.get(this.state(uid))).data()?.deleting === true) {
        throw new ApiContractError(
          409,
          'account_deletion_pending',
          'Finish account deletion before continuing',
        );
      }
      transaction.set(this.consent(uid), consent);
    });
  }
  async issueDeletionReceipt(uid: string): Promise<string> {
    const receipt = randomBytes(32).toString('hex');
    await this.receipt(receipt).set({
      uid,
      authorized: false,
      issuedAtMs: Date.now(),
    });
    return receipt;
  }
  async deleteAccount(uid: string, receipt: string): Promise<void> {
    await this.firestore.runTransaction(async transaction => {
      const document = await transaction.get(this.receipt(receipt));
      const data = document.data();
      if (
        data?.uid !== uid ||
        (!data.authorized && Date.now() - data.issuedAtMs > 10 * 60 * 1000)
      ) {
        throw new ApiContractError(
          403,
          'invalid_deletion_receipt',
          'Deletion authorization is unavailable',
        );
      }
      transaction.set(this.receipt(receipt), {authorized: true}, {merge: true});
      transaction.set(
        this.state(uid),
        {deleting: true, requestedAtMs: Date.now()},
        {merge: true},
      );
    });
    await this.removeOwnedData(uid);
    await this.receipt(receipt).set({completed: true}, {merge: true});
  }
  async finishDeletion(receipt: string): Promise<void> {
    const data = (await this.receipt(receipt).get()).data();
    if (data?.authorized !== true || typeof data.uid !== 'string') {
      throw new ApiContractError(
        403,
        'invalid_deletion_receipt',
        'Deletion authorization is unavailable',
      );
    }
    if (data.completed === true) {
      return;
    }
    await this.removeOwnedData(data.uid);
    await this.receipt(receipt).set({completed: true}, {merge: true});
  }
  private async removeOwnedData(uid: string): Promise<void> {
    // Retained minimal lock contains no health data or credentials. Retrying the
    // same authenticated request resumes every step safely after partial failure.
    await this.state(uid).set(
      {deleting: true, requestedAtMs: Date.now()},
      {merge: true},
    );
    await this.bucket.deleteFiles({prefix: `users/${uid}/`, force: true});
    await this.firestore.recursiveDelete(this.firestore.doc(`users/${uid}`));
    await this.firestore.recursiveDelete(
      this.firestore.doc(`privateCredentialVault/${uid}`),
    );
    // Previous clients wrote owner-stamped records in shared legacy collections.
    // Never infer ownership or delete records that have no owner stamp.
    for (const collection of ['food_items', 'sport_items', 'notifications']) {
      for (const field of ['userId', 'ownerProductUserId', 'uid']) {
        const records = await this.firestore
          .collection(collection)
          .where(field, '==', uid)
          .get();
        for (const record of records.docs) {
          await this.firestore.recursiveDelete(record.ref);
        }
      }
    }
    // Re-run the owner trees after the lock, in case a server operation that
    // began before deletion committed before it observed the lock.
    await this.firestore.recursiveDelete(this.firestore.doc(`users/${uid}`));
    await this.firestore.recursiveDelete(
      this.firestore.doc(`privateCredentialVault/${uid}`),
    );
    await this.bucket.deleteFiles({prefix: `users/${uid}/`, force: true});
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      if ((error as {code?: string})?.code !== 'auth/user-not-found') {
        throw error;
      }
    }
    await this.state(uid).set(
      {deleting: true, completedAtMs: Date.now()},
      {merge: true},
    );
  }
}
