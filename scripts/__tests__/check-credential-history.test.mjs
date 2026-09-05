import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDirectory, '..', '..');
const currentScanner = path.join(
  projectRoot,
  'scripts',
  'check-tracked-credentials.mjs',
);
const historyScanner = path.join(
  projectRoot,
  'scripts',
  'check-credential-history.mjs',
);

const run = (repo, command, args) =>
  spawnSync(command, args, {cwd: repo, encoding: 'utf8'});

test('finds a deleted credential in history after the current index is clean', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'shani-history-check-'));
  const secretPath = 'ios/fastlane/.env.default';
  try {
    assert.equal(run(repo, 'git', ['init', '--quiet']).status, 0);
    run(repo, 'git', ['config', 'user.email', 'test@example.invalid']);
    run(repo, 'git', ['config', 'user.name', 'Credential Test']);
    const absoluteSecret = path.join(repo, secretPath);
    mkdirSync(path.dirname(absoluteSecret), {recursive: true});
    writeFileSync(absoluteSecret, 'SECRET=value', 'utf8');
    assert.equal(run(repo, 'git', ['add', '--all']).status, 0);
    assert.equal(run(repo, 'git', ['commit', '--quiet', '-m', 'add']).status, 0);
    unlinkSync(absoluteSecret);
    assert.equal(run(repo, 'git', ['add', '--all']).status, 0);
    assert.equal(run(repo, 'git', ['commit', '--quiet', '-m', 'remove']).status, 0);

    assert.equal(
      run(repo, process.execPath, [currentScanner, '--repo', repo]).status,
      0,
    );
    const history = run(repo, process.execPath, [
      historyScanner,
      '--repo',
      repo,
    ]);
    assert.notEqual(history.status, 0);
    assert.match(`${history.stdout}\n${history.stderr}`, /\.env\.default/);
  } finally {
    rmSync(repo, {recursive: true, force: true});
  }
});
