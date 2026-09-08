/**
 * Explicit, live smoke test. Never runs on import. Supply credentials through env
 * only; do not put them in commands, files, or arguments. Requires Node 22.
 *
 * Required: SHANI_SMOKE_PROJECT, SHANI_SMOKE_OAUTH_TOKEN,
 *           SHANI_SMOKE_FIREBASE_API_KEY.
 * Optional: SHANI_SMOKE_OPENAI_API_KEY (one neutral, capped connection test),
 *           SHANI_SMOKE_SYNTHETIC=1 (exercise runtime KMS decryption with an
 *           intentionally invalid generated key; build functions first),
 *           SHANI_SMOKE_REGION (us-central1), SHANI_SMOKE_MODEL (gpt-5.5).
 *           SHANI_SMOKE_SIGNER_SERVICE_ACCOUNT (externally prepared signer).
 * Credential aliases: GOOGLE_OAUTH_ACCESS_TOKEN, OPENAI_API_KEY,
 *                     FIREBASE_SIGNER_SERVICE_ACCOUNT.
 *
 * Creates one disposable Firebase identity; removes only its exact vault
 * document and identity in finally. No existing account is accepted. Client
 * Firestore read AND write must be denied before either credential is stored.
 * Password sign-in falls back to IAM signBlob + Firebase custom-token sign-in
 * only when password authentication is disabled. No IAM grants are made.
 */
import {randomBytes, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const safeApiCodes = new Set([
  'unauthenticated', 'credential_missing', 'invalid_credential',
  'provider_permission_denied', 'provider_model_unavailable', 'unsupported_model',
  'provider_quota_exceeded', 'rate_limited', 'upstream_unavailable', 'upstream_timeout',
  'internal_error', 'invalid_request', 'upstream_rejected',
]);

class SmokeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const ensure = (condition, code = 'unexpected_response') => {
  if (!condition) throw new SmokeFailure(code);
};

function configuration(env) {
  const project = env.SHANI_SMOKE_PROJECT?.trim();
  const region = env.SHANI_SMOKE_REGION?.trim() || 'us-central1';
  const model = env.SHANI_SMOKE_MODEL?.trim() || 'gpt-5.5';
  ensure(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project ?? ''), 'invalid_configuration');
  ensure(/^[a-z]+-[a-z]+[0-9]+$/.test(region), 'invalid_configuration');
  ensure(/^[a-zA-Z0-9._-]{1,128}$/.test(model), 'invalid_configuration');
  const oauth = env.SHANI_SMOKE_OAUTH_TOKEN ?? env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const signer = env.SHANI_SMOKE_SIGNER_SERVICE_ACCOUNT ?? env.FIREBASE_SIGNER_SERVICE_ACCOUNT ??
    `shani-api-runtime@${project}.iam.gserviceaccount.com`;
  ensure(typeof oauth === 'string' && oauth.trim().length > 0, 'missing_oauth_token');
  ensure(typeof env.SHANI_SMOKE_FIREBASE_API_KEY === 'string' &&
    env.SHANI_SMOKE_FIREBASE_API_KEY.trim().length > 0, 'missing_firebase_api_key');
  ensure(env.SHANI_SMOKE_SYNTHETIC === undefined ||
    ['0', '1'].includes(env.SHANI_SMOKE_SYNTHETIC), 'invalid_configuration');
  ensure(typeof signer === 'string' && signer.endsWith(`@${project}.iam.gserviceaccount.com`) &&
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]@/.test(signer), 'invalid_configuration');
  return {
    project, region, model, signer,
    oauth: oauth.trim(),
    firebaseKey: env.SHANI_SMOKE_FIREBASE_API_KEY.trim(),
    providerKey: (env.SHANI_SMOKE_OPENAI_API_KEY ?? env.OPENAI_API_KEY)?.trim() || null,
    synthetic: env.SHANI_SMOKE_SYNTHETIC === '1',
  };
}

function encodeValue(value) {
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (Number.isSafeInteger(value)) return {integerValue: String(value)};
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_vault_data');
  return {mapValue: {fields: encodeFields(value)}};
}

function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

function decodeValue(value) {
  if (typeof value?.stringValue === 'string') return value.stringValue;
  if (typeof value?.booleanValue === 'boolean') return value.booleanValue;
  if (typeof value?.integerValue === 'string') return Number(value.integerValue);
  ensure(value?.mapValue?.fields && typeof value.mapValue.fields === 'object', 'invalid_vault_data');
  return decodeFields(value.mapValue.fields);
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

export async function runSmoke({env = process.env, fetchImpl = globalThis.fetch,
  report = line => process.stdout.write(`${line}\n`)} = {}) {
  let stage = 'configuration';
  let result;
  let config;
  let uid;
  let accountCreationAttempted = false;
  let accountWasAbsent = false;
  const cleanupFailures = [];
  const emit = line => {
    // Reporter failures must not skip cleanup or leak arbitrary thrown content.
    try { report(line); } catch { /* Reporting is best effort. */ }
  };
  const advance = next => { stage = next; emit(`smoke ${next}`); };

  // Never return or print raw fetch exceptions, HTTP bodies, headers or URLs.
  async function request(url, {method = 'GET', token, body, admin = false} = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        // Longer than shaniApi's 90 s runtime limit, so cleanup cannot race a
        // still-running provision request after a premature client timeout.
        method, redirect: 'error', signal: AbortSignal.timeout(105_000),
        headers: {
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
          ...(admin ? {'X-Goog-User-Project': config.project} : {}),
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        },
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
    } catch {
      throw new SmokeFailure('request_failed');
    }
    let data = null;
    try { data = await response.json(); } catch { /* Some deletes have no body. */ }
    return {status: response.status, data};
  }

  const expect = (response, status, predicate = () => true) => {
    if (response.status !== status || !predicate(response.data)) {
      throw new SmokeFailure(safeApiCodes.has(response.data?.code)
        ? response.data.code : 'unexpected_response');
    }
    return response.data;
  };

  let adminIdentity;
  let documentUrl;
  let api;
  let clientToken;
  try {
    config = configuration(env);
    uid = `smoke-ai-${randomUUID()}`;
    const email = `${uid}@example.invalid`;
    const password = randomBytes(36).toString('base64url');
    const keyQuery = `?key=${encodeURIComponent(config.firebaseKey)}`;
    const identityBase = 'https://identitytoolkit.googleapis.com/v1';
    const accountsUrl = `${identityBase}/projects/${config.project}/accounts`;
    adminIdentity = (suffix, body) => request(`${accountsUrl}${suffix}${keyQuery}`, {
      method: 'POST', token: config.oauth, admin: true, body,
    });
    documentUrl = `https://firestore.googleapis.com/v1/projects/${config.project}` +
      `/databases/(default)/documents/privateCredentialVault/${uid}/secrets/llm-openai`;
    api = (route, body, token = clientToken) => request(
      `https://${config.region}-${config.project}.cloudfunctions.net/shaniApi/v1/vault/llm/${route}`, {
        method: body === undefined ? 'GET' : 'POST', token, body,
      });
    const providerBody = {version: 1, provider: 'openai'};
    const testBody = {...providerBody, model: config.model};

    advance('unauthenticated');
    expect(await api('status?provider=openai', undefined, null), 401,
      data => data?.code === 'unauthenticated');

    advance('identity_preflight');
    const existing = expect(await adminIdentity(':lookup', {localId: [uid]}), 200);
    ensure(existing && (existing.users === undefined ||
      (Array.isArray(existing.users) && existing.users.length === 0)), 'identity_already_exists');
    accountWasAbsent = true;

    advance('identity_create');
    accountCreationAttempted = true;
    expect(await adminIdentity('', {localId: uid, email, password, emailVerified: true}), 200,
      data => data?.localId === uid);

    advance('identity_signin');
    let signedIn = await request(`${identityBase}/accounts:signInWithPassword${keyQuery}`, {
      method: 'POST', body: {email, password, returnSecureToken: true},
    });
    if (signedIn.status !== 200 &&
        ['OPERATION_NOT_ALLOWED', 'PASSWORD_LOGIN_DISABLED'].includes(signedIn.data?.error?.message)) {
      advance('identity_custom_token');
      const serviceAccount = config.signer;
      const now = Math.floor(Date.now() / 1000);
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({alg: 'RS256', typ: 'JWT'})}.${encode({
        iss: serviceAccount, sub: serviceAccount,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now, exp: now + 3600, uid,
      })}`;
      const signature = await request('https://iamcredentials.googleapis.com/v1/projects/-/' +
        `serviceAccounts/${serviceAccount}:signBlob`, {
        method: 'POST', token: config.oauth, admin: true,
        body: {payload: Buffer.from(unsigned).toString('base64')},
      });
      ensure(signature.status !== 403, 'custom_token_signing_denied');
      const signatureData = expect(signature, 200,
        data => typeof data?.signedBlob === 'string' && data.signedBlob.length > 0);
      const customToken = `${unsigned}.${Buffer.from(signatureData.signedBlob, 'base64').toString('base64url')}`;
      signedIn = await request(`${identityBase}/accounts:signInWithCustomToken${keyQuery}`, {
        method: 'POST', body: {token: customToken, returnSecureToken: true},
      });
    }
    const identity = expect(signedIn, 200,
      data => typeof data?.idToken === 'string' && data.idToken.length > 0);
    advance('identity_verify');
    expect(await request(`${identityBase}/accounts:lookup${keyQuery}`, {
      method: 'POST', body: {idToken: identity.idToken},
    }), 200, data => data?.users?.length === 1 && data.users[0].localId === uid);
    clientToken = identity.idToken;

    advance('rules_read_denied');
    ensure((await request(documentUrl, {token: clientToken})).status === 403, 'vault_read_not_denied');
    advance('rules_write_denied');
    ensure((await request(`${documentUrl}?currentDocument.exists=false`, {
      method: 'PATCH', token: clientToken,
      body: {fields: {smokeProbe: {booleanValue: true}}},
    })).status === 403, 'vault_write_not_denied');

    advance('status_missing');
    expect(await api('status?provider=openai'), 200, data => data?.configured === false);
    advance('test_missing');
    expect(await api('test', testBody), 409, data => data?.code === 'credential_missing');

    if (config.synthetic) {
      advance('synthetic_seed');
      const [{EncryptedCredentialVault}, {GoogleKmsEnvelopeCipher}, {FirestoreVaultRepository}] =
        await Promise.all([
          import('../functions/lib/vault.js'), import('../functions/lib/kmsEnvelopeCipher.js'),
          import('../functions/lib/firestoreVaultRepository.js'),
        ]).catch(() => { throw new SmokeFailure('functions_build_required'); });
      const keyName = `projects/${config.project}/locations/${config.region}` +
        '/keyRings/shani-api-vault/cryptoKeys/account-secrets';
      const kmsTransport = {};
      for (const [operation, inputField, outputField] of [
        ['encrypt', 'plaintext', 'ciphertext'], ['decrypt', 'ciphertext', 'plaintext'],
      ]) {
        kmsTransport[operation] = async input => {
          ensure(input.name === keyName, 'invalid_kms_target');
          const data = expect(await request(`https://cloudkms.googleapis.com/v1/${keyName}:${operation}`, {
            method: 'POST', token: config.oauth, admin: true,
            body: {[inputField]: Buffer.from(input[inputField]).toString('base64')},
          }), 200, value => typeof value?.[outputField] === 'string');
          return [{[outputField]: Buffer.from(data[outputField], 'base64')}];
        };
      }
      const repository = new FirestoreVaultRepository({doc(path) {
        ensure(path === `privateCredentialVault/${uid}/secrets/llm-openai`, 'invalid_vault_target');
        return {
          async get() {
            const response = await request(documentUrl, {token: config.oauth, admin: true});
            if (response.status === 404) return {exists: false};
            const data = expect(response, 200, value => value?.fields);
            return {exists: true, data: () => decodeFields(data.fields)};
          },
          async set(document) {
            expect(await request(documentUrl, {method: 'PATCH', token: config.oauth,
              admin: true, body: {fields: encodeFields(document)}}), 200);
          },
          async delete() {
            expect(await request(documentUrl, {method: 'DELETE', token: config.oauth, admin: true}), 200);
          },
        };
      }});
      const vault = new EncryptedCredentialVault(repository, new GoogleKmsEnvelopeCipher(kmsTransport, keyName));
      await vault.put(uid, 'openai', `sk-smoke-intentionally-invalid-${randomUUID()}`);
      advance('synthetic_status');
      expect(await api('status?provider=openai'), 200, data => data?.configured === true);
      advance('synthetic_runtime_decrypt');
      expect(await api('test', testBody), 401, data => data?.code === 'invalid_credential');
      advance('synthetic_remove');
      expect(await api('remove', providerBody), 200, data => data?.configured === false);
      expect(await api('status?provider=openai'), 200, data => data?.configured === false);
    }

    if (config.providerKey) {
      advance('real_provision');
      expect(await api('provision', {...providerBody, credential: config.providerKey}), 200,
        data => data?.configured === true);
      advance('real_status');
      expect(await api('status?provider=openai'), 200, data => data?.configured === true);
      advance('real_connection');
      expect(await api('test', testBody), 200, data => data?.connected === true &&
        data?.provider === 'openai' && data?.model === config.model);
      advance('real_remove');
      expect(await api('remove', providerBody), 200, data => data?.configured === false);
      expect(await api('status?provider=openai'), 200, data => data?.configured === false);
    }
    result = {ok: true, stage: 'complete', code: 'passed'};
  } catch (error) {
    result = {ok: false, stage, code: error instanceof SmokeFailure ? error.code : 'smoke_failed'};
  } finally {
    if (accountWasAbsent && accountCreationAttempted) {
      emit('smoke cleanup_vault');
      try {
        const deleted = await request(documentUrl, {method: 'DELETE', token: config.oauth, admin: true});
        ensure([200, 204, 404].includes(deleted.status));
        ensure((await request(documentUrl, {token: config.oauth, admin: true})).status === 404);
      } catch { cleanupFailures.push('vault_cleanup_failed'); }
      emit('smoke cleanup_identity');
      try {
        const deleted = await adminIdentity(':delete', {localId: uid});
        ensure(deleted.status === 200 ||
          (deleted.status === 400 && deleted.data?.error?.message === 'USER_NOT_FOUND'));
        const lookup = expect(await adminIdentity(':lookup', {localId: [uid]}), 200);
        ensure(lookup && (lookup.users === undefined ||
          (Array.isArray(lookup.users) && lookup.users.length === 0)));
      } catch { cleanupFailures.push('identity_cleanup_failed'); }
    }
    if (config) { config.oauth = ''; config.providerKey = null; config.firebaseKey = ''; }
    clientToken = undefined;
  }
  result.cleanupOk = cleanupFailures.length === 0;
  result.cleanupFailures = cleanupFailures;
  if (!result.cleanupOk) {
    if (result.ok) {
      result.stage = 'cleanup';
      result.code = 'cleanup_failed';
    }
    result.ok = false;
    // This generated, non-secret identifier is needed for exact manual cleanup.
    result.cleanupUid = uid;
  }
  emit(`smoke result ${result.ok ? 'passed' : 'failed'} ${result.stage} ${result.code}`);
  for (const code of cleanupFailures) emit(`smoke cleanup ${code}`);
  if (result.cleanupUid) emit(`smoke cleanup_uid ${result.cleanupUid}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('smoke failed arguments_not_supported\n');
    process.exitCode = 1;
  } else {
    const result = await runSmoke();
    process.exitCode = result.ok ? 0 : 1;
  }
}
