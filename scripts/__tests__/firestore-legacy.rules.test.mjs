import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {doc, getDoc, serverTimestamp, setDoc} from 'firebase/firestore';

const projectId = 'shani-legacy-rules-test';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const separator = emulatorAddress.lastIndexOf(':');
const host = emulatorAddress.slice(0, separator);
const port = Number(emulatorAddress.slice(separator + 1));
let environment;

const userDocument = () => ({
  schemaVersion: 1,
  ownerProductUserId: 'owner-1',
  userId: 'owner-1',
  email: 'owner@example.com',
  phoneTokens: ['fcm-token'],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const foodDocument = () => ({
  schemaVersion: 1,
  ownerProductUserId: 'owner-1',
  id: 'meal-1',
  carbs: 35,
  name: 'Lunch',
  image: 'https://storage.example/meal-1.jpg',
  notes: '',
  score: 80,
  timestamp: 1_700_000_000_000,
  tags: ['home'],
});

const sportDocument = () => ({
  schemaVersion: 1,
  ownerProductUserId: 'owner-1',
  name: 'Walk',
  durationMinutes: 30,
  intensity: 2,
  startTimestamp: 1_700_000_000_000,
  endTimestamp: 1_700_001_800_000,
});

before(async () => {
  assert.ok(Number.isInteger(port) && port > 0, 'Invalid emulator port.');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port,
      rules: await readFile(
        new URL('../../firestore.rules', import.meta.url),
        'utf8',
      ),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
});

after(async () => {
  await environment.cleanup();
});

test('owner can create the strict account and legacy bridge documents', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const documents = [
    ['users/owner-1', userDocument()],
    ['users/owner-1/legacyFoodItems/meal-1', foodDocument()],
    ['users/owner-1/legacySportItems/activity-1', sportDocument()],
  ];
  for (const [path, value] of documents) {
    await assertSucceeds(setDoc(doc(database, path), value));
    await assertSucceeds(getDoc(doc(database, path)));
  }
});

test('owner can migrate a legacy account document without changing its creation time', async () => {
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/owner-1'), {
      userId: 'owner-1',
      email: 'owner@example.com',
      phoneToken: 'legacy-token',
      createdAt,
    });
  });
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertSucceeds(
    setDoc(doc(database, 'users/owner-1'), {
      ...userDocument(),
      createdAt,
      phoneTokens: ['legacy-token'],
    }),
  );
});

test('anonymous and cross-owner clients cannot access user documents', async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const other = environment.authenticatedContext('owner-2').firestore();
  for (const path of [
    'users/owner-1',
    'users/owner-1/legacyFoodItems/meal-1',
    'users/owner-1/legacySportItems/activity-1',
  ]) {
    await assertFails(getDoc(doc(anonymous, path)));
    await assertFails(getDoc(doc(other, path)));
  }
  await assertFails(
    setDoc(
      doc(other, 'users/owner-1/legacyFoodItems/meal-1'),
      foodDocument(),
    ),
  );
});

test('strict schemas reject credentials, unknown fields and owner mismatches', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertFails(
    setDoc(doc(database, 'users/owner-1'), {
      ...userDocument(),
      nightscoutApiKey: 'must-never-be-here',
    }),
  );
  await assertFails(
    setDoc(doc(database, 'users/owner-1/legacyFoodItems/meal-1'), {
      ...foodDocument(),
      ownerProductUserId: 'owner-2',
    }),
  );
  await assertFails(
    setDoc(doc(database, 'users/owner-1/legacySportItems/activity-1'), {
      ...sportDocument(),
      unexpected: true,
    }),
  );
});

test('client SDKs can never access the server-only credential vault', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const path = 'privateCredentialVault/owner-1/secrets/nightscout';
  await assertFails(getDoc(doc(database, path)));
  await assertFails(
    setDoc(doc(database, path), {apiKey: 'must-never-be-client-visible'}),
  );
});
