import type {Firestore} from 'firebase-admin/firestore';
import {ApiContractError} from './contracts';
import {PRIVACY_POLICY_VERSION} from './accountPrivacy';

/** The authorization reads participate in the same transaction as the write. */
export const writePrivateCredential = async (
  firestore: Firestore,
  uid: string,
  path: string,
  value: object,
): Promise<void> => {
  await firestore.runTransaction(async transaction => {
    const lock = await transaction.get(
      firestore.doc(`privateAccountState/${uid}`),
    );
    const consent = await transaction.get(
      firestore.doc(`users/${uid}/privacy/consent`),
    );
    if (
      lock.exists ||
      consent.data()?.policyVersion !== PRIVACY_POLICY_VERSION ||
      consent.data()?.cloudSync !== true
    ) {
      throw new ApiContractError(
        403,
        'privacy_consent_required',
        'Account sharing is blocked',
      );
    }
    transaction.set(firestore.doc(path), value);
  });
};
