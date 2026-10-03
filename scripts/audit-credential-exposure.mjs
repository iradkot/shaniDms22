import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {findCredentialFileViolations} from './credential-file-policy.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args, cwd) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (result.status !== 0 || result.error) {
    throw new Error('Could not inspect credential history. No credential contents were printed.');
  }
  return result.stdout;
}

const sensitiveName = name => !/(?:uri|url)$/i.test(name) && /secret|password|private.?key|(?:^|_)token(?:$|_)|api.?key|certificate/i.test(name);
const category = name => {
  if (/nightscout|^ns_/i.test(name)) return 'Nightscout';
  if (/openai|llm|anthropic/i.test(name)) return 'AI provider';
  if (/apple|app_store|certificate|provision|fastlane|match_/i.test(name)) return 'Apple signing';
  if (/keystore|android_key/i.test(name)) return 'Android signing';
  if (/client_secret|google|firebase|service_account/i.test(name)) return 'Google / Firebase';
  return 'Other secret';
};

/** Inspect values in memory only; returned records contain names and categories. */
export function credentialFieldInventory(source) {
  const fields = new Map();
  const record = name => {
    if (sensitiveName(name)) fields.set(name, {
      name,
      category: category(name),
      exposureType: /^EXPO_PUBLIC_FIREBASE_API_KEY$/i.test(name) ? 'public-app-identifier' : 'rotation-review-required',
    });
  };
  for (const match of source.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)) record(match[1]);
  for (const match of source.matchAll(/["']([A-Za-z][A-Za-z0-9_.-]*)["']\s*:/g)) record(match[1]);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
    fields.set('private_key', {name: 'private_key', category: 'Google / Firebase'});
  }
  if (/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/.test(source)) {
    fields.set('provider_key', {name: 'provider_key', category: 'AI provider'});
  }
  return [...fields.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function auditCredentialHistory(cwd = projectRoot) {
  const objects = git(['rev-list', '--objects', '--all'], cwd).trim().split('\n');
  const paths = findCredentialFileViolations(objects.map(line => line.slice(line.indexOf(' ') + 1)));
  const found = new Map(paths.map(file => [file, {path: file, versions: 0, fields: new Map()}]));
  const inspected = new Set();
  for (const line of objects) {
    const separator = line.indexOf(' ');
    if (separator < 0) continue;
    const oid = line.slice(0, separator);
    const file = line.slice(separator + 1);
    const entry = found.get(file);
    if (!entry || inspected.has(oid)) continue;
    const kind = git(['cat-file', '-t', oid], cwd).trim();
    if (kind !== 'blob') continue;
    inspected.add(oid);
    entry.versions += 1;
    for (const field of credentialFieldInventory(git(['cat-file', 'blob', oid], cwd))) {
      entry.fields.set(field.name, field);
    }
  }
  return {
    status: found.size === 0 ? 'no-forbidden-credential-files-found' : 'rotation-review-required',
    scope: 'all local Git refs; not proof of provider-side rotation or complete secret detection',
    files: [...found.values()].map(entry => ({...entry, fields: [...entry.fields.values()]})),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(auditCredentialHistory(), null, 2));
  } catch {
    console.error('Credential audit failed. No credential contents were printed.');
    process.exitCode = 1;
  }
}
