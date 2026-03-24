import {LlmProvider} from './llmTypes';

export type JsonAttemptContext = {
  name: string;
  payload: unknown;
  maxOutputTokens: number;
};

export type JsonAttemptTrace = {
  name: string;
  maxOutputTokens: number;
  ok: boolean;
  error?: string;
};

export type SendJsonAdaptiveParams<T> = {
  provider: LlmProvider;
  model: string;
  systemInstruction: string;
  contexts: JsonAttemptContext[];
  temperature?: number;
  parse: (raw: string) => T | null;
};

export type SendJsonAdaptiveResult<T> = {
  parsed: T;
  raw: string;
  usedContextName: string;
  traces: JsonAttemptTrace[];
};

function isLengthLikeError(err: any): boolean {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  return msg.includes('finish_reason=length') || msg.includes('not complete') || msg.includes('max tokens');
}

export async function sendJsonWithAdaptiveContext<T>(
  params: SendJsonAdaptiveParams<T>,
): Promise<SendJsonAdaptiveResult<T>> {
  const traces: JsonAttemptTrace[] = [];
  let lastErr: any = null;

  for (const ctx of params.contexts) {
    try {
      const res = await params.provider.sendChat({
        model: params.model,
        messages: [
          {role: 'system', content: params.systemInstruction},
          {role: 'user', content: JSON.stringify(ctx.payload)},
        ],
        temperature: params.temperature ?? 0.2,
        maxOutputTokens: ctx.maxOutputTokens,
      });

      const raw = String(res?.content ?? '').trim();
      const parsed = params.parse(raw);
      if (!parsed) {
        const err = new Error('Model returned invalid JSON payload');
        traces.push({name: ctx.name, maxOutputTokens: ctx.maxOutputTokens, ok: false, error: String(err.message)});
        lastErr = err;
        continue;
      }

      traces.push({name: ctx.name, maxOutputTokens: ctx.maxOutputTokens, ok: true});
      return {parsed, raw, usedContextName: ctx.name, traces};
    } catch (e: any) {
      const errMsg = String(e?.message ?? e);
      traces.push({name: ctx.name, maxOutputTokens: ctx.maxOutputTokens, ok: false, error: errMsg});
      lastErr = e;

      if (!isLengthLikeError(e)) {
        throw e;
      }
    }
  }

  throw lastErr ?? new Error('Unable to produce valid JSON response');
}
