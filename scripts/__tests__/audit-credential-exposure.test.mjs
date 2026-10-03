import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {auditCredentialHistory, credentialFieldInventory} from '../audit-credential-exposure.mjs';

test('reports field names without retaining or outputting secret values', () => {
  const secret = `sk-proj-${'A'.repeat(35)}`;
  const fields = credentialFieldInventory(`OPENAI_API_KEY=${secret}\nNIGHTSCOUT_API_SECRET=top-secret\n{"client_secret":"sensitive-oauth"}`);
  const rendered = JSON.stringify(fields);
  assert.ok(fields.some(field => field.name === 'OPENAI_API_KEY'));
  assert.ok(fields.some(field => field.name === 'client_secret'));
  for (const value of [secret, 'top-secret', 'sensitive-oauth']) assert.ok(!rendered.includes(value));
});

test('finds credentials that have been deleted from the current tree', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'shani-credential-audit-'));
  const git = args => {
    const result = spawnSync('git', args, {cwd: repo, encoding: 'utf8'});
    assert.equal(result.status, 0);
  };
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'Credential audit test']);
    writeFileSync(path.join(repo, '.env'), 'NIGHTSCOUT_API_SECRET=fixture-only\n');
    git(['add', '.env']);
    git(['commit', '-qm', 'fixture']);
    git(['rm', '.env']);
    git(['commit', '-qm', 'remove']);
    const report = auditCredentialHistory(repo);
    assert.equal(report.status, 'rotation-review-required');
    assert.equal(report.files[0].path, '.env');
    assert.ok(report.files[0].fields.some(field => field.name === 'NIGHTSCOUT_API_SECRET'));
    assert.ok(!JSON.stringify(report).includes('fixture-only'));
  } finally {
    assert.ok(path.resolve(repo).startsWith(path.join(path.resolve(tmpdir()), 'shani-credential-audit-')));
    rmSync(repo, {recursive: true, force: true});
  }
});
