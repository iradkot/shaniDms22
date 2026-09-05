import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {findCredentialFileViolations} from './credential-file-policy.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptsDirectory, '..');
const args = process.argv.slice(2);

if (args.length !== 0 && (args.length !== 2 || args[0] !== '--repo')) {
  console.error(
    'Usage: node scripts/check-tracked-credentials.mjs [--repo <repository>]',
  );
  process.exit(2);
}

const projectRoot =
  args.length === 2 ? path.resolve(args[1]) : defaultProjectRoot;
const git = spawnSync('git', ['ls-files', '--cached', '-z'], {
  cwd: projectRoot,
  encoding: 'utf8',
});

if (git.error) {
  throw git.error;
}
if (git.status !== 0) {
  throw new Error(git.stderr.trim() || 'Unable to inspect tracked files.');
}

const trackedFiles = git.stdout.split('\0').filter(Boolean);
const violations = findCredentialFileViolations(trackedFiles);

if (violations.length > 0) {
  const removalCommands = violations
    .map(filePath => `  git rm --cached -- ${JSON.stringify(filePath)}`)
    .join('\n');
  console.error(
    `Potential credential files are present in the Git index:\n${violations
      .map(filePath => `- ${filePath}`)
      .join(
        '\n',
      )}\nRemove them from the index:\n${removalCommands}\nKeep local values in an ignored file and store CI values in encrypted secrets.\nIf a real credential was ever committed, rotate it.`,
  );
  process.exit(1);
}

console.log('Git index credential filename check passed.');
