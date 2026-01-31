import {LlmChatRequest, LlmChatResponse, LlmProvider} from '../llmTypes';
import {isE2E} from 'app/utils/e2e';

export type OpenAiKeyValidationResult =
  | {ok: true; note?: string}
  | {ok: false; reason: 'missing' | 'unauthorized' | 'rate_limited' | 'network' | 'unknown'; message: string};

export async function validateOpenAiApiKey(apiKeyRaw: string): Promise<OpenAiKeyValidationResult> {
  const apiKey = (apiKeyRaw ?? '').trim();
  if (!apiKey) {
    return {ok: false, reason: 'missing', message: 'Missing API key'};
  }

  // Maestro/E2E: avoid live OpenAI calls while still exercising UI state.
  // Use deterministic fake keys:
  // - e2e-openai-valid => OK
  // - e2e-openai-rate => 429-style warning
  // - any other e2e-openai-* => unauthorized
  if (isE2E && apiKey.startsWith('e2e-openai-')) {
    if (apiKey === 'e2e-openai-valid') return {ok: true, note: 'E2E stub: valid'};
    if (apiKey === 'e2e-openai-rate') {
      return {
        ok: false,
        reason: 'rate_limited',
        message: 'E2E stub: 429 (quota/rate limit)',
      };
    }
    return {ok: false, reason: 'unauthorized', message: 'E2E stub: unauthorized'};
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (res.ok) {
      return {ok: true};
    }

    const rawText = await res.text();
    let rawJson: any;
    try {
      rawJson = rawText ? JSON.parse(rawText) : null;
    } catch {
      rawJson = null;
    }

    const msg =
      rawJson?.error?.message ||
      rawJson?.message ||
      `OpenAI request failed (${res.status})`;

    if (res.status === 401 || res.status === 403) {
      return {ok: false, reason: 'unauthorized', message: msg};
    }

    if (res.status === 429) {
      // This can be a valid key with exhausted quota or temporary rate limiting.
      return {ok: false, reason: 'rate_limited', message: msg};
    }

    return {ok: false, reason: 'unknown', message: msg};
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Network error';
    return {ok: false, reason: 'network', message: msg};
  }
}

export class OpenAIProvider implements LlmProvider {
  private apiKey: string;

  constructor(params: {apiKey: string}) {
    this.apiKey = params.apiKey;
  }

  async sendChat(req: LlmChatRequest): Promise<LlmChatResponse> {
    const apiKey = (this.apiKey ?? '').trim();
    if (!apiKey) {
      throw new Error('Missing OpenAI API key');
    }

    // Maestro/E2E: deterministic stubbed responses (no real network, no token spend).
    if (isE2E && apiKey.startsWith('e2e-openai-')) {
      const lastUserMsg = [...(req.messages ?? [])]
        .reverse()
        .find(m => m?.role === 'user')?.content;

      const content =
        typeof lastUserMsg === 'string' && lastUserMsg.trim()
          ? `E2E stubbed OpenAI response. You said: ${lastUserMsg.trim()}`
          : 'E2E stubbed OpenAI response.';

      return {
        content,
        raw: {stub: true, provider: 'openai', model: req.model},
      };
    }

    const normalizedMaxOutputTokens =
      typeof req.maxOutputTokens === 'number'
        ? Math.max(1, Math.round(req.maxOutputTokens))
        : null;

    const normalizedTemperature =
      typeof req.temperature === 'number' ? req.temperature : 0.3;

    type TokenParamName = 'max_tokens' | 'max_completion_tokens';

    type PostOptions = {
      tokenParamName: TokenParamName | null;
      includeTemperature: boolean;
    };

    const buildPayload = (options: PostOptions) => {
      const payload: any = {
        model: req.model,
        messages: req.messages,
      };

      // Some OpenAI-compatible backends/models reject `temperature` entirely.
      if (options.includeTemperature) {
        payload.temperature = normalizedTemperature;
      }

      // Some OpenAI-compatible backends accept `max_completion_tokens` instead of `max_tokens`.
      if (normalizedMaxOutputTokens != null && options.tokenParamName) {
        payload[options.tokenParamName] = normalizedMaxOutputTokens;
      }

      return payload;
    };

    const extractUnsupportedParam = (msg: string): 'max_tokens' | 'max_completion_tokens' | 'temperature' | null => {
      if (!/unsupported parameter/i.test(msg)) return null;

      // Prefer the explicit "Unsupported parameter: 'X'" name when present.
      const m = msg.match(/unsupported\s+parameter\s*:\s*['"]([^'"]+)['"]/i);
      const explicit = (m?.[1] ?? '').trim();
      if (explicit === 'max_tokens' || explicit === 'max_completion_tokens' || explicit === 'temperature') {
        return explicit;
      }

      // Fallback: infer based on mention.
      if (/max_completion_tokens/i.test(msg)) return 'max_completion_tokens';
      if (/max_tokens/i.test(msg)) return 'max_tokens';
      if (/temperature/i.test(msg)) return 'temperature';
      return null;
    };

    const postOnce = async (options: PostOptions) => {
      const payload = buildPayload(options);

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let rawJson: any;
      try {
        rawJson = rawText ? JSON.parse(rawText) : null;
      } catch {
        rawJson = null;
      }

      const msg =
        rawJson?.error?.message ||
        rawJson?.message ||
        `OpenAI request failed (${res.status})`;

      if (!res.ok) {
        const err = new Error(msg) as Error & {raw?: any; status?: number};
        err.raw = rawJson;
        err.status = res.status;
        throw err;
      }

      const message0 = rawJson?.choices?.[0]?.message;

      const coerceContentToString = (value: any): string => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
          // Some OpenAI-compatible backends return a Responses-style content array.
          // Try to join text parts, ignoring non-text parts.
          const textParts = value
            .map((part: any) => {
              if (typeof part === 'string') return part;
              if (typeof part?.text === 'string') return part.text;
              if (typeof part?.content === 'string') return part.content;
              return '';
            })
            .filter(Boolean);
          return textParts.join('');
        }
        return '';
      };

      let content =
        coerceContentToString(message0?.content) ||
        coerceContentToString(rawJson?.choices?.[0]?.text) ||
        '';

      // If the backend returns tool calls but no content, convert to our local
      // tool-envelope protocol so the rest of the app can execute tools.
      if ((!content || !content.trim()) && Array.isArray(message0?.tool_calls) && message0.tool_calls.length > 0) {
        const firstCall = message0.tool_calls[0];
        const fnName = firstCall?.function?.name;
        const fnArgsRaw = firstCall?.function?.arguments;
        let fnArgs: any = fnArgsRaw;
        if (typeof fnArgsRaw === 'string') {
          try {
            fnArgs = fnArgsRaw ? JSON.parse(fnArgsRaw) : {};
          } catch {
            fnArgs = fnArgsRaw;
          }
        }

        if (typeof fnName === 'string' && fnName.trim()) {
          content = JSON.stringify({type: 'tool_call', tool_name: fnName.trim(), args: fnArgs});
        }
      }

      if (typeof content !== 'string' || !content.trim()) {
        const err = new Error('Empty response from OpenAI') as Error & {raw?: any; isEmptyResponse?: boolean};
        err.raw = rawJson;
        err.isEmptyResponse = true;
        throw err;
      }

      return {content, rawJson};
    };

    const postWithSingleRetryOnEmpty = async (options: PostOptions) => {
      try {
        return await postOnce(options);
      } catch (e: any) {
        const isEmpty =
          e?.isEmptyResponse === true ||
          (typeof e?.message === 'string' && /empty response from openai/i.test(e.message));
        if (!isEmpty) throw e;
        return await postOnce(options);
      }
    };

    const candidates: PostOptions[] = [];
    const tokenCandidates: Array<TokenParamName | null> =
      normalizedMaxOutputTokens == null
        ? [null]
        : ['max_tokens', 'max_completion_tokens'];

    for (const tokenParamName of tokenCandidates) {
      candidates.push({tokenParamName, includeTemperature: true});
    }
    for (const tokenParamName of tokenCandidates) {
      candidates.push({tokenParamName, includeTemperature: false});
    }

    let banned: Set<'max_tokens' | 'max_completion_tokens' | 'temperature'> = new Set();
    let lastErr: any = null;

    for (const options of candidates) {
      if (options.includeTemperature && banned.has('temperature')) continue;
      if (options.tokenParamName && banned.has(options.tokenParamName)) continue;

      try {
        const {content, rawJson} = await postWithSingleRetryOnEmpty(options);
        return {content, raw: rawJson};
      } catch (e: any) {
        lastErr = e;
        const msg = typeof e?.message === 'string' ? e.message : '';
        const unsupportedParam = extractUnsupportedParam(msg);

        // Only auto-retry for known unsupported-parameter cases; otherwise surface the error.
        if (!unsupportedParam) throw e;

        // Only retry if we actually sent the offending parameter.
        const sentUnsupportedParam =
          (unsupportedParam === 'temperature' && options.includeTemperature) ||
          (unsupportedParam !== 'temperature' && options.tokenParamName === unsupportedParam);

        if (!sentUnsupportedParam) {
          throw e;
        }

        banned.add(unsupportedParam);
        continue;
      }
    }

    throw lastErr ?? new Error('OpenAI request failed');
  }
}
