import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const projectId = 'shani-meal-images-rules-test';
const emulatorAddress =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
const separator = emulatorAddress.lastIndexOf(':');
const host = emulatorAddress.slice(0, separator);
const port = Number(emulatorAddress.slice(separator + 1));
let environment;

const objectPath =
  'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';
const metadata = {
  contentType: 'image/jpeg',
  customMetadata: {
    schemaVersion: '1',
    ownerProductUserId: 'owner-1',
    workspaceId: 'workspace-1',
    mealId: 'meal-1',
    objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
  },
};

before(async () => {
  assert.ok(Number.isInteger(port) && port > 0, 'Invalid Storage port.');
  environment = await initializeTestEnvironment({
    projectId,
    storage: {
      host,
      port,
      rules: await readFile(
        new URL('../../storage.rules', import.meta.url),
        'utf8',
      ),
    },
  });
});

beforeEach(async () => {
  await environment.clearStorage();
});

after(async () => {
  await environment.cleanup();
});

test('owner can create, read and delete a valid immutable Meal Image', async () => {
  const storage = environment.authenticatedContext('owner-1').storage();
  const image = ref(storage, objectPath);

  await assertSucceeds(uploadBytes(image, new Uint8Array([1, 2, 3]), metadata));
  await assertSucceeds(getBytes(image));
  await assertFails(uploadBytes(image, new Uint8Array([4, 5]), metadata));
  await assertSucceeds(deleteObject(image));
});

test('anonymous and cross-owner clients cannot read, create or delete', async () => {
  const owner = environment.authenticatedContext('owner-1').storage();
  await assertSucceeds(
    uploadBytes(ref(owner, objectPath), new Uint8Array([1, 2, 3]), metadata),
  );

  for (const context of [
    environment.unauthenticatedContext(),
    environment.authenticatedContext('owner-2'),
  ]) {
    const image = ref(context.storage(), objectPath);
    await assertFails(getBytes(image));
    await assertFails(uploadBytes(image, new Uint8Array([1]), metadata));
    await assertFails(deleteObject(image));
  }
});

test('rules reject wrong type, metadata, path and files over 10 MB', async () => {
  const storage = environment.authenticatedContext('owner-1').storage();
  const validRef = ref(storage, objectPath);
  const invalidMetadata = [
    {...metadata, contentType: 'application/pdf'},
    {
      ...metadata,
      customMetadata: {...metadata.customMetadata, workspaceId: 'other'},
    },
    {
      ...metadata,
      customMetadata: {...metadata.customMetadata, mealId: 'other'},
    },
    {
      ...metadata,
      customMetadata: {...metadata.customMetadata, schemaVersion: '2'},
    },
  ];
  for (const candidate of invalidMetadata) {
    await assertFails(uploadBytes(validRef, new Uint8Array([1]), candidate));
  }
  await assertFails(
    uploadBytes(
      validRef,
      new Uint8Array(10 * 1024 * 1024 + 1),
      metadata,
    ),
  );
  await assertFails(
    uploadBytes(
      ref(storage, 'mealImages/unscoped.jpg'),
      new Uint8Array([1]),
      metadata,
    ),
  );
  await assertFails(
    uploadBytes(
      ref(
        storage,
        'users/owner-1/workspaces/workspace-1/mealImages/meal-1/escape.exe',
      ),
      new Uint8Array([1]),
      metadata,
    ),
  );
});
