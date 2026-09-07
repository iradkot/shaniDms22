import assert from 'node:assert/strict';
import test from 'node:test';

import {OpenAiUpstream, UpstreamError} from './openAiUpstream';

const response = (
  status: number,
  value: Readonly<Record<string, unknown>>,
) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(value),
});

const request = {
  version: 1 as const,
  provider: 'openai' as const,
  model: 'gpt-5-mini',
  messages: [
    {role: 'system' as const, content: 'Use evidence only.'},
    {role: 'user' as const, content: 'Summarize today.'},
    {role: 'assistant' as const, content: 'Earlier answer.'},
  ],
  temperature: 0.2,
  maxOutputTokens: 300,
};

test('uses Responses API without exposing the credential in its body', async () => {
  const calls: Array<{url: string; init: RequestInit | undefined}> = [];
  const upstream = new OpenAiUpstream(async (url, init) => {
    calls.push({url, init});
    return response(200, {output_text: '  useful answer  '});
  });

  assert.equal(await upstream.chat('private-provider-key', request), 'useful answer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.openai.com/v1/responses');
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).Authorization,
    'Bearer private-provider-key',
  );
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(JSON.stringify(body).includes('private-provider-key'), false);
  assert.equal(body.instructions, 'Use evidence only.');
  assert.equal(body.input[1].content[0].type, 'output_text');
});

test('retries after removing optional parameters rejected by a model', async () => {
  const bodies: Record<string, unknown>[] = [];
  const replies = [
    response(400, {
      error: {message: "Unsupported parameter: 'temperature'."},
    }),
    response(400, {
      error: {message: "'max_output_tokens' is not supported by this model."},
    }),
    response(200, {output_text: 'ok'}),
  ];
  const upstream = new OpenAiUpstream(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return replies.shift() ?? response(500, {error: {message: 'unexpected'}});
  });

  assert.equal(await upstream.chat('key', request), 'ok');
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0]?.temperature, 0.2);
  assert.equal(bodies[0]?.max_output_tokens, 300);
  assert.equal('temperature' in (bodies[1] ?? {}), false);
  assert.equal(bodies[1]?.max_output_tokens, 300);
  assert.equal('max_output_tokens' in (bodies[2] ?? {}), false);
});

test('retries one transient provider failure and one empty success', async () => {
  const replies = [
    response(500, {error: {message: 'temporary'}}),
    response(200, {output: []}),
    response(200, {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{type: 'output_text', text: 'recovered'}],
        },
      ],
    }),
  ];
  const upstream = new OpenAiUpstream(async () =>
    replies.shift() ?? response(500, {error: {message: 'unexpected'}}),
  );

  assert.equal(await upstream.chat('key', request), 'recovered');
  assert.equal(replies.length, 0);
});

test('does not retry rate limits', async () => {
  let calls = 0;
  const upstream = new OpenAiUpstream(async () => {
    calls += 1;
    return response(429, {error: {message: 'rate limit'}});
  });

  await assert.rejects(
    upstream.chat('key', request),
    (error: unknown) =>
      error instanceof UpstreamError &&
      error.status === 429 &&
      error.code === 'rate_limited',
  );
  assert.equal(calls, 1);
});

const imageRequest = {
  version: 1 as const,
  provider: 'openai' as const,
  model: 'gpt-5-mini',
  instruction: 'Estimate carbohydrates.',
  image: {mimeType: 'image/jpeg' as const, base64: 'aW1hZ2U='},
};

const providerFailures = [
  {status: 401, error: {code: 'invalid_api_key'}, expectedStatus: 401, code: 'invalid_credential'},
  {status: 401, error: {code: 'insufficient_permissions'}, expectedStatus: 403, code: 'provider_permission_denied'},
  {status: 403, error: {code: 'permission_denied'}, expectedStatus: 403, code: 'provider_permission_denied'},
  {status: 404, error: {code: 'model_not_found'}, expectedStatus: 400, code: 'provider_model_unavailable'},
  {status: 429, error: {type: 'insufficient_quota'}, expectedStatus: 429, code: 'provider_quota_exceeded'},
  {status: 429, error: {code: 'credit_balance_exhausted'}, expectedStatus: 429, code: 'provider_quota_exceeded'},
  {status: 429, error: {code: 'organization_spend_limit_exceeded'}, expectedStatus: 429, code: 'provider_quota_exceeded'},
  {status: 429, error: {code: 'project_spend_limit_exceeded'}, expectedStatus: 429, code: 'provider_quota_exceeded'},
  {status: 429, error: {code: 'organization_usage_limit_exceeded'}, expectedStatus: 429, code: 'provider_quota_exceeded'},
  {status: 429, error: {code: 'rate_limit_exceeded'}, expectedStatus: 429, code: 'rate_limited'},
  {status: 503, error: {code: 'server_is_overloaded'}, expectedStatus: 502, code: 'upstream_unavailable'},
];

for (const operation of ['chat', 'image', 'test'] as const) {
  for (const failure of providerFailures) {
    test(`${operation} distinguishes ${failure.error.code ?? failure.error.type} without exposing provider details`, async () => {
      let calls = 0;
      const upstream = new OpenAiUpstream(async () => {
        calls += 1;
        return response(failure.status, {
          error: {...failure.error, message: 'private-provider-key: private upstream details'},
        });
      });
      const invoke = () => operation === 'chat'
        ? upstream.chat('private-provider-key', request)
        : operation === 'image'
          ? upstream.analyzeMealImage('private-provider-key', imageRequest)
          : upstream.testConnection('private-provider-key', 'gpt-5-mini');

      await assert.rejects(invoke, (error: unknown) => {
        assert.ok(error instanceof UpstreamError);
        assert.equal(error.status, failure.expectedStatus);
        assert.equal(error.code, failure.code);
        assert.equal(error.message.includes('private'), false);
        return true;
      });
      assert.equal(calls, operation === 'chat' && failure.status >= 500 ? 2 : 1);
    });
  }
}

test('connection test uses one bounded neutral Responses request and accepts reasoning token exhaustion', async () => {
  const calls: Array<{url: string; init: RequestInit | undefined}> = [];
  const upstream = new OpenAiUpstream(async (url, init) => {
    calls.push({url, init});
    return response(200, {
      id: 'resp_connection_test',
      object: 'response',
      status: 'incomplete',
      incomplete_details: {reason: 'max_output_tokens'},
      output: [],
    });
  });

  await upstream.testConnection('private-provider-key', 'gpt-5-mini');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.openai.com/v1/responses');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    model: 'gpt-5-mini',
    input: 'Reply with OK.',
    max_output_tokens: 16,
    store: false,
  });
});

test('credential validation reports missing model-list permission separately from an invalid key', async () => {
  const upstream = new OpenAiUpstream(async () => response(403, {
    error: {code: 'insufficient_permissions', message: 'private provider details'},
  }));
  await assert.rejects(upstream.validateCredential('private-provider-key'),
    (error: unknown) => error instanceof UpstreamError && error.code === 'provider_permission_denied');
});

test('a completed Responses request confirms the connection without returning its contents', async () => {
  const upstream = new OpenAiUpstream(async () => response(200, {
    id: 'resp_test', object: 'response', status: 'completed', output_text: 'OK',
  }));
  assert.equal(await upstream.testConnection('key', 'gpt-5-mini'), undefined);
});

test('connection test does not mistake an unfinished, failed or malformed response for success', async () => {
  for (const value of [
    {},
    {id: 'resp_test', object: 'response', status: 'queued'},
    {id: 'resp_test', object: 'response', status: 'failed'},
    {id: 'resp_test', object: 'response', status: 'incomplete', incomplete_details: {reason: 'content_filter'}},
  ]) {
    let calls = 0;
    const upstream = new OpenAiUpstream(async () => {
      calls += 1;
      return response(200, value);
    });
    await assert.rejects(upstream.testConnection('key', 'gpt-5-mini'),
      (error: unknown) => error instanceof UpstreamError && error.status === 502);
    assert.equal(calls, 1);
  }
});

test('connection test preserves a failed Responses envelope diagnosis', async () => {
  const upstream = new OpenAiUpstream(async () => response(200, {
    id: 'resp_test', object: 'response', status: 'failed',
    error: {code: 'rate_limit_exceeded', message: 'private provider details'},
  }));
  await assert.rejects(upstream.testConnection('key', 'gpt-5-mini'),
    (error: unknown) => error instanceof UpstreamError && error.code === 'rate_limited');
});

test('connection test handles an HTML provider outage without returning its body', async () => {
  const upstream = new OpenAiUpstream(async () => ({
    ok: false, status: 503, text: async () => '<html>private upstream details</html>',
  }));
  await assert.rejects(upstream.testConnection('key', 'gpt-5-mini'),
    (error: unknown) => error instanceof UpstreamError &&
      error.code === 'upstream_unavailable' && !error.message.includes('private'));
});

test('connection test distinguishes transport outages from timeouts without retries', async () => {
  for (const timeout of [false, true]) {
    let calls = 0;
    const upstream = new OpenAiUpstream(async (_url, init) => {
      calls += 1;
      if (timeout) await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private timeout details')), {once: true});
      });
      throw new Error('private network details');
    }, 1);
    await assert.rejects(upstream.testConnection('key', 'gpt-5-mini'),
      (error: unknown) => error instanceof UpstreamError &&
        error.code === (timeout ? 'upstream_timeout' : 'upstream_unavailable') &&
        !error.message.includes('private'));
    assert.equal(calls, 1);
  }
});

test('model-list access alone does not prove usable Responses access', async () => {
  const upstream = new OpenAiUpstream(async url => url.endsWith('/models')
    ? response(200, {data: [{id: 'gpt-5-mini'}]})
    : response(429, {error: {code: 'credit_balance_exhausted'}}));
  assert.deepEqual(await upstream.validateCredential('key'), {valid: true});
  await assert.rejects(upstream.testConnection('key', 'gpt-5-mini'),
    (error: unknown) => error instanceof UpstreamError && error.code === 'provider_quota_exceeded');
});
