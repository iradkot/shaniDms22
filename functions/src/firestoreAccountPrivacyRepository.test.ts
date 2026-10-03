import assert from 'node:assert/strict';
import test from 'node:test';
import type {Firestore} from 'firebase-admin/firestore';
import type {Bucket} from '@google-cloud/storage';
import {FirestoreAccountPrivacyRepository} from './firestoreAccountPrivacyRepository';
import {writePrivateCredential} from './writePrivateCredential';
import {PRIVACY_POLICY_VERSION} from './accountPrivacy';

const fixture = () => {
  const values = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const snapshot = (path: string) => ({
    exists: values.has(path),
    data: () => values.get(path),
  });
  const doc = (path: string) => ({
    path,
    get: async () => snapshot(path),
    set: async (
      value: Record<string, unknown>,
      options?: {merge?: boolean},
    ) => {
      values.set(path, {...(options?.merge ? values.get(path) : {}), ...value});
    },
  });
  const firestore = {
    doc,
    runTransaction: async (operation: (tx: unknown) => unknown) =>
      operation({
        get: async (ref: {path: string}) => snapshot(ref.path),
        set: (
          ref: {path: string},
          value: Record<string, unknown>,
          options?: {merge?: boolean},
        ) => {
          values.set(ref.path, {
            ...(options?.merge ? values.get(ref.path) : {}),
            ...value,
          });
        },
      }),
    recursiveDelete: async (ref: {path: string}) => {
      calls.push(`firestore:${ref.path}`);
      for (const key of values.keys()) {
        if (key === ref.path || key.startsWith(`${ref.path}/`)) {
          values.delete(key);
        }
      }
    },
    collection: () => ({where: () => ({get: async () => ({docs: []})})}),
  } as unknown as Firestore;
  let failure = false;
  const repository = new FirestoreAccountPrivacyRepository(
    firestore,
    {
      deleteFiles: async (options: {prefix: string}) => {
        calls.push(`storage:${options.prefix}`);
        if (failure) {
          failure = false;
          throw new Error('storage unavailable');
        }
      },
    } as unknown as Bucket,
    {
      deleteUser: async uid => {
        calls.push(`auth:${uid}`);
      },
      revokeRefreshTokens: async () => {},
    },
  );
  return {
    values,
    calls,
    repository,
    firestore,
    failStorage: () => {
      failure = true;
    },
  };
};
test('account deletion removes recursive data, images and vault before auth and preserves other owners', async () => {
  const f = fixture();
  f.values.set('users/A/workspaces/w/journalEntries/e', {health: 'A'});
  f.values.set('privateCredentialVault/A/secrets/nightscout', {secret: 'A'});
  f.values.set('users/B/workspaces/w/journalEntries/e', {health: 'B'});
  const receipt = await f.repository.issueDeletionReceipt('A');
  await f.repository.deleteAccount('A', receipt);
  assert.equal(f.values.has('users/A/workspaces/w/journalEntries/e'), false);
  assert.equal(
    f.values.has('privateCredentialVault/A/secrets/nightscout'),
    false,
  );
  assert.equal(f.values.has('users/B/workspaces/w/journalEntries/e'), true);
  assert.equal(f.calls.at(-1), 'auth:A');
  await f.repository.finishDeletion(receipt);
  assert.equal(f.calls.filter(call => call === 'auth:A').length, 1);
});
test('partial failure leaves deletion locked and receipt can resume without auth', async () => {
  const f = fixture();
  const receipt = await f.repository.issueDeletionReceipt('A');
  f.failStorage();
  await assert.rejects(
    f.repository.deleteAccount('A', receipt),
    /storage unavailable/,
  );
  assert.equal(await f.repository.isDeleting('A'), true);
  assert.equal(
    f.calls.some(call => call === 'auth:A'),
    false,
  );
  await f.repository.finishDeletion(receipt);
  assert.equal(f.calls.at(-1), 'auth:A');
});
test('unstarted receipts cannot resume, expire, and cannot be reassigned to another account', async () => {
  const f = fixture();
  const receipt = await f.repository.issueDeletionReceipt('A');
  await assert.rejects(f.repository.finishDeletion(receipt));
  await assert.rejects(f.repository.deleteAccount('B', receipt));
  for (const value of f.values.values()) {
    if (value.uid === 'A') {
      value.issuedAtMs = 1;
    }
  }
  await assert.rejects(f.repository.deleteAccount('A', receipt));
  const renewed = await f.repository.issueDeletionReceipt('A');
  await f.repository.deleteAccount('A', renewed);
});
test('delayed credential writes cannot resurrect a deleted account or bypass withdrawal', async () => {
  const f = fixture();
  const path = 'privateCredentialVault/A/secrets/llm-openai';
  f.values.set('users/A/privacy/consent', {
    policyVersion: PRIVACY_POLICY_VERSION,
    cloudSync: true,
  });
  await writePrivateCredential(f.firestore, 'A', path, {
    credential: 'encrypted',
  });
  f.values.set('privateAccountState/A', {deleting: true});
  await assert.rejects(
    writePrivateCredential(f.firestore, 'A', path, {credential: 'late'}),
  );
  assert.equal(f.values.get(path)?.credential, 'encrypted');
  f.values.delete('privateAccountState/A');
  f.values.set('users/A/privacy/consent', {
    policyVersion: PRIVACY_POLICY_VERSION,
    cloudSync: false,
  });
  await assert.rejects(
    writePrivateCredential(f.firestore, 'A', path, {credential: 'withdrawn'}),
  );
});
