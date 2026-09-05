import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'shani-journal-rules-test';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const separator = emulatorAddress.lastIndexOf(':');
const host = emulatorAddress.slice(0, separator);
const port = Number(emulatorAddress.slice(separator + 1));
let environment;

const journalPaths = (owner, workspace, entryId, operationId) => ({
  entry: `users/${owner}/workspaces/${workspace}/journalEntries/${entryId}`,
  operation: `users/${owner}/workspaces/${workspace}/journalOperations/${operationId}`,
});

const upsert = ({
  owner = 'owner-1',
  workspace = 'workspace-1',
  operationId = 'operation-1',
  revision = 1,
  baseRevision = null,
  externalLinks = [],
  tags = [],
  image = {kind: 'none'},
  entityId = 'meal-1',
} = {}) => ({
  schemaVersion: 1,
  changeKind: 'upsert',
  operationId,
  baseRevision,
  localRevision: revision,
  changedFields: ['name'],
  document: {
    schemaVersion: 1,
    documentKind: 'meal',
    scope: {
      ownerProductUserId: owner,
      workspaceId: workspace,
      nightscoutSourceId: 'nightscout-1',
    },
    entityId,
    revision,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000 + revision,
    lifecycle: {kind: 'active'},
    mealStart: 1_700_000_000_000,
    name: `Meal ${revision}`,
    image,
    tags,
    externalLinks,
  },
});

const purge = ({
  operationId = 'operation-3',
  revision = 3,
  baseRevision = 2,
} = {}) => ({
  schemaVersion: 1,
  changeKind: 'purge',
  operationId,
  baseRevision,
  localRevision: revision,
  changedFields: ['purge'],
  scope: {
    ownerProductUserId: 'owner-1',
    workspaceId: 'workspace-1',
    nightscoutSourceId: 'nightscout-1',
  },
  tombstone: {
    kind: 'journal_tombstone',
    entityKind: 'meal',
    entityId: 'meal-1',
    purgedAt: 1_700_000_100_000,
    revision,
  },
});

const entityIdOf = change =>
  change.changeKind === 'upsert'
    ? change.document.entityId
    : change.tombstone.entityId;

const commitChange = (database, change, pathOwner = 'owner-1') => {
  const entityId = entityIdOf(change);
  const paths = journalPaths(
    pathOwner,
    'workspace-1',
    entityId,
    change.operationId,
  );
  const batch = writeBatch(database);
  batch.set(doc(database, paths.entry), {
    schemaVersion: 1,
    entityId,
    operationId: change.operationId,
    localRevision: change.localRevision,
  });
  batch.set(doc(database, paths.operation), {
    entryId: entityId,
    change,
    committedAt: serverTimestamp(),
  });
  return batch.commit();
};

before(async () => {
  assert.ok(
    Number.isInteger(port) && port > 0,
    'Invalid Firestore emulator port.',
  );
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

test('owner can atomically write and read a valid entry plus operation', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const change = upsert();
  const paths = journalPaths('owner-1', 'workspace-1', 'meal-1', 'operation-1');

  await assertSucceeds(commitChange(database, change));
  await assertSucceeds(getDoc(doc(database, paths.entry)));
  await assertSucceeds(getDoc(doc(database, paths.operation)));
});

test('owner can advance a revision and append a purge, but a stale base is denied', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertSucceeds(commitChange(database, upsert()));
  await assertSucceeds(
    commitChange(
      database,
      upsert({operationId: 'operation-2', revision: 2, baseRevision: 1}),
    ),
  );
  await assertFails(
    commitChange(
      database,
      upsert({operationId: 'operation-stale', revision: 3, baseRevision: 1}),
    ),
  );
  await assertSucceeds(commitChange(database, purge()));
});

test('owner can sync multiple exact external identity links', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const exactLinks = Array.from({length: 2}, (_, index) => {
    const value = `record-${index + 1}`;
    return {
      identity: {
        nightscoutSourceId: 'nightscout-1',
        recordKey: `nightscout-1:_id:${value}`,
        namespace: '_id',
        value,
      },
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
      linkedAt: 1_700_000_000_000 + index,
    };
  });

  await assertSucceeds(
    commitChange(database, upsert({externalLinks: exactLinks})),
  );
});

test('external links reject unknown fields, bad types, identities, roles, timestamps, and excess size', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const validLink = {
    identity: {
      nightscoutSourceId: 'nightscout-1',
      recordKey: 'nightscout-1:_id:record-1',
      namespace: '_id',
      value: 'record-1',
    },
    role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    linkedAt: 1_700_000_000_000,
  };
  const invalidLinks = [
    {...validLink, copiedSnapshot: {carbs: 20}},
    {...validLink, identity: 'record-1'},
    {
      ...validLink,
      identity: {...validLink.identity, unknown: true},
    },
    {
      ...validLink,
      identity: {...validLink.identity, nightscoutSourceId: 'nightscout-2'},
    },
    {
      ...validLink,
      identity: {...validLink.identity, recordKey: 'wrong-key'},
    },
    {
      ...validLink,
      identity: {...validLink.identity, namespace: 'timestamp'},
    },
    {
      ...validLink,
      identity: {...validLink.identity, value: 'x'.repeat(513)},
    },
    {...validLink, role: {kind: 'reported_carbohydrate', purpose: 'bolus'}},
    {...validLink, role: {kind: 'activity'}},
    {
      ...validLink,
      role: {kind: 'reported_carbohydrate', purpose: 'meal', extra: true},
    },
    {...validLink, linkedAt: '1700000000000'},
    {...validLink, linkedAt: 0},
  ];

  for (const externalLink of invalidLinks) {
    await assertFails(
      commitChange(database, upsert({externalLinks: [externalLink]})),
    );
  }
  await assertFails(
    commitChange(
      database,
      upsert({externalLinks: Array.from({length: 3}, () => validLink)}),
    ),
  );

  const mealDocument = upsert({externalLinks: [validLink]}).document;
  const {mealStart, name, image, ...activityBase} = mealDocument;
  void mealStart;
  void name;
  void image;
  await assertFails(
    commitChange(database, {
      ...upsert(),
      changedFields: ['externalLinks'],
      document: {
        ...activityBase,
        documentKind: 'activity',
        category: 'walking',
        startedAt: 1_700_000_000_000,
      },
    }),
  );
});

test('tags reject invalid element types, empty or oversized values, and excess size', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();

  await assertFails(commitChange(database, upsert({tags: [42]})));
  await assertFails(commitChange(database, upsert({tags: ['']})));
  await assertFails(commitChange(database, upsert({tags: ['x'.repeat(81)]})));
  await assertFails(
    commitChange(
      database,
      upsert({tags: Array.from({length: 9}, (_, index) => `tag-${index}`)}),
    ),
  );
  await assertSucceeds(
    commitChange(
      database,
      upsert({tags: Array.from({length: 8}, (_, index) => `tag-${index}`)}),
    ),
  );
});

test('stored meal images require an immutable safe object identity and metadata', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const validImage = {
    kind: 'stored',
    objectName: `image_${'a'.repeat(32)}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 240000,
    widthPx: 1280,
    heightPx: 960,
  };
  await assertSucceeds(commitChange(database, upsert({image: validImage})));

  const invalidImages = [
    {...validImage, objectName: '../escape.jpg'},
    {...validImage, mimeType: 'text/html'},
    {...validImage, byteSize: 10485761},
    {...validImage, widthPx: 0},
    {...validImage, downloadUrl: 'https://secret.example/image'},
  ];
  for (const [index, image] of invalidImages.entries()) {
    await assertFails(
      commitChange(
        database,
        upsert({
          operationId: `invalid-${index}`,
          entityId: `invalid-meal-${index}`,
          image,
        }),
      ),
    );
  }
});

test('a purge can compact prior health snapshots to immutable digest markers', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const first = upsert();
  const second = upsert({
    operationId: 'operation-2',
    revision: 2,
    baseRevision: 1,
  });
  await assertSucceeds(commitChange(database, first));
  await assertSucceeds(commitChange(database, second));
  const firstPaths = journalPaths(
    'owner-1',
    'workspace-1',
    'meal-1',
    first.operationId,
  );
  const secondPaths = journalPaths(
    'owner-1',
    'workspace-1',
    'meal-1',
    second.operationId,
  );
  const firstStored = (
    await getDoc(doc(database, firstPaths.operation))
  ).data();
  const secondStored = (
    await getDoc(doc(database, secondPaths.operation))
  ).data();
  const purgeChange = purge();
  const purgePaths = journalPaths(
    'owner-1',
    'workspace-1',
    'meal-1',
    purgeChange.operationId,
  );
  const compacted = (change, committedAt, contentDigest) => ({
    entryId: 'meal-1',
    committedAt,
    compactedChange: {
      schemaVersion: 1,
      operationId: change.operationId,
      changeKind: change.changeKind,
      baseRevision: change.baseRevision,
      localRevision: change.localRevision,
      changedFields: change.changedFields,
      contentDigest,
    },
  });
  const purgeBatch = writeBatch(database);
  purgeBatch.set(doc(database, purgePaths.entry), {
    schemaVersion: 1,
    entityId: 'meal-1',
    operationId: purgeChange.operationId,
    localRevision: purgeChange.localRevision,
  });
  purgeBatch.set(doc(database, purgePaths.operation), {
    entryId: 'meal-1',
    change: purgeChange,
    committedAt: serverTimestamp(),
  });
  await assertSucceeds(purgeBatch.commit());
  await assertSucceeds(setDoc(
    doc(database, firstPaths.operation),
    compacted(first, firstStored.committedAt, 'a'.repeat(64)),
  ));
  await assertSucceeds(setDoc(
    doc(database, secondPaths.operation),
    compacted(second, secondStored.committedAt, 'b'.repeat(64)),
  ));
});

test('unauthenticated and cross-owner clients cannot read or write', async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const otherOwner = environment.authenticatedContext('owner-2').firestore();
  const paths = journalPaths('owner-1', 'workspace-1', 'meal-1', 'operation-1');

  await assertFails(getDoc(doc(anonymous, paths.entry)));
  await assertFails(getDoc(doc(otherOwner, paths.entry)));
  await assertFails(commitChange(anonymous, upsert()));
  await assertFails(commitChange(otherOwner, upsert()));
});

test('scope must match both authenticated owner and workspace path', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();

  await assertFails(commitChange(database, upsert({owner: 'owner-2'})));
  await assertFails(commitChange(database, upsert({workspace: 'workspace-2'})));
});

test('entry and operation must be written together and operation is immutable', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const change = upsert();
  const paths = journalPaths('owner-1', 'workspace-1', 'meal-1', 'operation-1');

  await assertFails(setDoc(doc(database, paths.entry), change));
  await assertSucceeds(commitChange(database, change));
  await assertFails(
    setDoc(doc(database, paths.operation), {
      entryId: 'meal-1',
      change,
      committedAt: serverTimestamp(),
    }),
  );
  const mismatched = upsert({
    operationId: 'operation-2',
    revision: 2,
    baseRevision: 1,
  });
  const mismatchedPaths = journalPaths(
    'owner-1',
    'workspace-1',
    'meal-1',
    'operation-2',
  );
  const mismatchedBatch = writeBatch(database);
  mismatchedBatch.set(doc(database, mismatchedPaths.entry), {
    schemaVersion: 1,
    entityId: 'meal-1',
    operationId: 'operation-2',
    localRevision: 999,
  });
  mismatchedBatch.set(doc(database, mismatchedPaths.operation), {
    entryId: 'meal-1',
    change: mismatched,
    committedAt: serverTimestamp(),
  });
  await assertFails(mismatchedBatch.commit());
  await assertFails(deleteDoc(doc(database, paths.entry)));
  await assertFails(deleteDoc(doc(database, paths.operation)));
});

test('rules reject credentials, local URIs, unknown fields, and unrelated roots', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const paths = journalPaths('owner-1', 'workspace-1', 'meal-1', 'operation-1');
  const leaked = {
    ...upsert(),
    document: {
      ...upsert().document,
      nightscoutApiKey: 'secret',
      image: {kind: 'none', localUri: 'file:///private/photo.jpg'},
    },
  };

  await assertFails(commitChange(database, leaked));
  await assertFails(
    setDoc(doc(database, 'users/owner-1/nightscoutCredentials/current'), {
      apiKey: 'secret',
    }),
  );
  await assertFails(
    setDoc(doc(database, 'journalEntries/meal-1'), {
      copiedFrom: paths.entry,
    }),
  );
});
