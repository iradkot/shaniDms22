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
            choices: [{message: {content: 'ok'}}],
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

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as any).body);

    expect(firstBody.temperature).toBeDefined();
    expect(secondBody.temperature).toBeUndefined();
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
});
