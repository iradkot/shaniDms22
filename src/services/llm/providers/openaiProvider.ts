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

    const payload = {
      model: req.model,
      messages: req.messages,
      temperature: typeof req.temperature === 'number' ? req.temperature : 0.3,
      // Keep this optional: some OpenAI models accept `max_completion_tokens`, others accept `max_tokens`.
      ...(typeof req.maxOutputTokens === 'number'
        ? {max_tokens: Math.max(1, Math.round(req.maxOutputTokens))}
        : null),
    };

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

    if (!res.ok) {
      const msg =
        rawJson?.error?.message ||
        rawJson?.message ||
        `OpenAI request failed (${res.status})`;
      throw new Error(msg);
    }

    const content =
      rawJson?.choices?.[0]?.message?.content ??
      rawJson?.choices?.[0]?.text ??
      '';

    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Empty response from OpenAI');
    }

    return {content, raw: rawJson};
  }
}
