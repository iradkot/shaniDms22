import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
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
const scannerPath = path.join(
  projectRoot,
  'scripts',
  'check-tracked-credentials.mjs',
);

function run(repo, command, args) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function createIndexedRepository(files) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'shani-credential-check-'));
  run(repo, 'git', ['init', '--quiet']);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repo, relativePath);
    mkdirSync(path.dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, contents, 'utf8');
  }

  const add = run(repo, 'git', ['add', '--all']);
  assert.equal(add.status, 0, add.stderr);
  return repo;
}

test('fails when a credential filename remains in the Git index after its working-tree file is deleted', () => {
  const fixture = JSON.parse(
    readFileSync(
      path.join(
        testsDirectory,
        'fixtures',
        'credential-scanner',
        'tracked-secret-deleted.json',
      ),
      'utf8',
    ),
  );
  const repo = createIndexedRepository({
    [fixture.trackedPath]: fixture.contents,
  });

  try {
    unlinkSync(path.join(repo, fixture.trackedPath));

    const result = run(repo, process.execPath, [scannerPath, '--repo', repo]);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0);
    assert.ok(output.includes(fixture.trackedPath));
    assert.ok(
      output.includes(
        `git rm --cached -- ${JSON.stringify(fixture.trackedPath)}`,
      ),
    );
  } finally {
    rmSync(repo, {recursive: true, force: true});
  }
});
