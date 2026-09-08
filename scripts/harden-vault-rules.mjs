import {pathToFileURL} from 'node:url';

export const LEGACY_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
  match /databases/{database}/documents/notifications {
   allow write: if true;
  }
}`;

const HARDENED_FIRESTORE_RULES = LEGACY_FIRESTORE_RULES
  .replace('match /{document=**}', 'match /{collection}/{document=**}')
  .replace('if request.auth != null;', "if collection != 'privateCredentialVault' && request.auth != null;");

export function protectVaultRules(source) {
  const normalized = typeof source === 'string' ? source.replaceAll('\r\n', '\n').trim() : '';
  if (normalized === HARDENED_FIRESTORE_RULES) return normalized;
  if (normalized !== LEGACY_FIRESTORE_RULES) {
    throw new Error('Refusing unfamiliar deployed Firestore rules; review the source first.');
  }
  return HARDENED_FIRESTORE_RULES;
}

export async function hardenDeployedVaultRules({projectId, oauthToken, apply = false, fetchImpl = fetch, report = console.log}) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? '') || !oauthToken) {
    throw new Error('Set SHANI_RULES_PROJECT and a transient SHANI_RULES_OAUTH_TOKEN environment value.');
  }
  const project = `projects/${projectId}`;
  const releaseName = `${project}/releases/cloud.firestore`;
  const request = async (resource, method = 'GET', body) => {
    if (!resource.startsWith(`${project}/`)) throw new Error('Rules resource must belong to the selected project.');
    let response;
    try {
      response = await fetchImpl(`https://firebaserules.googleapis.com/v1/${resource}`, {
        method,
        headers: {Authorization: `Bearer ${oauthToken}`, 'X-Goog-User-Project': projectId, 'Content-Type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('Rules API transport failed; credentials and response details are suppressed.');
    }
    if (!response.ok) throw new Error(`Rules API ${method} failed (HTTP ${response.status}); response details suppressed.`);
    try { return await response.json(); } catch { throw new Error('Rules API returned invalid JSON.'); }
  };
  const currentRelease = await request(releaseName);
  const currentRuleset = await request(currentRelease.rulesetName);
  const files = currentRuleset.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || files[0]?.name !== 'firestore.rules') {
    throw new Error('Refusing unfamiliar rules source files.');
  }
  const source = files[0].content;
  const hardened = protectVaultRules(source);
  report(JSON.stringify({projectId, currentRuleset: currentRelease.rulesetName, changed: source.trim() !== hardened, apply}));
  if (source.replaceAll('\r\n', '\n').trim() === hardened) {
    report('The reviewed vault exclusion is already active.');
    return {changed: false, rulesetName: currentRelease.rulesetName};
  }
  report('-    match /{document=**} {');
  report('+    match /{collection}/{document=**} {');
  report('-      allow read, write: if request.auth != null;');
  report("+      allow read, write: if collection != 'privateCredentialVault' && request.auth != null;");
  if (!apply) return {changed: false, rulesetName: currentRelease.rulesetName};

  const created = await request(`${project}/rulesets`, 'POST', {
    source: {files: [{name: 'firestore.rules', content: hardened}]},
  });
  const createdRuleset = await request(created.name);
  if (createdRuleset.source?.files?.[0]?.content !== hardened) {
    throw new Error('Created ruleset differs from the reviewed source; release was not changed.');
  }
  const beforeSwitch = await request(releaseName);
  if (beforeSwitch.rulesetName !== currentRelease.rulesetName || beforeSwitch.updateTime !== currentRelease.updateTime) {
    throw new Error('The active rules changed during review; release was not changed.');
  }
  await request(releaseName, 'PATCH', {
    release: {name: releaseName, rulesetName: created.name}, updateMask: 'rulesetName',
  });
  const active = await request(releaseName);
  if (active.rulesetName !== created.name) throw new Error('The new ruleset was not confirmed active.');
  report(JSON.stringify({previousRuleset: currentRelease.rulesetName, activeRuleset: created.name, updated: active.updateTime}));
  return {changed: true, rulesetName: created.name, previousRulesetName: currentRelease.rulesetName};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(argument => argument !== '--apply')) {
    console.error('Usage: node scripts/harden-vault-rules.mjs [--apply]; credentials are accepted only through environment.');
    process.exitCode = 1;
  } else {
    try {
      await hardenDeployedVaultRules({
        projectId: process.env.SHANI_RULES_PROJECT,
        oauthToken: process.env.SHANI_RULES_OAUTH_TOKEN,
        apply: process.argv.includes('--apply'),
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Rules hardening failed.');
      process.exitCode = 1;
    }
  }
}
