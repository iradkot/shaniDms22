import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EncryptedCredentialVault,
  type EncryptedEnvelope,
  type EnvelopeCipher,
  type SupportedProvider,
  type VaultDocument,
  type VaultRepository,
} from './vault';

const ENVELOPE: EncryptedEnvelope = {
  version: 1,
  algorithm: 'AES-256-GCM+KMS',
  kmsKeyName: 'projects/test/locations/global/keyRings/test/cryptoKeys/test',
  encryptedDekBase64: 'encrypted-dek',
  ivBase64: 'iv',
  ciphertextBase64: 'ciphertext',
  authTagBase64: 'tag',
};

class MemoryRepository implements VaultRepository {
  document: VaultDocument | null = null;
  writeUid: string | null = null;

  async read(
    _uid: string,
    _provider: SupportedProvider,
  ): Promise<VaultDocument | null> {
    return this.document;
  }

  async write(uid: string, document: VaultDocument): Promise<void> {
    this.writeUid = uid;
    this.document = document;
  }

  async remove(
    _uid: string,
    _provider: SupportedProvider,
  ): Promise<void> {
    this.document = null;
  }
}

class RecordingCipher implements EnvelopeCipher {
  encrypted: {plaintext: string; associatedData: string}[] = [];
  decrypted: {envelope: EncryptedEnvelope; associatedData: string}[] = [];

  async encrypt(
    plaintext: string,
    associatedData: string,
  ): Promise<EncryptedEnvelope> {
    this.encrypted.push({plaintext, associatedData});
    return ENVELOPE;
  }

  async decrypt(
    envelope: EncryptedEnvelope,
    associatedData: string,
  ): Promise<string> {
    this.decrypted.push({envelope, associatedData});
    return 'decrypted-secret';
  }
}

test('binds encrypted credentials to both user and provider', async () => {
  const repository = new MemoryRepository();
  const cipher = new RecordingCipher();
  const vault = new EncryptedCredentialVault(
    repository,
    cipher,
    () => new Date('2026-09-01T12:00:00.000Z'),
  );

  await vault.put('user-1', 'openai', 'plain-secret');

  assert.deepEqual(cipher.encrypted, [
    {
      plaintext: 'plain-secret',
      associatedData: 'shanidms:v1:user-1:llm:openai',
    },
  ]);
  assert.equal(repository.writeUid, 'user-1');
  assert.deepEqual(repository.document, {
    version: 1,
    provider: 'openai',
    envelope: ENVELOPE,
    updatedAtIso: '2026-09-01T12:00:00.000Z',
  });
  assert.equal(JSON.stringify(repository.document).includes('plain-secret'), false);

  const value = await vault.get('user-1', 'openai');
  assert.equal(value, 'decrypted-secret');
  assert.deepEqual(cipher.decrypted, [
    {
      envelope: ENVELOPE,
      associatedData: 'shanidms:v1:user-1:llm:openai',
    },
  ]);
});

test('never decrypts a missing credential and supports removal', async () => {
  const repository = new MemoryRepository();
  const cipher = new RecordingCipher();
  const vault = new EncryptedCredentialVault(repository, cipher);

  assert.equal(await vault.has('user-1', 'openai'), false);
  assert.equal(await vault.get('user-1', 'openai'), null);
  assert.deepEqual(cipher.decrypted, []);

  repository.document = {
    version: 1,
    provider: 'openai',
    envelope: ENVELOPE,
    updatedAtIso: '2026-09-01T12:00:00.000Z',
  };
  await vault.remove('user-1', 'openai');
  assert.equal(await vault.has('user-1', 'openai'), false);
});
