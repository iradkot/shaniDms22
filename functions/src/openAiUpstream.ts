import type {ChatRequest, MealImageRequest} from './contracts';

export interface ProviderValidation {
  readonly valid: boolean;
  readonly rateLimited?: boolean;
  readonly message?: string;
}

export interface LlmUpstream {
  validateCredential(credential: string): Promise<ProviderValidation>;
  chat(credential: string, request: ChatRequest): Promise<string>;
  analyzeMealImage(
    credential: string,
    request: MealImageRequest,
  ): Promise<string>;
}

export class UpstreamError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
  }
}

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

const OPENAI_ORIGIN = 'https://api.openai.com';
const MAX_UPSTREAM_RESPONSE_CHARS = 512_000;

const parseResponse = async (
  response: Pick<Response, 'status' | 'text'>,
): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (text.length > MAX_UPSTREAM_RESPONSE_CHARS) {
    throw new UpstreamError(502, 'invalid_upstream_response', 'AI provider response was too large');
  }
  try {
    const value = text ? JSON.parse(text) : null;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(502, 'invalid_upstream_response', 'AI provider returned invalid JSON');
  }
};

const outputText = (value: Record<string, unknown>): string => {
  if (typeof value.output_text === 'string' && value.output_text.trim()) {
    return value.output_text.trim();
  }
  const outputs = Array.isArray(value.output) ? value.output : [];
  const parts: string[] = [];
  outputs.forEach(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return;
    const output = item as Record<string, unknown>;
    if (output.type !== 'message' || output.role !== 'assistant') return;
    const content = Array.isArray(output.content) ? output.content : [];
    content.forEach(part => {
      if (typeof part !== 'object' || part === null || Array.isArray(part)) return;
      const contentPart = part as Record<string, unknown>;
      if (
        (contentPart.type === 'output_text' || contentPart.type === 'refusal') &&
        typeof contentPart.text === 'string'
      ) {
        parts.push(contentPart.text);
      }
    });
  });
  return parts.join('').trim();
};

const providerErrorMessage = (value: Record<string, unknown>): string => {
  const error = value.error;
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
};

const shouldRemoveParameter = (
  message: string,
  parameter: 'temperature' | 'max_output_tokens',
): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(parameter) &&
    (normalized.includes('unsupported') ||
      normalized.includes('not support') ||
      normalized.includes('only the default'))
  );
};

export class OpenAiUpstream implements LlmUpstream {
  constructor(
    private readonly fetchImpl: FetchLike = globalThis.fetch,
    private readonly timeoutMs = 60_000,
  ) {}

  private async request(
    path: string,
    credential: string,
    body?: Record<string, unknown>,
  ): Promise<{readonly status: number; readonly ok: boolean; readonly json: Record<string, unknown>}> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${OPENAI_ORIGIN}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: 'application/json',
          ...(body ? {'Content-Type': 'application/json'} : {}),
        },
        ...(body ? {body: JSON.stringify(body)} : {}),
        signal: controller.signal,
      });
      return {
        status: response.status,
        ok: response.ok,
        json: await parseResponse(response),
      };
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      if (controller.signal.aborted) {
        throw new UpstreamError(504, 'upstream_timeout', 'AI provider timed out');
      }
      throw new UpstreamError(502, 'upstream_unavailable', 'AI provider is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateCredential(credential: string): Promise<ProviderValidation> {
    const response = await this.request('/v1/models', credential);
    if (response.ok) return {valid: true};
    if (response.status === 401 || response.status === 403) {
      return {valid: false, message: 'The API key was rejected'};
    }
    if (response.status === 429) {
      return {
        valid: true,
        rateLimited: true,
        message: 'The API key is valid but currently rate limited',
      };
    }
    throw new UpstreamError(502, 'upstream_error', 'Unable to validate API key');
  }

  async chat(credential: string, request: ChatRequest): Promise<string> {
    const systemMessages = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content);
    const input = request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        type: 'message',
        role: message.role,
        content: [
          {
            type: message.role === 'assistant' ? 'output_text' : 'input_text',
            text: message.content,
          },
        ],
      }));
    let body: Record<string, unknown> = {
      model: request.model,
      input,
      ...(systemMessages.length > 0
        ? {instructions: systemMessages.join('\n\n')}
        : {}),
      ...(request.temperature === undefined
        ? {}
        : {temperature: request.temperature}),
      ...(request.maxOutputTokens === undefined
        ? {}
        : {max_output_tokens: request.maxOutputTokens}),
    };
    let transientRetryAvailable = true;
    let emptyRetryAvailable = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request('/v1/responses', credential, body);
      if (!response.ok) {
        const message = providerErrorMessage(response.json);
        const nextBody = {...body};
        let compatibilityFallback = false;
        if (
          Object.prototype.hasOwnProperty.call(body, 'temperature') &&
          shouldRemoveParameter(message, 'temperature')
        ) {
          delete nextBody.temperature;
          compatibilityFallback = true;
        }
        if (
          Object.prototype.hasOwnProperty.call(body, 'max_output_tokens') &&
          shouldRemoveParameter(message, 'max_output_tokens')
        ) {
          delete nextBody.max_output_tokens;
          compatibilityFallback = true;
        }
        if (compatibilityFallback) {
          body = nextBody;
          continue;
        }
        if (response.status >= 500 && transientRetryAvailable) {
          transientRetryAvailable = false;
          continue;
        }
        const status =
          response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
        throw new UpstreamError(
          status,
          response.status === 429 ? 'rate_limited' : 'upstream_rejected',
          response.status === 429
            ? 'AI provider rate limit reached'
            : 'AI provider rejected the request',
        );
      }
      const content = outputText(response.json);
      if (content) {
        return content;
      }
      if (emptyRetryAvailable) {
        emptyRetryAvailable = false;
        continue;
      }
      break;
    }
    throw new UpstreamError(
      502,
      'empty_upstream_response',
      'AI provider returned an empty response',
    );
  }

  async analyzeMealImage(
    credential: string,
    request: MealImageRequest,
  ): Promise<string> {
    const response = await this.request('/v1/responses', credential, {
      model: request.model,
      input: [
        {
          role: 'user',
          content: [
            {type: 'input_text', text: request.instruction},
            {
              type: 'input_image',
              image_url: `data:${request.image.mimeType};base64,${request.image.base64}`,
            },
          ],
        },
      ],
      max_output_tokens: 350,
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      throw new UpstreamError(
        status,
        response.status === 429 ? 'rate_limited' : 'upstream_rejected',
        response.status === 429 ? 'AI provider rate limit reached' : 'AI provider rejected the image request',
      );
    }
    const content = outputText(response.json);
    if (!content) {
      throw new UpstreamError(502, 'empty_upstream_response', 'AI provider returned an empty response');
    }
    return content;
  }
}
