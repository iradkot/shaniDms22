import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {findCredentialFileViolations} from './credential-file-policy.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptsDirectory, '..');
const args = process.argv.slice(2);

if (args.length !== 0 && (args.length !== 2 || args[0] !== '--repo')) {
  console.error(
    'Usage: node scripts/check-credential-history.mjs [--repo <repository>]',
  );
  process.exit(2);
}

const projectRoot =
  args.length === 2 ? path.resolve(args[1]) : defaultProjectRoot;
const git = spawnSync(
  'git',
  ['log', '--all', '--format=', '--name-only', '-z'],
  {cwd: projectRoot, encoding: 'utf8'},
);

if (git.error) {
  throw git.error;
}
if (git.status !== 0) {
  throw new Error(git.stderr.trim() || 'Unable to inspect Git history.');
}

const violations = findCredentialFileViolations(
  git.stdout.split('\0').map(value => value.trim()).filter(Boolean),
);
if (violations.length > 0) {
  console.error(
    `Credential filenames remain in Git history:\n${violations
      .map(filePath => `- ${filePath}`)
      .join(
        '\n',
      )}\nRotate every exposed credential before rewriting shared history. Follow docs/SECRET_ROTATION_AND_HISTORY_REWRITE.md.`,
  );
  process.exit(1);
}

console.log('Git history credential filename check passed.');
