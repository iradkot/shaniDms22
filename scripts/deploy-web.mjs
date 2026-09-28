// Deploy the built web app through the official Firebase Hosting REST API.
// Authentication stays in memory; gcloud must already be signed in.
// Usage: yarn build:web && node scripts/deploy-web.mjs
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = 'shanidms-3a065';
const hostingApi = 'https://firebasehosting.googleapis.com/v1beta1';
const firebase = JSON.parse(await readFile(path.join(root, 'firebase.json'), 'utf8'));
const hosting = firebase.hosting;
if (hosting.site !== project || hosting.public !== 'releases/web') {
  throw new Error('Review the deployment target before publishing.');
}
const output = path.join(root, hosting.public);
await readFile(path.join(output, 'index.html'));
const token = execFileSync(
  process.platform === 'win32' ? 'powershell.exe' : 'gcloud',
  process.platform === 'win32'
    ? ['-NoProfile', '-Command', 'gcloud auth print-access-token']
    : ['auth', 'print-access-token'],
  {encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']},
).trim();

async function request(url, method = 'GET', body) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': project,
      ...(body ? {'Content-Type': binary ? 'application/octet-stream' : 'application/json'} : {}),
    },
    body: body ? (binary ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    // Do not echo request headers, credentials, or provider response payloads.
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

const apps = await request(`https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`);
const app = apps.apps?.find(candidate => candidate.displayName === 'ShaniDms Web');
if (!app) throw new Error('Register the ShaniDms Web Firebase app before publishing.');
const config = await request(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
const googleServices = JSON.parse(await readFile(path.join(root, 'android/app/google-services.json'), 'utf8'));
const clientId = googleServices.client.flatMap(client => client.oauth_client ?? [])
  .find(client => client.client_type === 3)?.client_id;
if (!config.apiKey || config.projectId !== project || !clientId) {
  throw new Error('The public Firebase configuration is incomplete or targets a different project.');
}
const runtime = {
  firebaseApiKey: config.apiKey,
  firebaseProjectId: project,
  firebaseStorageBucket: config.storageBucket,
  googleClientId: clientId,
  apiBaseUrl: `https://us-central1-${project}.cloudfunctions.net/shaniApi`,
};
await writeFile(path.join(output, 'runtime-config.js'),
  `/* Public web configuration. Never add user or server secrets here. */\nglobalThis.__SHANI_WEB_CONFIG__ = ${JSON.stringify(runtime, null, 2)};\n`);

const files = {};
const compressed = new Map();
async function collect(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    // Only the static build is published. Never upload source maps or hidden files.
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.endsWith('.map')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(file);
    } else if (entry.isFile()) {
      const bytes = gzipSync(await readFile(file));
      const hash = createHash('sha256').update(bytes).digest('hex');
      files[`/${path.relative(output, file).split(path.sep).join('/')}`] = hash;
      compressed.set(hash, bytes);
    }
  }
}
await collect(output);
const version = await request(`${hostingApi}/sites/${project}/versions`, 'POST', {
  config: {
    rewrites: hosting.rewrites.map(rule => ({glob: rule.source, path: rule.destination})),
    headers: hosting.headers.map(rule => ({
      glob: rule.source,
      headers: Object.fromEntries(rule.headers.map(header => [header.key, header.value])),
    })),
  },
});
console.log(`Created ${version.name}; preparing ${Object.keys(files).length} files.`);
const upload = await request(`${hostingApi}/${version.name}:populateFiles`, 'POST', {files});
// Upload URL is returned by Firebase; do not send credentials to another origin.
if (new URL(upload.uploadUrl).origin !== 'https://upload-firebasehosting.googleapis.com') {
  throw new Error('Firebase returned an unexpected upload origin.');
}
const pending = upload.uploadRequiredHashes ?? [];
for (let index = 0; index < pending.length; index += 6) {
  await Promise.all(pending.slice(index, index + 6).map(hash =>
    request(`${upload.uploadUrl}/${hash}`, 'POST', compressed.get(hash))));
}
await request(`${hostingApi}/${version.name}?updateMask=status`, 'PATCH', {status: 'FINALIZED'});
const release = await request(`${hostingApi}/sites/${project}/releases?versionName=${encodeURIComponent(version.name)}`, 'POST', {
  message: 'Unified AI recommendations web app',
});
console.log(JSON.stringify({url: `https://${project}.web.app`, release: release.name, releaseTime: release.releaseTime}, null, 2));
