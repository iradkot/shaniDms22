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
