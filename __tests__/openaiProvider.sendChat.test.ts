import {OpenAIProvider} from 'app/services/llm/providers/openaiProvider';

function makeResponse(params: {ok: boolean; status: number; body?: any}) {
  const bodyText =
    params.body == null ? '' : typeof params.body === 'string' ? params.body : JSON.stringify(params.body);

  return {
    ok: params.ok,
    status: params.status,
    text: async () => bodyText,
  } as any;
}

describe('OpenAIProvider.sendChat', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch as any;
    jest.clearAllMocks();
  });

  it('retries with max_completion_tokens when max_tokens is unsupported', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: false,
          status: 400,
          body: {
            error: {
              message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.",
            },
          },
        }),
      )
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            choices: [{message: {content: 'hello'}}],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'some-model',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 123,
    });

    expect(res.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as any).body);

    expect(firstBody.max_tokens).toBe(123);
    expect(firstBody.max_completion_tokens).toBeUndefined();

    expect(secondBody.max_completion_tokens).toBe(123);
    expect(secondBody.max_tokens).toBeUndefined();
  });

  it('does not retry when maxOutputTokens is not provided', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest.fn(async () =>
      makeResponse({
        ok: false,
        status: 400,
        body: {
          error: {
            message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.",
          },
        },
      }),
    );

    global.fetch = fetchMock as any;

    await expect(
      provider.sendChat({
        model: 'some-model',
        messages: [{role: 'user', content: 'hi'}],
      }),
    ).rejects.toThrow(/unsupported parameter/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries without temperature when temperature is unsupported', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    // For o-models we no longer send temperature by default.
    const fetchMock = jest.fn(async (_url: string, _opts: any) =>
      makeResponse({
        ok: true,
        status: 200,
        body: {
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{type: 'output_text', text: 'ok'}],
            },
          ],
        },
      }),
    );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'o3-mini',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // o-series uses the Responses API.
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/responses$/);

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);

    expect(firstBody.temperature).toBeUndefined();
    expect(firstBody.max_output_tokens).toBe(50);

    expect(firstBody.input?.[0]?.type).toBe('message');
    expect(['input_text', 'output_text']).toContain(firstBody.input?.[0]?.content?.[0]?.type);
    expect(typeof firstBody.input?.[0]?.content?.[0]?.text).toBe('string');
  });

  it('retries without temperature for o-models when temperature is explicitly provided but unsupported', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: false,
          status: 400,
          body: {
            error: {
              message: "Unsupported parameter: 'temperature' is not supported with this model.",
            },
          },
        }),
      )
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{type: 'output_text', text: 'ok'}],
              },
            ],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'o3-mini',
      messages: [{role: 'user', content: 'hi'}],
      temperature: 0.2,
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as any).body);

    expect(firstBody.temperature).toBe(0.2);
    expect(secondBody.temperature).toBeUndefined();
  });

  it('returns partial content when Responses status is incomplete but output_text exists', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest.fn(async (_url: string, _opts: any) =>
      makeResponse({
        ok: true,
        status: 200,
        body: {
          status: 'incomplete',
          incomplete_details: {reason: 'max_output_tokens'},
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{type: 'output_text', text: 'partial but usable'}],
            },
          ],
        },
      }),
    );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'o3-mini',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('partial but usable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries without max_output_tokens for o-models when max_output_tokens is explicitly provided but unsupported', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: false,
          status: 400,
          body: {
            error: {
              message: "Unsupported parameter: 'max_output_tokens' is not supported with this model.",
            },
          },
        }),
      )
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{type: 'output_text', text: 'ok'}],
              },
            ],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'o3-mini',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/responses$/);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/v1\/responses$/);

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as any).body);

    expect(firstBody.max_output_tokens).toBe(50);
    expect(secondBody.max_output_tokens).toBeUndefined();
  });

  it('retries on transient Responses API 5xx errors for o-models', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: false,
          status: 500,
          body: {
            error: {
              message: 'server error',
            },
          },
        }),
      )
      .mockImplementationOnce(async (_url: string, _opts: any) =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{type: 'output_text', text: 'ok'}],
              },
            ],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'o3-mini',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('encodes assistant history as output_text for o-series Responses API', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest.fn(async (_url: string, _opts: any) =>
      makeResponse({
        ok: true,
        status: 200,
        body: {
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{type: 'output_text', text: 'ok'}],
            },
          ],
        },
      }),
    );

    global.fetch = fetchMock as any;

    await provider.sendChat({
      model: 'o3-mini',
      messages: [
        {role: 'system', content: 'sys'},
        {role: 'user', content: 'hi'},
        {role: 'assistant', content: 'previous assistant message'},
        {role: 'user', content: 'follow up'},
      ],
      maxOutputTokens: 50,
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/responses$/);

    const items = body.input;
    expect(items[0].role).toBe('user');
    expect(items[0].content[0].type).toBe('input_text');

    expect(items[1].role).toBe('assistant');
    expect(items[1].content[0].type).toBe('output_text');

    expect(items[2].role).toBe('user');
    expect(items[2].content[0].type).toBe('input_text');
  });

  it('retries once when the response content is empty', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async () =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            choices: [{message: {content: ''}}],
          },
        }),
      )
      .mockImplementationOnce(async () =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            choices: [{message: {content: 'ok'}}],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'some-model',
      messages: [{role: 'user', content: 'hi'}],
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('converts tool_calls into the local tool_call envelope when content is missing', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        body: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'getGlucoseStats',
                      arguments: '{"days":7}',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'some-model',
      messages: [{role: 'user', content: 'hi'}],
    });

    const parsed = JSON.parse(res.content);
    expect(parsed.type).toBe('tool_call');
    expect(parsed.tool_name).toBe('getGlucoseStats');
    expect(parsed.args).toEqual({days: 7});
  });

  it('retries when chat completion finish_reason indicates incomplete output', async () => {
    const provider = new OpenAIProvider({apiKey: 'sk-test'});

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async () =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            choices: [{message: {content: 'partial'}, finish_reason: 'length'}],
          },
        }),
      )
      .mockImplementationOnce(async () =>
        makeResponse({
          ok: true,
          status: 200,
          body: {
            choices: [{message: {content: 'ok'}, finish_reason: 'stop'}],
          },
        }),
      );

    global.fetch = fetchMock as any;

    const res = await provider.sendChat({
      model: 'some-model',
      messages: [{role: 'user', content: 'hi'}],
      maxOutputTokens: 50,
    });

    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
