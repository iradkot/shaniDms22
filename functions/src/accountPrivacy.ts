import {ApiContractError} from './contracts';

export const PRIVACY_POLICY_VERSION = '2026-10-03.1';
export interface AccountConsent {
  readonly policyVersion: string;
  readonly cloudSync: boolean;
  readonly aiProcessing: boolean;
  readonly updatedAtMs: number;
}
export interface AccountPrivacyRepository {
  readConsent(uid: string): Promise<AccountConsent | null>;
  writeConsent(uid: string, consent: AccountConsent): Promise<void>;
  isDeleting(uid: string): Promise<boolean>;
  /** Idempotent, blocks recreation before removing data, deletes auth last. */
  issueDeletionReceipt(uid: string): Promise<string>;
  deleteAccount(uid: string, receipt: string): Promise<void>;
  finishDeletion(receipt: string): Promise<void>;
}
export const decodeAccountConsent = (
  value: unknown,
  nowMs: number,
): AccountConsent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiContractError(
      400,
      'invalid_request',
      'Consent choices required',
    );
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      key =>
        !['version', 'policyVersion', 'cloudSync', 'aiProcessing'].includes(
          key,
        ),
    ) ||
    input.version !== 1 ||
    input.policyVersion !== PRIVACY_POLICY_VERSION ||
    typeof input.cloudSync !== 'boolean' ||
    typeof input.aiProcessing !== 'boolean' ||
    (input.aiProcessing && !input.cloudSync)
  ) {
    throw new ApiContractError(
      400,
      'invalid_request',
      'Review the current privacy policy',
    );
  }
  return {
    policyVersion: PRIVACY_POLICY_VERSION,
    cloudSync: input.cloudSync,
    aiProcessing: input.aiProcessing,
    updatedAtMs: nowMs,
  };
};
export const requireAccountConsent = async (
  repository: AccountPrivacyRepository | undefined,
  uid: string,
  kind: 'cloud' | 'ai',
): Promise<void> => {
  if (repository === undefined || (await repository.isDeleting(uid))) {
    throw new ApiContractError(
      403,
      'account_unavailable',
      'Account sharing is blocked',
    );
  }
  const consent = await repository.readConsent(uid);
  if (
    consent?.policyVersion !== PRIVACY_POLICY_VERSION ||
    !consent.cloudSync ||
    (kind === 'ai' && !consent.aiProcessing)
  ) {
    throw new ApiContractError(
      403,
      'privacy_consent_required',
      'Review Privacy before sharing data',
    );
  }
};
