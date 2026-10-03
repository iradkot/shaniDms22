import {PRIVACY_POLICY_VERSION, type PrivacyConsent} from './privacy';

export class PrivacyConsentRequiredError extends Error {
  readonly code = 'privacy_consent_required';
  constructor() {
    super('Review Privacy in Settings before sharing data.');
    this.name = 'PrivacyConsentRequiredError';
  }
}

let session: {ownerUserId: string; consent: PrivacyConsent | null} | undefined;
let revision = 0;
const listeners = new Set<() => void>();
export const subscribePrivacySession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const privacySessionRevision = (): number => revision;
const publish = () => {
  revision += 1;
  listeners.forEach(listener => listener());
};
export const registerPrivacySession = (
  ownerUserId: string,
  consent: PrivacyConsent | null,
): void => {
  session = {ownerUserId, consent};
  publish();
};
export const clearPrivacySession = (): void => {
  session = undefined;
  publish();
};
export const hasPrivacyConsent = (
  kind: 'cloud' | 'ai',
  ownerUserId?: string,
): boolean =>
  session !== undefined &&
  (ownerUserId === undefined || ownerUserId === session.ownerUserId) &&
  session.consent?.policyVersion === PRIVACY_POLICY_VERSION &&
  session.consent.cloudSync &&
  (kind === 'cloud' || session.consent.aiProcessing);
export const assertPrivacyConsent = (
  kind: 'cloud' | 'ai',
  ownerUserId?: string,
): void => {
  if (!hasPrivacyConsent(kind, ownerUserId)) {
    throw new PrivacyConsentRequiredError();
  }
};
export const capturePrivacyAuthorization = (
  kind: 'cloud' | 'ai',
  ownerUserId?: string,
): (() => void) => {
  assertPrivacyConsent(kind, ownerUserId);
  const capturedRevision = revision;
  return () => {
    if (revision !== capturedRevision) {
      throw new PrivacyConsentRequiredError();
    }
    assertPrivacyConsent(kind, ownerUserId);
  };
};
