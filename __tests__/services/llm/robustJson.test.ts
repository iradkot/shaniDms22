import {sendJsonWithAdaptiveContext} from '../../../src/services/llm/robustJson';
import {LlmProvider, LlmChatRequest, LlmChatResponse} from '../../../src/services/llm/llmTypes';

class ScriptedProvider implements LlmProvider {
  private script: Array<(req: LlmChatRequest) => LlmChatResponse | Promise<LlmChatResponse>>;
  private idx = 0;

  constructor(script: Array<(req: LlmChatRequest) => LlmChatResponse | Promise<LlmChatResponse>>) {
    this.script = script;
  }

  async sendChat(req: LlmChatRequest): Promise<LlmChatResponse> {
    const fn = this.script[this.idx];
    this.idx += 1;
    if (!fn) {
      throw new Error('Script exhausted');
    }
    return await fn(req);
  }
}

describe('sendJsonWithAdaptiveContext', () => {
  test('uses next context when first throws length-like error', async () => {
    const provider = new ScriptedProvider([
      () => {
        throw new Error('OpenAI response not complete (finish_reason=length)');
      },
      req => {
        expect(String(req.messages?.[1]?.content)).toContain('"mode":"compact"');
        return {content: '{"ok":true}'};
      },
    ]);

    const out = await sendJsonWithAdaptiveContext<{ok: boolean}>({
      provider,
      model: 'x',
      systemInstruction: 'json',
      contexts: [
        {name: 'full', payload: {mode: 'full'}, maxOutputTokens: 500},
        {name: 'compact', payload: {mode: 'compact'}, maxOutputTokens: 900},
      ],
      parse: raw => {
        try {
          return JSON.parse(raw) as {ok: boolean};
        } catch {
          return null;
        }
      },
    });

    expect(out.parsed.ok).toBe(true);
    expect(out.usedContextName).toBe('compact');
    expect(out.traces.length).toBe(2);
  });

  test('throws immediately on non-length transport error', async () => {
    const provider = new ScriptedProvider([
      () => {
        throw new Error('401 Unauthorized');
      },
    ]);

    await expect(
      sendJsonWithAdaptiveContext<{ok: boolean}>({
        provider,
        model: 'x',
        systemInstruction: 'json',
        contexts: [{name: 'full', payload: {x: 1}, maxOutputTokens: 500}],
        parse: () => null,
      }),
    ).rejects.toThrow('401 Unauthorized');
  });
});
