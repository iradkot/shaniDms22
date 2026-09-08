import assert from 'node:assert/strict';
import test from 'node:test';
import {LEGACY_FIRESTORE_RULES, hardenDeployedVaultRules, protectVaultRules} from '../harden-vault-rules.mjs';

test('excludes the entire vault root from the existing blanket grant', () => {
  const hardened = protectVaultRules(LEGACY_FIRESTORE_RULES);
  assert.match(hardened, /match \/\{collection\}\/\{document=\*\*\}/);
  assert.match(hardened, /collection != 'privateCredentialVault' && request.auth != null/);
  assert.equal(hardened.includes('match /{document=**}'), false);
  assert.equal(hardened.split('match /databases/{database}/documents/notifications')[1],
    LEGACY_FIRESTORE_RULES.split('match /databases/{database}/documents/notifications')[1]);
});

test('is idempotent and supports Windows source line endings', () => {
  const hardened = protectVaultRules(LEGACY_FIRESTORE_RULES);
  assert.equal(protectVaultRules(hardened), hardened);
  assert.equal(protectVaultRules(LEGACY_FIRESTORE_RULES.replaceAll('\n', '\r\n')), hardened);
});

test('refuses unfamiliar rules rather than replacing other access controls', () => {
  for (const source of [
    '',
    LEGACY_FIRESTORE_RULES.replace('request.auth != null', 'true'),
    LEGACY_FIRESTORE_RULES.replace("rules_version = '2';", "rules_version = '1';"),
    LEGACY_FIRESTORE_RULES.replace('allow write: if true;', 'allow read, write: if true;'),
    LEGACY_FIRESTORE_RULES + '\n// Unreviewed additional source',
  ]) assert.throws(() => protectVaultRules(source), /unfamiliar/i);
});

const project = 'shani-test-project';
const release = {rulesetName: `projects/${project}/rulesets/old`, updateTime: 'original-time'};
const ruleset = content => ({source: {files: [{name: 'firestore.rules', content}]}});
const reply = value => ({ok: true, status: 200, json: async () => value});

test('review mode performs only reads and never prints its authorization token', async () => {
  const calls = [];
  const reports = [];
  await hardenDeployedVaultRules({projectId: project, oauthToken: 'private-test-token', report: value => reports.push(value),
    fetchImpl: async (url, init) => {
      calls.push({url, init});
      return reply(url.endsWith('/cloud.firestore') ? release : ruleset(LEGACY_FIRESTORE_RULES));
    }});
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.init.method === 'GET'), true);
  assert.equal(reports.join('\n').includes('private-test-token'), false);
});

test('refuses to switch the release if another deployment intervenes', async () => {
  const calls = [];
  const responses = [release, ruleset(LEGACY_FIRESTORE_RULES), {name: `projects/${project}/rulesets/new`},
    ruleset(protectVaultRules(LEGACY_FIRESTORE_RULES)), {...release, updateTime: 'someone-else-changed-it'}];
  await assert.rejects(hardenDeployedVaultRules({projectId: project, oauthToken: 'private-test-token', apply: true, report: () => {},
    fetchImpl: async (_url, init) => { calls.push(init.method); return reply(responses.shift()); }}), /changed during review/);
  assert.deepEqual(calls, ['GET', 'GET', 'POST', 'GET', 'GET']);
});

test('applies only the reviewed source then confirms the exact active ruleset', async () => {
  const calls = [];
  const newRuleset = `projects/${project}/rulesets/new`;
  const responses = [release, ruleset(LEGACY_FIRESTORE_RULES), {name: newRuleset},
    ruleset(protectVaultRules(LEGACY_FIRESTORE_RULES)), release, {}, {rulesetName: newRuleset}];
  const result = await hardenDeployedVaultRules({projectId: project, oauthToken: 'private-test-token', apply: true, report: () => {},
    fetchImpl: async (url, init) => { calls.push({url, init}); return reply(responses.shift()); }});
  assert.equal(result.rulesetName, newRuleset);
  assert.deepEqual(calls.map(call => call.init.method), ['GET', 'GET', 'POST', 'GET', 'GET', 'PATCH', 'GET']);
  assert.deepEqual(JSON.parse(calls[2].init.body), ruleset(protectVaultRules(LEGACY_FIRESTORE_RULES)));
  assert.deepEqual(JSON.parse(calls[5].init.body), {
    release: {name: `projects/${project}/releases/cloud.firestore`, rulesetName: newRuleset}, updateMask: 'rulesetName',
  });
});
