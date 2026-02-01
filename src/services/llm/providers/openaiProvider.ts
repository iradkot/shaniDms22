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

    const hasExplicitTemperature = typeof req.temperature === 'number';
    const normalizedTemperature = hasExplicitTemperature ? (req.temperature as number) : 0.3;

    // React Native defines a global __DEV__. Keep this defensive for tests/Node.
    const isDev = (() => {
      try {
        return typeof (__DEV__ as any) !== 'undefined' ? Boolean((__DEV__ as any)) : false;
      } catch {
        return false;
      }
    })();

    type UnsupportedParamResponses = 'max_output_tokens' | 'temperature';
    type UnsupportedParamChat = 'max_tokens' | 'max_completion_tokens' | 'temperature';

    const extractUnsupportedParamResponses = (msg: string): UnsupportedParamResponses | null => {
      if (!/unsupported parameter/i.test(msg)) return null;

      // Prefer the explicit "Unsupported parameter: 'X'" name when present.
      const m = msg.match(/unsupported\s+parameter\s*:\s*['"]([^'"]+)['"]/i);
      const explicit = (m?.[1] ?? '').trim();
      if (explicit === 'max_output_tokens' || explicit === 'temperature') {
        return explicit;
      }

      // Fallback: infer based on mention.
      if (/max_output_tokens/i.test(msg)) return 'max_output_tokens';
      if (/temperature/i.test(msg)) return 'temperature';
      return null;
    };

    const extractUnsupportedParamChat = (msg: string): UnsupportedParamChat | null => {
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

    const postWithRetries = async <T>(
      fn: () => Promise<T>,
      classify: (e: any) => {retryable: boolean; kind: 'empty' | 'incomplete' | 'other'},
    ) => {
      const delaysMs = [0, 250, 500];
      let last: any = null;
      for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
        if (delaysMs[attempt] > 0) {
          await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
        }
        try {
          return await fn();
        } catch (e: any) {
          last = e;
          const c = classify(e);
          if (!c.retryable) throw e;

          try {
            console.warn('[OpenAIProvider] Retryable response issue', {
              attempt: attempt + 1,
              kind: c.kind,
              status: e?.status ?? null,
              reason:
                typeof e?.raw?.incomplete_details?.reason === 'string'
                  ? e.raw.incomplete_details.reason
                  : null,
            });
          } catch {}
          continue;
        }
      }
      throw last;
    };

    // Heuristic: treat models starting with "o" as o-series and use the Responses API.
    const isOModel = (req.model ?? '').trim().startsWith('o');

    // Prefer the Responses API for o-series (reasoning/thinking) models.
    if (isOModel) {
      type RespPostOptions = {includeTemperature: boolean; includeMaxOutputTokens: boolean};

      type ResponsesContentPart =
        | {type: 'input_text'; text: string}
        | {type: 'output_text'; text: string}
        | {type: 'refusal'; text?: string; refusal?: string};

      type ResponsesInputMessage = {
        type: 'message';
        role: 'user' | 'assistant' | string;
        content: [ResponsesContentPart];
      };

      const extractResponsesContent = (rawJson: any): {content: string; isRefusal: boolean} => {
        const texts: string[] = [];
        let refusalText = '';

        if (typeof rawJson?.output_text === 'string' && rawJson.output_text.trim()) {
          return {content: rawJson.output_text, isRefusal: false};
        }

        const outputs: any[] = Array.isArray(rawJson?.output) ? rawJson.output : [];
        for (const item of outputs) {
          // Some backends may emit direct output_text items.
          if (item?.type === 'output_text' && typeof item?.text === 'string') {
            texts.push(item.text);
            continue;
          }

          if (item?.type !== 'message') continue;
          if (item?.role !== 'assistant') continue;

          const parts = Array.isArray(item?.content) ? item.content : [];
          for (const part of parts) {
            if (part?.type === 'output_text' && typeof part?.text === 'string') {
              texts.push(part.text);
              continue;
            }

            // If the model refused, surface that message instead of treating it as empty.
            if (part?.type === 'refusal') {
              const t =
                typeof part?.text === 'string'
                  ? part.text
                  : typeof part?.refusal === 'string'
                    ? part.refusal
                    : '';
              if (t && t.trim()) refusalText = refusalText ? `${refusalText}\n${t}` : t;
            }
          }
        }

        const content = texts.join('');
        if (content && content.trim()) return {content, isRefusal: false};
        if (refusalText && refusalText.trim()) return {content: refusalText, isRefusal: true};
        return {content: '', isRefusal: false};
      };

      const buildResponsesPayload = (options: RespPostOptions) => {
        const systemParts = (req.messages ?? [])
          .filter(m => m?.role === 'system')
          .map(m => (typeof m?.content === 'string' ? m.content : String(m?.content ?? '')))
          .map(s => s.trim())
          .filter(Boolean);

        const instructions = systemParts.length ? systemParts.join('\n\n') : undefined;

        const input: ResponsesInputMessage[] = (req.messages ?? [])
          .filter(m => m?.role !== 'system')
          .map(m => {
            const text = typeof m?.content === 'string' ? m.content : String(m?.content ?? '');

            // Responses API expects prior assistant messages to be represented as output parts
            // (output_text/refusal). User messages are represented as input parts (input_text).
            const partType = m.role === 'assistant' ? 'output_text' : 'input_text';
            return {
              type: 'message',
              role: m.role,
              content: [{type: partType, text}],
            };
          });

        // Invariant: assistant history must be encoded as output parts (output_text or refusal).
        // This is the exact root cause of the runtime error:
        // "Invalid value: 'input_text'. Supported values are: 'output_text' and 'refusal'."
        for (const item of input) {
          const role = item.role;
          const partType = item.content?.[0]?.type;
          if (role === 'assistant' && partType !== 'output_text' && partType !== 'refusal') {
            throw new Error(
              `OpenAIProvider invariant violation: assistant history must use output_text or refusal (got ${String(partType)})`,
            );
          }
          if (role === 'user' && partType !== 'input_text') {
            throw new Error(
              `OpenAIProvider invariant violation: user history must use input_text (got ${String(partType)})`,
            );
          }
        }

        const payload: any = {
          model: req.model,
          input,
        };

        if (instructions) payload.instructions = instructions;
        if (options.includeMaxOutputTokens && normalizedMaxOutputTokens != null) {
          payload.max_output_tokens = normalizedMaxOutputTokens;
        }
        // o-series models commonly reject temperature unless explicitly supported.
        // Only send temperature if the caller explicitly provided one.
        if (options.includeTemperature && hasExplicitTemperature) payload.temperature = normalizedTemperature;

        // Dev-only, PHI-safe diagnostics: roles + part types only.
        if (isDev) {
          try {
            console.debug('[OpenAIProvider] Responses request (meta)', {
              model: req.model,
              hasInstructions: Boolean(instructions),
              max_output_tokens: payload.max_output_tokens ?? null,
              includeTemperature: options.includeTemperature,
              input: input.map(it => ({role: it.role, contentType: it.content?.[0]?.type})),
            });
          } catch {}
        }

        return payload;
      };

      const postResponsesOnce = async (options: RespPostOptions) => {
        const payload = buildResponsesPayload(options);

        const res = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: (req as any).abortSignal,
          body: JSON.stringify(payload),
        });

        const rawText = await res.text();
        let rawJson: any;
        try {
          rawJson = rawText ? JSON.parse(rawText) : null;
        } catch {
          rawJson = null;
        }

        const msg = rawJson?.error?.message || rawJson?.message || `OpenAI request failed (${res.status})`;

        if (!res.ok) {
          if (isDev) {
            try {
              console.warn('[OpenAIProvider] Responses API error', {
                status: res.status,
                message: msg,
              });
            } catch {}
          }
          const err = new Error(msg) as Error & {raw?: any; status?: number};
          err.raw = rawJson;
          err.status = res.status;
          (err as any).isServerError = typeof res.status === 'number' && res.status >= 500;
          (err as any).isRateLimited = res.status === 429;
          (err as any).isTimeout = res.status === 408;
          throw err;
        }

        const extracted = extractResponsesContent(rawJson);
        const content = extracted.content;

        const status = typeof rawJson?.status === 'string' ? rawJson.status : null;
        if (status && status !== 'completed') {
          // The API can return status=incomplete with partial content.
          // Prefer returning partial content over failing the UI.
          if (typeof content === 'string' && content.trim()) {
            if (isDev) {
              try {
                console.warn('[OpenAIProvider] Responses returned non-completed status with partial content', {
                  status,
                  incomplete_details: rawJson?.incomplete_details ?? null,
                });
              } catch {}
            }
            return {content, rawJson};
          }

          const reason =
            typeof rawJson?.incomplete_details?.reason === 'string'
              ? rawJson.incomplete_details.reason
              : null;
          const err = new Error(
            reason ? `OpenAI response not completed (${status}; reason=${reason})` : `OpenAI response not completed (${status})`,
          ) as Error & {
            raw?: any;
            isIncompleteResponse?: boolean;
            status?: string;
          };
          err.raw = rawJson;
          err.status = status;
          err.isIncompleteResponse = true;
          throw err;
        }

        if (typeof content !== 'string' || !content.trim()) {
          const err = new Error('Empty response from OpenAI') as Error & {raw?: any; isEmptyResponse?: boolean};
          err.raw = rawJson;
          err.isEmptyResponse = true;
          throw err;
        }

        return {content, rawJson};
      };

      const candidates: RespPostOptions[] = [];
      const tempCandidates = hasExplicitTemperature ? [true, false] : [false];
      const tokenCandidates = normalizedMaxOutputTokens != null ? [true, false] : [false];
      for (const includeTemperature of tempCandidates) {
        for (const includeMaxOutputTokens of tokenCandidates) {
          candidates.push({includeTemperature, includeMaxOutputTokens});
        }
      }

      let banned: Set<'temperature' | 'max_output_tokens'> = new Set();
      let lastErr: any = null;

      for (const options of candidates) {
        if (options.includeTemperature && banned.has('temperature')) continue;
        if (options.includeMaxOutputTokens && banned.has('max_output_tokens')) continue;

        try {
          const {content, rawJson} = await postWithRetries(
            () => postResponsesOnce(options),
            e => {
              const isEmpty = e?.isEmptyResponse === true;
              const isIncomplete = e?.isIncompleteResponse === true;
              const isTransientHttp = e?.isServerError === true || e?.isRateLimited === true || e?.isTimeout === true;
              return {
                retryable: isEmpty || isIncomplete || isTransientHttp,
                kind: isEmpty ? 'empty' : isIncomplete ? 'incomplete' : 'other',
              };
            },
          );
          return {content, raw: rawJson};
        } catch (e: any) {
          lastErr = e;
          const msg = typeof e?.message === 'string' ? e.message : '';
          const unsupportedParam = extractUnsupportedParamResponses(msg);
          if (!unsupportedParam) throw e;

          if (unsupportedParam === 'temperature' && options.includeTemperature) {
            banned.add('temperature');
            continue;
          }

          if (unsupportedParam === 'max_output_tokens' && options.includeMaxOutputTokens) {
            banned.add('max_output_tokens');
            continue;
          }

          // Unknown/irrelevant unsupported parameter for this endpoint.
          throw e;
        }
      }

      throw lastErr ?? new Error('OpenAI request failed');
    }

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

    const postOnce = async (options: PostOptions) => {
      const payload = buildPayload(options);

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: (req as any).abortSignal,
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

      const finishReason = rawJson?.choices?.[0]?.finish_reason;
      if (
        typeof finishReason === 'string' &&
        finishReason &&
        finishReason !== 'stop' &&
        finishReason !== 'tool_calls' &&
        finishReason !== 'function_call'
      ) {
        const err = new Error(`OpenAI response not complete (finish_reason=${finishReason})`) as Error & {
          raw?: any;
          isIncompleteResponse?: boolean;
          finishReason?: string;
        };
        err.raw = rawJson;
        err.isIncompleteResponse = true;
        err.finishReason = finishReason;
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

    const postWithRetriesOnBadOutput = async (options: PostOptions) => {
      return postWithRetries(
        () => postOnce(options),
        e => {
          const isEmpty =
            e?.isEmptyResponse === true ||
            (typeof e?.message === 'string' && /empty response from openai/i.test(e.message));
          const isIncomplete = e?.isIncompleteResponse === true;
          return {
            retryable: isEmpty || isIncomplete,
            kind: isEmpty ? 'empty' : isIncomplete ? 'incomplete' : 'other',
          };
        },
      );
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
        const {content, rawJson} = await postWithRetriesOnBadOutput(options);
        return {content, raw: rawJson};
      } catch (e: any) {
        lastErr = e;
        const msg = typeof e?.message === 'string' ? e.message : '';
        const unsupportedParam = extractUnsupportedParamChat(msg);

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
