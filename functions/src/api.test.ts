import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createShaniApiHandler,
  FixedWindowApiRateLimiter,
  type ApiRequest,
  type ApiResponse,
} from './api';
import type {ChatRequest, MealImageRequest} from './contracts';
import type {LlmUpstream, ProviderValidation} from './openAiUpstream';
import type {CredentialVault, SupportedProvider} from './vault';
import type {
  NightscoutCredential,
  NightscoutCredentialVault,
} from './nightscoutVault';
import {
  createNightscoutSourceId,
  createNightscoutWorkspaceId,
} from './nightscoutVault';
import type {NightscoutRangeRequest} from './contracts';

const TOKEN = 'test-token-that-is-long-enough';

const rangeIdentity = (url = 'https://nightscout.example/') => ({
  sourceId: createNightscoutSourceId(url),
  workspaceId: createNightscoutWorkspaceId('user-1', url),
});

class MemoryVault implements CredentialVault {
  readonly values = new Map<string, string>();

  private key(uid: string, provider: SupportedProvider): string {
    return `${uid}:${provider}`;
  }

  async has(uid: string, provider: SupportedProvider): Promise<boolean> {
    return this.values.has(this.key(uid, provider));
  }

  async put(
    uid: string,
    provider: SupportedProvider,
    credential: string,
  ): Promise<void> {
    this.values.set(this.key(uid, provider), credential);
  }

  async get(
    uid: string,
    provider: SupportedProvider,
  ): Promise<string | null> {
    return this.values.get(this.key(uid, provider)) ?? null;
  }

  async remove(uid: string, provider: SupportedProvider): Promise<void> {
    this.values.delete(this.key(uid, provider));
  }
}

class FakeUpstream implements LlmUpstream {
  validation: ProviderValidation = {valid: true};
  validateCalls: string[] = [];
  chatCalls: {credential: string; request: ChatRequest}[] = [];
  imageCalls: {credential: string; request: MealImageRequest}[] = [];

  async validateCredential(credential: string): Promise<ProviderValidation> {
    this.validateCalls.push(credential);
    return this.validation;
  }

  async chat(credential: string, request: ChatRequest): Promise<string> {
    this.chatCalls.push({credential, request});
    return 'safe answer';
  }

  async analyzeMealImage(
    credential: string,
    request: MealImageRequest,
  ): Promise<string> {
    this.imageCalls.push({credential, request});
    return '{"carbs": 24}';
  }
}

class MemoryNightscoutVault implements NightscoutCredentialVault {
  readonly values = new Map<string, NightscoutCredential>();

  async has(uid: string): Promise<boolean> {
    return this.values.has(uid);
  }

  async put(uid: string, credential: NightscoutCredential): Promise<void> {
    this.values.set(uid, credential);
  }

  async get(uid: string): Promise<NightscoutCredential | null> {
    return this.values.get(uid) ?? null;
  }

  async remove(uid: string): Promise<void> {
    this.values.delete(uid);
  }
}

class CapturedResponse implements ApiResponse {
  statusCode = 200;
  body: unknown;
  ended = false;
  readonly headers = new Map<string, string>();

  status(code: number): ApiResponse {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  json(value: unknown): void {
    this.body = value;
  }

  end(): void {
    this.ended = true;
  }
}

const request = (
  path: string,
  body?: unknown,
  overrides: Partial<ApiRequest> = {},
): ApiRequest => ({
  method: body === undefined ? 'GET' : 'POST',
  path,
  body,
  headers: {authorization: `Bearer ${TOKEN}`},
  ...overrides,
});

const dependencies = () => {
  const vault = new MemoryVault();
  const nightscoutVault = new MemoryNightscoutVault();
  const upstream = new FakeUpstream();
  const nightscoutCalls: {
    validate: NightscoutCredential[];
    range: {credential: NightscoutCredential; request: NightscoutRangeRequest}[];
  } = {validate: [], range: []};
  const nightscoutUpstream = {
    validateCredential: async (credential: NightscoutCredential): Promise<void> => {
      nightscoutCalls.validate.push(credential);
    },
    range: async (
      credential: NightscoutCredential,
      rangeRequest: NightscoutRangeRequest,
    ): Promise<unknown> => {
      nightscoutCalls.range.push({credential, request: rangeRequest});
      return [{sgv: 123, date: rangeRequest.startMs}];
    },
  };
  return {
    vault,
    nightscoutVault,
    nightscoutCalls,
    nightscoutUpstream,
    upstream,
    handler: createShaniApiHandler({
      auth: {
        verify: async token => {
          assert.equal(token, TOKEN);
          return {uid: 'user-1'};
        },
      },
      vault,
      nightscoutVault,
      nightscoutUpstream,
      upstream,
      allowedModels: new Set(['gpt-5-mini']),
      allowedOrigins: new Set(['https://app.example']),
    }),
  };
};

test('rejects unauthenticated requests before using the provider', async () => {
  const setup = dependencies();
  const response = new CapturedResponse();

  await setup.handler(
    request('/v1/vault/llm/status', undefined, {headers: {}}),
    response,
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    version: 1,
    code: 'unauthenticated',
    message: 'Authentication required',
  });
  assert.deepEqual(setup.upstream.validateCalls, []);
});

test('provisions a validated credential without returning it', async () => {
  const setup = dependencies();
  const response = new CapturedResponse();
  const credential = 'sk-private-value';

  await setup.handler(
    request('/v1/vault/llm/provision', {
      version: 1,
      provider: 'openai',
      credential,
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {version: 1, configured: true});
  assert.equal(JSON.stringify(response.body).includes(credential), false);
  assert.equal(await setup.vault.get('user-1', 'openai'), credential);
});

test('rejects unknown request fields and unsupported models', async () => {
  const setup = dependencies();
  const unknownFieldResponse = new CapturedResponse();
  await setup.handler(
    request('/v1/llm/chat', {
      version: 1,
      provider: 'openai',
      model: 'gpt-5-mini',
      messages: [{role: 'user', content: 'hello'}],
      credential: 'must-not-be-accepted',
    }),
    unknownFieldResponse,
  );
  assert.equal(unknownFieldResponse.statusCode, 400);
  assert.equal(
    (unknownFieldResponse.body as {code: string}).code,
    'invalid_request',
  );

  const modelResponse = new CapturedResponse();
  await setup.handler(
    request('/v1/llm/chat', {
      version: 1,
      provider: 'openai',
      model: 'unapproved-model',
      messages: [{role: 'user', content: 'hello'}],
    }),
    modelResponse,
  );
  assert.equal(modelResponse.statusCode, 400);
  assert.equal((modelResponse.body as {code: string}).code, 'unsupported_model');
});

test('uses only the server-side vault credential for chat', async () => {
  const setup = dependencies();
  await setup.vault.put('user-1', 'openai', 'vault-only-secret');
  const response = new CapturedResponse();

  await setup.handler(
    request('/v1/llm/chat', {
      version: 1,
      provider: 'openai',
      model: 'gpt-5-mini',
      messages: [{role: 'user', content: 'hello'}],
      maxOutputTokens: 100,
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    version: 1,
    provider: 'openai',
    model: 'gpt-5-mini',
    content: 'safe answer',
  });
  assert.equal(setup.upstream.chatCalls[0]?.credential, 'vault-only-secret');
  assert.equal(JSON.stringify(response.body).includes('vault-only-secret'), false);
});

test('enforces exact CORS origins and request rate limits', async () => {
  const setup = dependencies();
  const denied = new CapturedResponse();
  await setup.handler(
    request('/v1/vault/llm/status', undefined, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: 'https://evil.example',
      },
    }),
    denied,
  );
  assert.equal(denied.statusCode, 403);

  const limiter = new FixedWindowApiRateLimiter(1, 60_000);
  let nowMs = 1_000;
  const handler = createShaniApiHandler({
    auth: {verify: async () => ({uid: 'user-1'})},
    vault: setup.vault,
    nightscoutVault: setup.nightscoutVault,
    nightscoutUpstream: {
      validateCredential: async () => undefined,
      range: async () => [],
    },
    upstream: setup.upstream,
    allowedModels: new Set(['gpt-5-mini']),
    allowedOrigins: new Set(),
    rateLimiter: limiter,
    now: () => nowMs,
  });
  const first = new CapturedResponse();
  const second = new CapturedResponse();
  await handler(
    request('/v1/vault/llm/status', undefined, {
      url: '/v1/vault/llm/status?provider=openai',
    }),
    first,
  );
  await handler(
    request('/v1/vault/llm/status', undefined, {
      url: '/v1/vault/llm/status?provider=openai',
    }),
    second,
  );
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);

  nowMs += 60_000;
  const afterWindow = new CapturedResponse();
  await handler(
    request('/v1/vault/llm/status', undefined, {
      url: '/v1/vault/llm/status?provider=openai',
    }),
    afterWindow,
  );
  assert.equal(afterWindow.statusCode, 200);
});

test('unknown paths share one bounded rate-limit bucket', async () => {
  const setup = dependencies();
  const limiter = new FixedWindowApiRateLimiter(1, 60_000);
  const handler = createShaniApiHandler({
    auth: {verify: async () => ({uid: 'user-1'})},
    vault: setup.vault,
    nightscoutVault: setup.nightscoutVault,
    nightscoutUpstream: setup.nightscoutUpstream,
    upstream: setup.upstream,
    allowedModels: new Set(['gpt-5-mini']),
    allowedOrigins: new Set(),
    rateLimiter: limiter,
    now: () => 1_000,
  });
  const first = new CapturedResponse();
  const second = new CapturedResponse();

  await handler(request('/attacker-controlled-a'), first);
  await handler(request('/attacker-controlled-b'), second);

  assert.equal(first.statusCode, 404);
  assert.equal(second.statusCode, 429);
});

test('rejects oversized meal images before the provider call', async () => {
  const setup = dependencies();
  await setup.vault.put('user-1', 'openai', 'vault-only-secret');
  const response = new CapturedResponse();
  const oversizedBase64 = 'A'.repeat(8_000_004);

  await setup.handler(
    request('/v1/llm/meal-image', {
      version: 1,
      provider: 'openai',
      model: 'gpt-5-mini',
      instruction: 'estimate carbs',
      image: {mimeType: 'image/jpeg', base64: oversizedBase64},
    }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(setup.upstream.imageCalls, []);
});

test('validates and stores only a normalized Nightscout credential', async () => {
  const setup = dependencies();
  const response = new CapturedResponse();
  const rawSecret = 'nightscout-private-secret';

  await setup.handler(
    request('/v1/vault/nightscout/provision', {
      version: 1,
      url: 'https://nightscout.example/base',
      apiKey: rawSecret,
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    version: 1,
    configured: true,
    sourceId: 'nightscout_9e111107e040418357de5d4866416ccbd1977d9d',
    workspaceId: 'workspace_d40a4b9197ce10672c75d4d7b4097c2e5a26ff00',
  });
  const stored = await setup.nightscoutVault.get('user-1');
  assert.equal(stored?.url, 'https://nightscout.example/base/');
  assert.match(stored?.apiSecretSha1 ?? '', /^[a-f0-9]{40}$/);
  assert.notEqual(stored?.apiSecretSha1, rawSecret);
  assert.deepEqual(setup.nightscoutCalls.validate, [stored]);
  assert.equal(JSON.stringify(response.body).includes(rawSecret), false);
});

test('proxies a bounded Nightscout range without exposing its credential', async () => {
  const setup = dependencies();
  await setup.nightscoutVault.put('user-1', {
    url: 'https://nightscout.example/',
    apiSecretSha1: 'a'.repeat(40),
  });
  const response = new CapturedResponse();

  await setup.handler(
    request('/v1/nightscout/range', {
      version: 1,
      kind: 'entries',
      ...rangeIdentity(),
      startMs: 1_700_000_000_000,
      endMs: 1_700_086_400_000,
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    version: 1,
    data: [{sgv: 123, date: 1_700_000_000_000}],
  });
  assert.equal(JSON.stringify(response.body).includes('a'.repeat(40)), false);
  assert.equal(setup.nightscoutCalls.range.length, 1);
});

test('rejects an excessive Nightscout range before proxying', async () => {
  const setup = dependencies();
  await setup.nightscoutVault.put('user-1', {
    url: 'https://nightscout.example/',
    apiSecretSha1: 'a'.repeat(40),
  });
  const response = new CapturedResponse();

  await setup.handler(
    request('/v1/nightscout/range', {
      version: 1,
      kind: 'entries',
      ...rangeIdentity(),
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_000_000 + 32 * 24 * 60 * 60 * 1_000,
    }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(setup.nightscoutCalls.range, []);
});

test('accepts a bounded Nightscout devicestatus request', async () => {
  const setup = dependencies();
  await setup.nightscoutVault.put('user-1', {
    url: 'https://nightscout.example/',
    apiSecretSha1: 'a'.repeat(40),
  });
  const response = new CapturedResponse();
  const endMs = 1_700_086_400_000;

  await setup.handler(
    request('/v1/nightscout/range', {
      version: 1,
      kind: 'devicestatus',
      ...rangeIdentity(),
      startMs: endMs - 2 * 60 * 60 * 1_000,
      endMs,
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(setup.nightscoutCalls.range.length, 1);
  assert.equal(setup.nightscoutCalls.range[0]?.request.kind, 'devicestatus');
});

test('rejects a devicestatus request wider than two hours', async () => {
  const setup = dependencies();
  await setup.nightscoutVault.put('user-1', {
    url: 'https://nightscout.example/',
    apiSecretSha1: 'a'.repeat(40),
  });
  const response = new CapturedResponse();
  const endMs = 1_700_086_400_000;

  await setup.handler(
    request('/v1/nightscout/range', {
      version: 1,
      kind: 'devicestatus',
      ...rangeIdentity(),
      startMs: endMs - 2 * 60 * 60 * 1_000 - 1,
      endMs,
    }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(setup.nightscoutCalls.range, []);
});

test('rejects either stale Nightscout identity before calling the upstream', async () => {
  const setup = dependencies();
  const currentUrl = 'https://current-nightscout.example/';
  await setup.nightscoutVault.put('user-1', {
    url: currentUrl,
    apiSecretSha1: 'a'.repeat(40),
  });
  const currentIdentity = rangeIdentity(currentUrl);
  const staleIdentity = rangeIdentity('https://old-nightscout.example/');

  for (const identity of [
    {
      sourceId: staleIdentity.sourceId,
      workspaceId: currentIdentity.workspaceId,
    },
    {
      sourceId: currentIdentity.sourceId,
      workspaceId: staleIdentity.workspaceId,
    },
  ]) {
    const response = new CapturedResponse();
    await setup.handler(
      request('/v1/nightscout/range', {
        version: 1,
        kind: 'entries',
        ...identity,
        startMs: 1_700_000_000_000,
        endMs: 1_700_086_400_000,
      }),
      response,
    );

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, {
      version: 1,
      code: 'nightscout_identity_mismatch',
      message: 'Nightscout Workspace changed; refresh before reading data',
    });
  }
  assert.deepEqual(setup.nightscoutCalls.range, []);
});
