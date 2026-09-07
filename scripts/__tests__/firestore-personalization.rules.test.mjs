import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {deleteDoc, doc, getDoc, setDoc} from 'firebase/firestore';

const projectId = 'shani-personalization-rules-test';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const separator = emulatorAddress.lastIndexOf(':');
const host = emulatorAddress.slice(0, separator);
const port = Number(emulatorAddress.slice(separator + 1));
let environment;

const target = destinationId => ({
  schemaVersion: 1,
  destinationId,
});

const account = ({revision = 1, savedAt = 10, extraValue = {}} = {}) => ({
  schemaVersion: 1,
  documentKind: 'account_personalization',
  ownerProductUserId: 'owner-1',
  revision,
  mutationId: `account_${revision}`,
  savedAt,
  value: {
    schemaVersion: 1,
    favorites: [target('core.trends')],
    hiddenModules: [],
    ...extraValue,
  },
});

const layout = ({layoutName = 'phone', revision = 1, savedAt = 10} = {}) => ({
  schemaVersion: 1,
  documentKind: 'layout_personalization',
  ownerProductUserId: 'owner-1',
  layout: layoutName,
  revision,
  mutationId: `${layoutName}_${revision}`,
  savedAt,
  value: {
    schemaVersion: 1,
    layout: layoutName,
    showCurrentSnapshot: false,
    showRecents: true,
    showGri: false,
    shell: {
      schemaVersion: 1,
      shortcuts: [target('core.ai-analyst')],
    },
  },
});

const workspace = ({
  workspaceId = 'workspace-1',
  sourceId = 'nightscout-1',
  revision = 1,
  savedAt = 10,
} = {}) => ({
  schemaVersion: 1,
  documentKind: 'workspace_personalization',
  ownerProductUserId: 'owner-1',
  workspaceId,
  nightscoutSourceId: sourceId,
  revision,
  mutationId: `workspace_${revision}`,
  savedAt,
  value: {
    schemaVersion: 1,
    questionnaire: {schemaVersion: 1, status: 'not-started'},
  },
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

test('owner can create and read Account, Workspace, and each Layout scope', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const paths = [
    ['users/owner-1/productPersonalization/account', account()],
    ['users/owner-1/productPersonalization/layout_phone', layout()],
    [
      'users/owner-1/productPersonalization/layout_tablet',
      layout({layoutName: 'tablet'}),
    ],
    [
      'users/owner-1/productPersonalization/layout_desktop',
      layout({layoutName: 'desktop'}),
    ],
    [
      'users/owner-1/workspaces/workspace-1/productPersonalization/current',
      workspace(),
    ],
  ];

  for (const [path, value] of paths) {
    await assertSucceeds(setDoc(doc(database, path), value));
    await assertSucceeds(getDoc(doc(database, path)));
  }
});

test('anonymous and cross-owner clients cannot read or write', async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const other = environment.authenticatedContext('owner-2').firestore();
  const path = 'users/owner-1/productPersonalization/account';

  await assertFails(getDoc(doc(anonymous, path)));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(setDoc(doc(anonymous, path), account()));
  await assertFails(setDoc(doc(other, path), account()));
});

test('chart preferences accept only presentation fields and supported modes and windows', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const reference = doc(
    database,
    'users/owner-1/productPersonalization/layout_phone',
  );
  let revision = 1;
  for (const mode of ['separate', 'mixed']) {
    for (const windowHours of ['full-day', 3, 6, 12]) {
      const valid = layout({revision, savedAt: revision});
      valid.value.dayGraph = {schemaVersion: 1, mode, windowHours};
      await assertSucceeds(setDoc(reference, valid));
      revision += 1;
    }
  }
  const valid = {schemaVersion: 1, mode: 'mixed', windowHours: 6};
  for (const dayGraph of [
    null,
    [],
    {...valid, schemaVersion: 2},
    {...valid, mode: 'unknown'},
    {...valid, windowHours: 24},
    {...valid, windowHours: '6'},
    {...valid, atMs: 123},
    {...valid, glucose: 120},
    {...valid, apiKey: 'not-allowed'},
    {schemaVersion: 1, mode: 'mixed'},
  ]) {
    const invalid = layout({revision, savedAt: revision});
    invalid.value.dayGraph = dayGraph;
    await assertFails(setDoc(reference, invalid));
  }
});

test('Daily Overview preferences allow every presentation and require all cards exactly once', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const reference = doc(
    database,
    'users/owner-1/productPersonalization/layout_phone',
  );
  const cardOrder = ['mean', 'ranges', 'coverage', 'glucose', 'insulin'];
  let revision = 1;
  for (const rangeStyle of ['ring', 'bar', 'list']) {
    const valid = layout({revision, savedAt: revision});
    valid.value.dailyOverview = {schemaVersion: 1, rangeStyle, cardOrder};
    await assertSucceeds(setDoc(reference, valid));
    revision += 1;
  }
  const valid = {schemaVersion: 1, rangeStyle: 'ring', cardOrder};
  for (const dailyOverview of [
    null,
    [],
    {...valid, schemaVersion: 2},
    {...valid, rangeStyle: 'unknown'},
    {...valid, cardOrder: []},
    {...valid, cardOrder: cardOrder.slice(1)},
    {...valid, cardOrder: ['mean', 'ranges', 'coverage', 'glucose', 'glucose']},
    {...valid, cardOrder: ['mean', 'ranges', 'coverage', 'glucose', 'unknown']},
    {...valid, cardOrder: [...cardOrder, 'coverage']},
    {...valid, dayStartMs: 123},
    {...valid, glucose: 120},
    {...valid, apiKey: 'not-allowed'},
    {schemaVersion: 1, rangeStyle: 'ring'},
  ]) {
    const invalid = layout({revision, savedAt: revision});
    invalid.value.dailyOverview = dailyOverview;
    await assertFails(setDoc(reference, invalid));
  }
});

test('revisions advance monotonically and preference documents cannot be deleted', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  const path = 'users/owner-1/productPersonalization/account';
  await assertSucceeds(setDoc(doc(database, path), account()));
  await assertSucceeds(
    setDoc(doc(database, path), account({revision: 2, savedAt: 11})),
  );
  await assertFails(
    setDoc(doc(database, path), account({revision: 3, savedAt: 9})),
  );
  await assertFails(
    setDoc(doc(database, path), account({revision: 4, savedAt: 12})),
  );
  await assertFails(deleteDoc(doc(database, path)));
});

test('rules reject unknown fields, credentials, and mismatched scoped payloads', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertFails(
    setDoc(doc(database, 'users/owner-1/productPersonalization/account'), {
      ...account(),
      apiKey: 'secret',
    }),
  );
  await assertFails(
    setDoc(
      doc(database, 'users/owner-1/productPersonalization/account'),
      account({extraValue: {glucose: 62}}),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, 'users/owner-1/productPersonalization/account'),
      account({
        extraValue: {
          favorites: [{...target('core.trends'), apiKey: 'nested-secret'}],
        },
      }),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, 'users/owner-1/productPersonalization/account'),
      account({
        extraValue: {
          hiddenModules: [{schemaVersion: 1, destinationId: '../escape'}],
        },
      }),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, 'users/owner-1/productPersonalization/layout_phone'),
      layout({layoutName: 'tablet'}),
    ),
  );
  await assertFails(
    setDoc(
      doc(
        database,
        'users/owner-1/workspaces/workspace-1/productPersonalization/current',
      ),
      workspace({workspaceId: 'workspace-2'}),
    ),
  );
  await assertFails(
    setDoc(doc(database, 'productPersonalization/account'), account()),
  );
});
