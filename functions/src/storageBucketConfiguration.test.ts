import assert from 'node:assert/strict';
import test from 'node:test';
import {deleteApp, initializeApp} from 'firebase-admin/app';
import {getStorage} from 'firebase-admin/storage';
import {configuredStorageBucketName} from './storageBucketConfiguration';

test('omitted or blank storage configuration keeps the Firebase default', () => {
  for (const value of [undefined, '', '  \n\t']) {
    assert.equal(configuredStorageBucketName(value), undefined);
  }
});

test('explicit storage configuration uses the existing bucket after trimming', () => {
  assert.equal(
    configuredStorageBucketName('  shanidms-3a065.appspot.com  '),
    'shanidms-3a065.appspot.com',
  );
});

test('the Admin SDK keeps its app default when no explicit bucket is supplied', async () => {
  const app = initializeApp(
    {projectId: 'bucket-configuration-test', storageBucket: 'default-bucket.test'},
    'storage-bucket-default-test',
  );
  try {
    assert.equal(
      getStorage(app).bucket(configuredStorageBucketName(undefined)).name,
      'default-bucket.test',
    );
  } finally {
    await deleteApp(app);
  }
});

test('the Admin SDK can select the explicit bucket without an app default', async () => {
  const app = initializeApp(
    {projectId: 'bucket-configuration-test'},
    'storage-bucket-explicit-test',
  );
  try {
    assert.equal(
      getStorage(app).bucket(
        configuredStorageBucketName('shanidms-3a065.appspot.com'),
      ).name,
      'shanidms-3a065.appspot.com',
    );
  } finally {
    await deleteApp(app);
  }
});

test('storage configuration rejects URLs, object paths, and embedded whitespace', () => {
  for (const value of [
    'gs://shanidms-3a065.appspot.com',
    'https://storage.googleapis.com/shanidms-3a065.appspot.com',
    'shanidms-3a065.appspot.com/users',
    'shanidms-3a065.appspot.com bucket',
  ]) {
    assert.throws(
      () => configuredStorageBucketName(value),
      /STORAGE_BUCKET_NAME must be a bare Cloud Storage bucket name/,
    );
  }
});
