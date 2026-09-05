import type {Firestore} from 'firebase-admin/firestore';

import type {
  SupportedProvider,
  VaultDocument,
  VaultRepository,
} from './vault';

const documentPath = (uid: string, provider: SupportedProvider): string =>
  `privateCredentialVault/${uid}/secrets/llm-${provider}`;

const isVaultDocument = (value: unknown): value is VaultDocument => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const document = value as Record<string, unknown>;
  const envelope = document.envelope;
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    return false;
  }
  const encrypted = envelope as Record<string, unknown>;
  return (
    document.version === 1 &&
    document.provider === 'openai' &&
    typeof document.updatedAtIso === 'string' &&
    encrypted.version === 1 &&
    encrypted.algorithm === 'AES-256-GCM+KMS' &&
    typeof encrypted.kmsKeyName === 'string' &&
    typeof encrypted.encryptedDekBase64 === 'string' &&
    typeof encrypted.ivBase64 === 'string' &&
    typeof encrypted.ciphertextBase64 === 'string' &&
    typeof encrypted.authTagBase64 === 'string'
  );
};

export class FirestoreVaultRepository implements VaultRepository {
  constructor(private readonly firestore: Firestore) {}

  async read(
    uid: string,
    provider: SupportedProvider,
  ): Promise<VaultDocument | null> {
    const snapshot = await this.firestore.doc(documentPath(uid, provider)).get();
    if (!snapshot.exists) return null;
    const value: unknown = snapshot.data();
    if (!isVaultDocument(value) || value.provider !== provider) {
      throw new Error('Invalid credential vault document');
    }
    return value;
  }

  async write(uid: string, document: VaultDocument): Promise<void> {
    await this.firestore.doc(documentPath(uid, document.provider)).set(document);
  }

  async remove(uid: string, provider: SupportedProvider): Promise<void> {
    await this.firestore.doc(documentPath(uid, provider)).delete();
  }
}
