import type {ChatRequest, MealImageRequest} from './contracts';

export interface ProviderValidation {
  /** Credential acceptance only; this does not establish Responses access or billing. */
  readonly valid: boolean;
  readonly rateLimited?: boolean;
  readonly message?: string;
}

export interface LlmUpstream {
  validateCredential(credential: string): Promise<ProviderValidation>;
  testConnection(credential: string, model: string): Promise<void>;
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
const CONNECTION_TEST_MAX_OUTPUT_TOKENS = 16;

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

/** Translate provider fields into a fixed public error; never return provider text. */
const providerFailure = (
  status: number,
  value: Record<string, unknown>,
): UpstreamError => {
  const rawError = value.error;
  const error = typeof rawError === 'object' && rawError !== null && !Array.isArray(rawError)
    ? rawError as Record<string, unknown>
    : {};
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const type = typeof error.type === 'string' ? error.type.toLowerCase() : '';
  const permissionCodes = [
    'insufficient_permissions', 'permission_denied', 'access_denied',
    'ip_not_authorized', 'unsupported_country_region_territory',
  ];
  const permissionMessage = /missing scopes?:|insufficient permissions|do not have permission/i.test(
    providerErrorMessage(value),
  );
  if (status === 403 || permissionCodes.includes(code) || permissionMessage) {
    return new UpstreamError(403, 'provider_permission_denied', 'The API key or project does not permit this AI request');
  }
  if (status === 401 || code === 'invalid_api_key') {
    return new UpstreamError(401, 'invalid_credential', 'The API key was rejected');
  }
  if (status === 404 || code === 'model_not_found' || error.param === 'model') {
    return new UpstreamError(400, 'provider_model_unavailable', 'The selected AI model is not available to this project');
  }
  const quotaCodes = [
    'insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached',
    'organization_spend_limit_exceeded', 'project_spend_limit_exceeded',
    'organization_usage_limit_exceeded',
  ];
  if (quotaCodes.includes(code) || type === 'insufficient_quota') {
    return new UpstreamError(429, 'provider_quota_exceeded', 'AI API credits or project usage limits need attention');
  }
  if (status === 429 || type === 'rate_limit_error' || code === 'rate_limit_exceeded') {
    return new UpstreamError(429, 'rate_limited', 'AI provider rate limit reached');
  }
  if (status === 408 || status === 504 || code === 'request_timeout') {
    return new UpstreamError(504, 'upstream_timeout', 'AI provider timed out');
  }
  if (status >= 500 || code === 'server_error' || code === 'server_is_overloaded') {
    return new UpstreamError(502, 'upstream_unavailable', 'AI provider is unavailable');
  }
  return new UpstreamError(400, 'upstream_rejected', 'AI provider rejected the request');
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
      let json: Record<string, unknown>;
      try {
        json = await parseResponse(response);
      } catch (error) {
        // Error responses may be HTML (for example a gateway outage). Keep the
        // HTTP status classification while discarding the untrusted response body.
        if (response.ok || controller.signal.aborted) throw error;
        json = {};
      }
      return {
        status: response.status,
        ok: response.ok,
        json,
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
    const failure = providerFailure(response.status, response.json);
    if (failure.code === 'invalid_credential') return {valid: false, message: failure.message};
    if (response.status === 429) {
      return {
        valid: true,
        rateLimited: true,
        message: 'Credential validation is currently limited; AI generation has not been checked',
      };
    }
    throw failure;
  }

  async testConnection(credential: string, model: string): Promise<void> {
    // This deliberately has no user data, tools, retries or unbounded fallback.
    // Reasoning may consume the tiny token budget before producing visible text;
    // an accepted Responses request still confirms model access and billing.
    const response = await this.request('/v1/responses', credential, {
      model,
      input: 'Reply with OK.',
      max_output_tokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
      store: false,
    });
    if (!response.ok) throw providerFailure(response.status, response.json);
    const result = response.json;
    if (result.error !== undefined && result.error !== null) {
      throw providerFailure(result.status === 'failed' ? 502 : 400, result);
    }
    const incomplete = result.incomplete_details;
    const tokenBudgetReached = typeof incomplete === 'object' && incomplete !== null &&
      !Array.isArray(incomplete) &&
      (incomplete as Record<string, unknown>).reason === 'max_output_tokens';
    if (
      result.object === 'response' && typeof result.id === 'string' && result.id.length > 0 &&
      (result.status === 'completed' || (result.status === 'incomplete' && tokenBudgetReached))
    ) return;
    throw new UpstreamError(502, 'invalid_upstream_response', 'AI provider did not confirm the connection');
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
          response.status === 400 &&
          Object.prototype.hasOwnProperty.call(body, 'temperature') &&
          shouldRemoveParameter(message, 'temperature')
        ) {
          delete nextBody.temperature;
          compatibilityFallback = true;
        }
        if (
          response.status === 400 &&
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
        throw providerFailure(response.status, response.json);
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
      throw providerFailure(response.status, response.json);
    }
    const content = outputText(response.json);
    if (!content) {
      throw new UpstreamError(502, 'empty_upstream_response', 'AI provider returned an empty response');
    }
    return content;
  }
}
