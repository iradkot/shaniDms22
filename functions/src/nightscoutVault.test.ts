import assert from 'node:assert/strict';
import test from 'node:test';

import type {EncryptedEnvelope, EnvelopeCipher} from './vault';
import {
  EncryptedNightscoutCredentialVault,
  createNightscoutWorkspaceId,
  createNightscoutSourceId,
  normalizeNightscoutApiSecret,
  type NightscoutVaultDocument,
  type NightscoutVaultRepository,
} from './nightscoutVault';

const envelope: EncryptedEnvelope = {
  version: 1,
  algorithm: 'AES-256-GCM+KMS',
  kmsKeyName: 'kms-key',
  encryptedDekBase64: 'dek',
  ivBase64: 'iv',
  ciphertextBase64: 'ciphertext',
  authTagBase64: 'tag',
};

test('hashes plaintext Nightscout secrets once and preserves existing SHA1', () => {
  const hashed = normalizeNightscoutApiSecret('nightscout-secret');
  assert.match(hashed, /^[a-f0-9]{40}$/);
  assert.equal(normalizeNightscoutApiSecret(hashed.toUpperCase()), hashed);
});

test('source and Workspace identities match the cross-platform contract', () => {
  const source = createNightscoutSourceId('https://nightscout.example/');
  assert.match(source, /^nightscout_[a-f0-9]{40}$/);
  assert.equal(
    createNightscoutSourceId('https://nightscout.example'),
    source,
  );
  assert.equal(
    createNightscoutWorkspaceId('user-1', 'https://nightscout.example/'),
    createNightscoutWorkspaceId('user-1', 'https://nightscout.example'),
  );
  assert.notEqual(
    createNightscoutWorkspaceId('user-1', 'https://nightscout.example/'),
    createNightscoutWorkspaceId('user-2', 'https://nightscout.example/'),
  );
  assert.notEqual(
    createNightscoutSourceId('https://other.example/'),
    source,
  );
  assert.equal(
    createNightscoutSourceId('https://example.com/nightscout/'),
    'nightscout_d60c6d0a777a2ecf5bf6501664801fd2907dfec8',
  );
  assert.equal(
    createNightscoutWorkspaceId(
      'firebase-user-1',
      'https://example.com/nightscout/',
    ),
    'workspace_a01fd8458e8e9be480f79288fd052f37ed8d6dcc',
  );
});

test('encrypts URL and Nightscout secret together with user-bound AAD', async () => {
  let document: NightscoutVaultDocument | null = null;
  let encryptedPlaintext = '';
  let encryptedAad = '';
  const repository: NightscoutVaultRepository = {
    read: async () => document,
    write: async (_uid, next) => {
      document = next;
    },
    remove: async () => {
      document = null;
    },
  };
  const cipher: EnvelopeCipher = {
    encrypt: async (plaintext, aad) => {
      encryptedPlaintext = plaintext;
      encryptedAad = aad;
      return envelope;
    },
    decrypt: async (_envelope, aad) => {
      assert.equal(aad, 'shanidms:v1:user-1:nightscout');
      return encryptedPlaintext;
    },
  };
  const vault = new EncryptedNightscoutCredentialVault(
    repository,
    cipher,
    () => new Date('2026-09-01T12:00:00.000Z'),
  );
  const value = {
    url: 'https://nightscout.example/',
    apiSecretSha1: 'a'.repeat(40),
  };

  await vault.put('user-1', value);
  assert.equal(encryptedAad, 'shanidms:v1:user-1:nightscout');
  assert.equal(JSON.stringify(document).includes(value.url), false);
  assert.equal(JSON.stringify(document).includes(value.apiSecretSha1), false);
  assert.deepEqual(await vault.get('user-1'), value);
});
