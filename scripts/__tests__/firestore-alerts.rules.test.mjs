import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {deleteDoc, doc, getDoc, setDoc} from 'firebase/firestore';

const projectId = 'shani-alerts-rules-test';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const separator = emulatorAddress.lastIndexOf(':');
const host = emulatorAddress.slice(0, separator);
const port = Number(emulatorAddress.slice(separator + 1));
let environment;

const rulePath =
  'users/owner-1/workspaces/workspace-1/alertRules/morning-rule';
const updatePath =
  'users/owner-1/workspaces/workspace-1/updateCenterRecords/update-1';
const readPath =
  'users/owner-1/workspaces/workspace-1/updateCenterReadState/update-1';

const alertRule = ({
  revision = 1,
  changedAtMs = 1_700_000_000_000,
  mutationId = `mutation-${revision}`,
  workspaceId = 'workspace-1',
  ownerProductUserId = 'owner-1',
  deleted = false,
} = {}) => ({
  schemaVersion: 1,
  documentKind: 'alert_rule',
  ownerProductUserId,
  workspaceId,
  ruleId: 'morning-rule',
  revision,
  mutationId,
  changedAtMs,
  deleted,
  ...(deleted
    ? {}
    : {
        value: {
          name: 'Morning range',
          enabled: true,
          lowerBoundMgDl: 70,
          upperBoundMgDl: 180,
          activeFromMinute: 360,
          activeToMinute: 720,
          trend: 'any',
        },
      }),
});

const updateRecord = ({
  recordId = 'update-1',
  workspaceId = 'workspace-1',
  ownerProductUserId = 'owner-1',
  kind = 'alert',
  content,
  deepLink,
} = {}) => ({
  schemaVersion: 1,
  documentKind: 'update_center_record',
  ownerProductUserId,
  workspaceId,
  recordId,
  kind,
  occurredAtMs: 1_700_000_000_100,
  content: content ?? {
    kind: 'alert-rule-occurrence',
    rule: {
      id: 'morning-rule',
      name: 'Morning range',
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 360,
      activeToMinute: 720,
      trend: 'any',
    },
    observation: {valueMgDl: 64, trend: 'single-down'},
  },
  ...(deepLink === undefined
    ? {deepLink: {kind: 'alert-occurrence', occurrenceId: recordId}}
    : deepLink === null
      ? {}
      : {deepLink}),
});

const readRecord = ({readAtMs = 1_700_000_000_200} = {}) => ({
  schemaVersion: 1,
  documentKind: 'update_center_read',
  ownerProductUserId: 'owner-1',
  workspaceId: 'workspace-1',
  itemId: 'update-1',
  readAtMs,
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

test('only the scoped owner can create and read alert rules', async () => {
  const owner = environment.authenticatedContext('owner-1').firestore();
  const other = environment.authenticatedContext('owner-2').firestore();
  const anonymous = environment.unauthenticatedContext().firestore();

  await assertSucceeds(setDoc(doc(owner, rulePath), alertRule()));
  await assertSucceeds(getDoc(doc(owner, rulePath)));
  await assertFails(getDoc(doc(other, rulePath)));
  await assertFails(getDoc(doc(anonymous, rulePath)));
  await assertFails(setDoc(doc(other, rulePath), alertRule()));
});

test('mutable rules require exact scope and consecutive revisions', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertSucceeds(setDoc(doc(database, rulePath), alertRule()));
  await assertSucceeds(
    setDoc(
      doc(database, rulePath),
      alertRule({revision: 2, changedAtMs: 1_700_000_000_001}),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, rulePath),
      alertRule({revision: 4, changedAtMs: 1_700_000_000_002}),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, rulePath),
      alertRule({revision: 3, changedAtMs: 1_699_999_999_999}),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, rulePath),
      alertRule({
        revision: 3,
        changedAtMs: 1_700_000_000_002,
        workspaceId: 'workspace-2',
      }),
    ),
  );
  await assertFails(
    setDoc(doc(database, rulePath), {
      ...alertRule({revision: 3, changedAtMs: 1_700_000_000_002}),
      apiKey: 'must-never-be-stored',
    }),
  );
  await assertSucceeds(
    setDoc(
      doc(database, rulePath),
      alertRule({
        revision: 3,
        changedAtMs: 1_700_000_000_002,
        deleted: true,
      }),
    ),
  );
  await assertFails(deleteDoc(doc(database, rulePath)));
});

test('occurrences, reminders and generated updates are immutable', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertSucceeds(setDoc(doc(database, updatePath), updateRecord()));
  await assertSucceeds(
    setDoc(
      doc(
        database,
        'users/owner-1/workspaces/workspace-1/updateCenterRecords/reminder-1',
      ),
      updateRecord({
        recordId: 'reminder-1',
        kind: 'reminder',
        content: {kind: 'message', title: 'Check infusion set'},
        deepLink: {kind: 'day', dayStartMs: 1_700_000_000_000},
      }),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(
        database,
        'users/owner-1/workspaces/workspace-1/updateCenterRecords/generated-1',
      ),
      updateRecord({
        recordId: 'generated-1',
        kind: 'generated-update',
        content: {
          kind: 'message',
          title: 'Daily review is ready',
          body: 'Open the review when convenient.',
        },
        deepLink: null,
      }),
    ),
  );

  await assertFails(
    setDoc(
      doc(database, updatePath),
      updateRecord({
        content: {kind: 'message', title: 'Mutated content'},
      }),
    ),
  );
  await assertFails(deleteDoc(doc(database, updatePath)));
});

test('strict update schemas reject scope mismatches and credential or raw-data fields', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertFails(
    setDoc(
      doc(database, updatePath),
      updateRecord({workspaceId: 'workspace-2'}),
    ),
  );
  await assertFails(
    setDoc(doc(database, updatePath), {
      ...updateRecord(),
      nightscoutApiKey: 'must-never-be-stored',
    }),
  );
  await assertFails(
    setDoc(
      doc(database, updatePath),
      updateRecord({
        content: {
          ...updateRecord().content,
          rawNightscoutEntries: [{sgv: 64}],
        },
      }),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, updatePath),
      updateRecord({
        content: {kind: 'alert-rule-trigger', ruleName: 'Legacy only'},
      }),
    ),
  );
  await assertFails(
    setDoc(
      doc(database, updatePath),
      updateRecord({recordId: 'different-id'}),
    ),
  );
});

test('read state advances separately without changing occurrence content', async () => {
  const database = environment.authenticatedContext('owner-1').firestore();
  await assertSucceeds(setDoc(doc(database, updatePath), updateRecord()));
  const beforeRead = (await getDoc(doc(database, updatePath))).data();

  await assertSucceeds(setDoc(doc(database, readPath), readRecord()));
  await assertSucceeds(
    setDoc(doc(database, readPath), readRecord({readAtMs: 1_700_000_000_201})),
  );
  await assertFails(
    setDoc(doc(database, readPath), readRecord({readAtMs: 1_700_000_000_199})),
  );
  await assertFails(deleteDoc(doc(database, readPath)));

  const afterRead = (await getDoc(doc(database, updatePath))).data();
  assert.deepEqual(afterRead, beforeRead);
});
