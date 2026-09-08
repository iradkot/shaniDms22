import assert from 'node:assert/strict';
import test from 'node:test';

import {runSmoke} from '../smoke-ai-backend.mjs';

// Deliberately recognizable test-only markers; assertions never print values.
const secrets = ['test-oauth-sensitive-marker', 'test-public-key-marker',
  'test-provider-sensitive-marker', 'test-idtoken-sensitive-marker'];

function fixture(options = {}) {
  const logs = [];
  const state = {
    uid: null, identity: false, configured: false, provisionCount: 0,
    docDeletes: [], userDeletes: [], document: null, signed: false,
    customTokenValid: false, adminHeadersOk: true, rulesChecked: 0,
    encryptedBeforeStorage: true,
  };
  const env = {
    SHANI_SMOKE_PROJECT: 'smoke-project',
    SHANI_SMOKE_OAUTH_TOKEN: secrets[0],
    SHANI_SMOKE_FIREBASE_API_KEY: secrets[1],
    ...(options.real ? {SHANI_SMOKE_OPENAI_API_KEY: secrets[2]} : {}),
    ...(options.synthetic ? {SHANI_SMOKE_SYNTHETIC: '1'} : {}),
    SHANI_SMOKE_SIGNER_SERVICE_ACCOUNT: 'smoke-signer@smoke-project.iam.gserviceaccount.com',
  };
  const reply = (status, data = {}) => ({status, json: async () => data});
  async function fetchImpl(rawUrl, init) {
    const url = new URL(rawUrl);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const admin = init.headers.Authorization === `Bearer ${secrets[0]}`;
    if (admin) state.adminHeadersOk &&= init.headers['X-Goog-User-Project'] === env.SHANI_SMOKE_PROJECT;
    if (url.pathname.endsWith('/accounts:lookup')) {
      if (options.existing && !state.uid) return reply(200, {users: [{localId: body.localId[0]}]});
      return reply(200, state.identity ? {users: [{localId: state.uid}]} : {});
    }
    if (url.pathname.endsWith('/projects/smoke-project/accounts')) {
      state.uid = body.localId;
      state.identity = true;
      if (options.createFailure) throw new Error(secrets.join(' '));
      return reply(200, {localId: state.uid});
    }
    if (url.pathname.endsWith('/accounts:delete')) {
      state.userDeletes.push(body.localId);
      if (options.cleanupFailure) return reply(403, {error: {message: secrets.join(' ')}});
      state.identity = false;
      return reply(200);
    }
    if (url.pathname.endsWith('/accounts:signInWithPassword')) {
      if (options.custom) return reply(400, {error: {message: 'OPERATION_NOT_ALLOWED'}});
      return reply(200, {localId: state.uid, idToken: secrets[3]});
    }
    if (url.pathname.endsWith(':signBlob')) {
      state.signed = true;
      if (options.signDenied) return reply(403, {error: {message: secrets.join(' ')}});
      const unsigned = Buffer.from(body.payload, 'base64').toString('utf8');
      const claims = JSON.parse(Buffer.from(unsigned.split('.')[1], 'base64url').toString('utf8'));
      state.customTokenValid = claims.uid === state.uid && claims.iss === env.SHANI_SMOKE_SIGNER_SERVICE_ACCOUNT &&
        claims.sub === claims.iss && claims.exp > claims.iat &&
        claims.aud === 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
      return reply(200, {signedBlob: Buffer.from('unit-test-signature').toString('base64')});
    }
    if (url.pathname.endsWith('/accounts:signInWithCustomToken')) {
      // The real REST response omits localId; verify it through accounts:lookup.
      return reply(200, {idToken: secrets[3], refreshToken: 'test-refresh-marker', expiresIn: '3600'});
    }
    if (url.hostname === 'cloudkms.googleapis.com') {
      return reply(200, {ciphertext: body.plaintext}); // Unit-test-only KMS transport.
    }
    if (url.hostname === 'firestore.googleapis.com') {
      const exact = url.pathname.endsWith(`/privateCredentialVault/${state.uid}/secrets/llm-openai`);
      assert.ok(exact, 'Firestore operation must target only the generated identity');
      if (!admin) {
        state.rulesChecked += 1;
        if (options.readPermissive && init.method === 'GET') return reply(404);
        if (options.writePermissive && init.method === 'PATCH') {
          state.document = body;
          return reply(200, body);
        }
        return reply(403, {error: {message: secrets.join(' ')}});
      }
      if (init.method === 'DELETE') {
        state.docDeletes.push(state.uid);
        if (options.cleanupFailure) return reply(403);
        state.document = null;
        state.configured = false;
        return reply(200);
      }
      if (init.method === 'PATCH') {
        state.encryptedBeforeStorage &&= !JSON.stringify(body).includes('sk-smoke-intentionally-invalid');
        state.document = body;
        state.configured = true;
        return reply(200, body);
      }
      return state.document ? reply(200, state.document) : reply(404);
    }
    if (url.hostname.endsWith('.cloudfunctions.net')) {
      if (!init.headers.Authorization) return reply(401, {code: 'unauthenticated'});
      if (url.pathname.endsWith('/status')) return reply(200, {configured: state.configured});
      if (url.pathname.endsWith('/provision')) {
        state.provisionCount += 1;
        assert.ok(state.rulesChecked === 2, 'Both deny checks must precede storage');
        assert.ok(body.credential === secrets[2], 'Provider key must pass only in the request body');
        state.configured = true;
        state.document = {opaqueEncryptedData: true};
        return reply(200, {configured: true});
      }
      if (url.pathname.endsWith('/test')) {
        if (!state.configured) return reply(409, {code: 'credential_missing'});
        if (options.testThrows) throw new Error(secrets.join(' '));
        if (options.testFailure) return reply(429, {code: 'provider_quota_exceeded', message: secrets.join(' ')});
        if (options.untrustedCode) return reply(500, {code: secrets[2], message: secrets.join(' ')});
        if (options.synthetic && state.provisionCount === 0) return reply(401, {code: 'invalid_credential'});
        return reply(200, {connected: true, provider: 'openai', model: 'gpt-5.5'});
      }
      if (url.pathname.endsWith('/remove')) {
        state.configured = false;
        state.document = null;
        return reply(200, {configured: false});
      }
    }
    throw new Error('Unexpected test fixture route');
  }
  return {state, env, logs, run: () => runSmoke({env, fetchImpl, report: line => logs.push(line)})};
}

function assertSafe(result, setup) {
  const serialized = JSON.stringify({result, logs: setup.logs});
  for (const secret of secrets) assert.ok(!serialized.includes(secret), 'No secret may enter output or result');
  assert.ok(setup.state.adminHeadersOk, 'Every administrator request needs the quota project header');
}

function assertCleaned(setup) {
  assert.ok(setup.state.docDeletes.length === 1 && setup.state.docDeletes[0] === setup.state.uid,
    'Cleanup must delete only the exact generated vault document');
  assert.ok(setup.state.userDeletes.length === 1 && setup.state.userDeletes[0] === setup.state.uid,
    'Cleanup must delete only the exact generated identity');
  assert.ok(!setup.state.identity && !setup.state.document, 'Disposable resources must be gone');
}

test('real-key success verifies both deny checks and removes all disposable resources', async () => {
  const setup = fixture({real: true});
  const result = await setup.run();
  assert.ok(result.ok && result.cleanupOk);
  assert.equal(setup.state.provisionCount, 1);
  assertSafe(result, setup);
  assertCleaned(setup);
});

for (const option of ['readPermissive', 'writePermissive']) {
  test(`fails closed before storing a credential when ${option}`, async () => {
    const setup = fixture({real: true, synthetic: true, [option]: true});
    const result = await setup.run();
    assert.ok(!result.ok && result.cleanupOk);
    assert.equal(setup.state.provisionCount, 0);
    assertSafe(result, setup);
    assertCleaned(setup);
  });
}

for (const option of ['testFailure', 'testThrows', 'untrustedCode', 'createFailure']) {
  test(`cleans up and suppresses raw credentials on ${option}`, async () => {
    const setup = fixture({real: true, [option]: true});
    const result = await setup.run();
    assert.ok(!result.ok && result.cleanupOk);
    if (option === 'testFailure') assert.equal(result.code, 'provider_quota_exceeded');
    assertSafe(result, setup);
    assertCleaned(setup);
  });
}

test('refuses an existing identity and never deletes it', async () => {
  const setup = fixture({existing: true});
  const result = await setup.run();
  assert.equal(result.code, 'identity_already_exists');
  assert.equal(setup.state.docDeletes.length, 0);
  assert.equal(setup.state.userDeletes.length, 0);
  assertSafe(result, setup);
});

test('uses an externally prepared signer when password sign-in is disabled', async () => {
  const setup = fixture({custom: true, real: true});
  const result = await setup.run();
  assert.ok(result.ok && setup.state.signed && setup.state.customTokenValid);
  assertSafe(result, setup);
  assertCleaned(setup);
});

test('signBlob denial is safe and does not grant IAM or store a key', async () => {
  const setup = fixture({custom: true, signDenied: true, real: true});
  const result = await setup.run();
  assert.equal(result.code, 'custom_token_signing_denied');
  assert.equal(setup.state.provisionCount, 0);
  assertSafe(result, setup);
  assertCleaned(setup);
});

test('cleanup failures fail the run and identify only the generated cleanup target', async () => {
  const setup = fixture({real: true, cleanupFailure: true});
  const result = await setup.run();
  assert.ok(!result.ok && !result.cleanupOk);
  assert.ok(result.cleanupUid === setup.state.uid);
  assert.equal(result.cleanupFailures.length, 2);
  assertSafe(result, setup);
});

test('synthetic seed uses compiled encryption and runtime test before optional real-key test', async () => {
  const setup = fixture({synthetic: true, real: true});
  const result = await setup.run();
  assert.ok(result.ok && setup.state.encryptedBeforeStorage);
  assert.ok(setup.logs.includes('smoke synthetic_runtime_decrypt'));
  assertSafe(result, setup);
  assertCleaned(setup);
});

test('missing credentials fail before network access and reveal no environment content', async () => {
  let requested = false;
  const logs = [];
  const result = await runSmoke({env: {SHANI_SMOKE_PROJECT: 'smoke-project'},
    fetchImpl: async () => { requested = true; }, report: line => logs.push(line)});
  assert.equal(result.code, 'missing_oauth_token');
  assert.ok(!requested);
});
