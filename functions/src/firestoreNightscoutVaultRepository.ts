import type {Firestore} from 'firebase-admin/firestore';

import type {
  NightscoutVaultDocument,
  NightscoutVaultRepository,
} from './nightscoutVault';

const documentPath = (uid: string): string =>
  `privateCredentialVault/${uid}/secrets/nightscout`;

const isNightscoutVaultDocument = (
  value: unknown,
): value is NightscoutVaultDocument => {
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
    Object.keys(document).every(key =>
      ['version', 'kind', 'envelope', 'updatedAtIso'].includes(key),
    ) &&
    document.version === 1 &&
    document.kind === 'nightscout' &&
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

export class FirestoreNightscoutVaultRepository
  implements NightscoutVaultRepository
{
  constructor(private readonly firestore: Firestore) {}

  async read(uid: string): Promise<NightscoutVaultDocument | null> {
    const snapshot = await this.firestore.doc(documentPath(uid)).get();
    if (!snapshot.exists) return null;
    const value: unknown = snapshot.data();
    if (!isNightscoutVaultDocument(value)) {
      throw new Error('Invalid Nightscout credential vault document');
    }
    return value;
  }

  async write(uid: string, document: NightscoutVaultDocument): Promise<void> {
    await this.firestore.doc(documentPath(uid)).set(document);
  }

  async remove(uid: string): Promise<void> {
    await this.firestore.doc(documentPath(uid)).delete();
  }
}
