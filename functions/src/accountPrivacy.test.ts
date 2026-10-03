import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShaniApiHandler,
  type ApiResponse,
  type ShaniApiDependencies,
} from './api';
import {
  decodeAccountConsent,
  PRIVACY_POLICY_VERSION,
  type AccountPrivacyRepository,
} from './accountPrivacy';
class Response implements ApiResponse {
  code = 200;
  value: unknown;
  status(code: number) {
    this.code = code;
    return this;
  }
  setHeader() {}
  json(value: unknown) {
    this.value = value;
  }
  end() {}
}
const fixture = () => {
  let consent = false;
  let ai = false;
  let deleting = false;
  let authTime = 1000;
  let authorizedReceipt = false;
  const calls: string[] = [];
  const privacy: AccountPrivacyRepository = {
    readConsent: async () =>
      consent
        ? {
            policyVersion: PRIVACY_POLICY_VERSION,
            cloudSync: true,
            aiProcessing: ai,
            updatedAtMs: 1,
          }
        : null,
    writeConsent: async (_uid, value) => {
      consent = value.cloudSync;
      ai = value.aiProcessing;
    },
    isDeleting: async () => deleting,
    issueDeletionReceipt: async uid => {
      calls.push(`receipt:${uid}`);
      return 'a'.repeat(64);
    },
    deleteAccount: async (uid, receipt) => {
      assert.equal(uid, 'owner-A');
      assert.equal(receipt, 'a'.repeat(64));
      deleting = true;
      authorizedReceipt = true;
      calls.push('delete');
    },
    finishDeletion: async receipt => {
      assert.equal(receipt, 'a'.repeat(64));
      if (!authorizedReceipt) {
        throw new Error('unissued');
      }
      calls.push('finish');
    },
  };
  const dependencies = {
    privacy,
    auth: {verify: async () => ({uid: 'owner-A', authTimeSeconds: authTime})},
    vault: {
      get: async () => 'secret',
      has: async () => true,
      put: async () => {},
      remove: async () => {},
    },
    nightscoutVault: {
      get: async () => null,
      has: async () => false,
      put: async () => {},
      remove: async () => {},
    },
    nightscoutUpstream: {
      validateCredential: async () => {},
      range: async () => [],
    },
    upstream: {
      validateCredential: async () => ({valid: true}),
      testConnection: async () => {},
      chat: async () => {
        calls.push('chat');
        return 'response';
      },
      analyzeMealImage: async () => 'response',
    },
    allowedModels: new Set(['test-model']),
    allowedOrigins: new Set<string>(),
    now: () => 1_000_000,
  } satisfies ShaniApiDependencies;
  const handler = createShaniApiHandler(dependencies);
  const request = async (
    path: string,
    body?: unknown,
    authenticated = true,
  ) => {
    const response = new Response();
    await handler(
      {
        method: body === undefined ? 'GET' : 'POST',
        path,
        body,
        headers: authenticated
          ? {Authorization: `Bearer ${'t'.repeat(30)}`}
          : {},
      },
      response,
    );
    return response;
  };
  return {
    request,
    calls,
    grant: () => {
      consent = true;
      ai = true;
    },
    oldAuth: () => {
      authTime = 1;
    },
    privacy,
  };
};
test('strict consent decoder rejects implied AI consent and obsolete policy', () => {
  assert.throws(() =>
    decodeAccountConsent(
      {version: 1, policyVersion: 'old', cloudSync: true, aiProcessing: true},
      1,
    ),
  );
  assert.throws(() =>
    decodeAccountConsent(
      {
        version: 1,
        policyVersion: PRIVACY_POLICY_VERSION,
        cloudSync: false,
        aiProcessing: true,
      },
      1,
    ),
  );
});
test('missing consent denies health requests before calling provider', async () => {
  const f = fixture();
  const result = await f.request('/v1/llm/chat', {
    version: 1,
    provider: 'openai',
    model: 'test-model',
    messages: [{role: 'user', content: 'private health data'}],
  });
  assert.equal(result.code, 403);
  assert.deepEqual(f.calls, []);
});
test('receipt requires recent authentication before destructive work', async () => {
  const f = fixture();
  f.oldAuth();
  const result = await f.request('/v1/account/delete/receipt', {version: 1});
  assert.equal(result.code, 401);
  assert.deepEqual(f.calls, []);
});
test('deletion requires concrete confirmation and a receipt bound by repository to owner', async () => {
  const f = fixture();
  assert.equal((await f.request('/v1/account/delete', {version: 1})).code, 400);
  assert.equal(
    (await f.request('/v1/account/delete/receipt', {version: 1})).code,
    200,
  );
  assert.equal(
    (
      await f.request('/v1/account/delete', {
        version: 1,
        confirmation: 'DELETE_MY_SHANIDMS_ACCOUNT',
        receipt: 'a'.repeat(64),
      })
    ).code,
    200,
  );
  assert.deepEqual(f.calls, ['receipt:owner-A', 'delete']);
});
test('an authorized receipt resumes deletion without an auth session and returns no owner data', async () => {
  const f = fixture();
  await f.request('/v1/account/delete', {
    version: 1,
    confirmation: 'DELETE_MY_SHANIDMS_ACCOUNT',
    receipt: 'a'.repeat(64),
  });
  const result = await f.request(
    '/v1/account/delete/finish',
    {version: 1, receipt: 'a'.repeat(64)},
    false,
  );
  assert.equal(result.code, 200);
  assert.deepEqual(result.value, {version: 1, deleted: true});
});
test('arbitrary receipts cannot start unauthenticated deletions', async () => {
  const f = fixture();
  const result = await f.request(
    '/v1/account/delete/finish',
    {version: 1, receipt: 'a'.repeat(64)},
    false,
  );
  assert.equal(result.code, 500);
  assert.deepEqual(f.calls, []);
});
