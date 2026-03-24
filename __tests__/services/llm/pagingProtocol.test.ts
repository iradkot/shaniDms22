import {collectPagedTextFromLlm} from '../../../src/services/llm/pagingProtocol';
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

describe('collectPagedTextFromLlm', () => {
  test('collects one-page response', async () => {
    const provider = new ScriptedProvider([
      () => ({content: JSON.stringify({page: 1, has_more: false, chunk: 'שלום עולם'})}),
    ]);

    const out = await collectPagedTextFromLlm({
      provider,
      model: 'x',
      baseSystemInstruction: 'Return report',
      payload: {x: 1},
      maxPages: 4,
    });

    expect(out.text).toBe('שלום עולם');
    expect(out.pagesUsed).toBe(1);
    expect(out.truncated).toBe(false);
  });

  test('collects multi-page response', async () => {
    const provider = new ScriptedProvider([
      () => ({content: JSON.stringify({page: 1, has_more: true, chunk: 'AAA'})}),
      () => ({content: JSON.stringify({page: 2, has_more: true, chunk: 'BBB'})}),
      () => ({content: JSON.stringify({page: 3, has_more: false, chunk: 'CCC'})}),
    ]);

    const out = await collectPagedTextFromLlm({
      provider,
      model: 'x',
      baseSystemInstruction: 'Return report',
      payload: {x: 1},
      maxPages: 5,
    });

    expect(out.text).toBe('AAABBBCCC');
    expect(out.pagesUsed).toBe(3);
    expect(out.truncated).toBe(false);
  });

  test('retries same page when JSON is invalid', async () => {
    const provider = new ScriptedProvider([
      () => ({content: 'not json'}),
      () => ({content: JSON.stringify({page: 1, has_more: false, chunk: 'OK'})}),
    ]);

    const out = await collectPagedTextFromLlm({
      provider,
      model: 'x',
      baseSystemInstruction: 'Return report',
      payload: {x: 1},
      maxAttemptsPerPage: 2,
    });

    expect(out.text).toBe('OK');
    expect(out.traces.some(t => t.error === 'invalid_json_chunk')).toBe(true);
  });

  test('retries with larger token budget after length-like error', async () => {
    const provider = new ScriptedProvider([
      () => {
        const e: any = new Error('OpenAI response not complete (finish_reason=length)');
        throw e;
      },
      req => {
        expect((req.maxOutputTokens ?? 0)).toBeGreaterThan(1000);
        return {content: JSON.stringify({page: 1, has_more: false, chunk: 'DONE'})};
      },
    ]);

    const out = await collectPagedTextFromLlm({
      provider,
      model: 'x',
      baseSystemInstruction: 'Return report',
      payload: {x: 1},
      maxOutputTokensPerPage: 1000,
      maxAttemptsPerPage: 3,
    });

    expect(out.text).toBe('DONE');
  });

  test('marks truncated when max pages reached', async () => {
    const provider = new ScriptedProvider([
      () => ({content: JSON.stringify({page: 1, has_more: true, chunk: 'A'})}),
      () => ({content: JSON.stringify({page: 2, has_more: true, chunk: 'B'})}),
    ]);

    const out = await collectPagedTextFromLlm({
      provider,
      model: 'x',
      baseSystemInstruction: 'Return report',
      payload: {x: 1},
      maxPages: 2,
    });

    expect(out.text).toBe('AB');
    expect(out.truncated).toBe(true);
  });
});
