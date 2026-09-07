import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';

import {NATIVE_RUNTIME_CONFIG} from 'app/platform/native/runtimeConfig';
import {isE2E} from 'app/utils/e2e';
import {utf8ByteLength} from 'app/utils/utf8ByteLength';
import {
  RequestAbortError,
  createRequestAbortScope,
} from 'app/utils/requestAbortScope';

import type {LlmChatRequest, LlmChatResponse, LlmProvider} from './llmTypes';

export type SupportedLlmProvider = 'openai';

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

export interface ShaniLlmProxyRuntime {
  readonly baseUrl: string;
  readonly getFirebaseIdToken: () => Promise<string | null>;
  readonly getCurrentUserId?: () => string | null;
  readonly fetch: FetchLike;
}

type RuntimeGlobals = typeof globalThis & {
  __SHANIDMS_BACKEND_URL__?: string;
  process?: {env?: Readonly<Record<string, string | undefined>>};
};

const MAX_CHAT_REQUEST_BYTES = 512 * 1024;
const MAX_PROXY_RESPONSE_BYTES = 160 * 1024;
const MAX_MESSAGES = 96;
const MAX_MESSAGE_CHARS = 200_000;
const MAX_CREDENTIAL_CHARS = 4_096;
const DEFAULT_TIMEOUT_MS = 65_000;
const VAULT_MARKER = '__shani_server_vault__';

let runtimeOverride: ShaniLlmProxyRuntime | null = null;

export class ShaniLlmProxyError extends Error {
  readonly code:
    | 'backend_unconfigured'
    | 'account_changed'
    | 'invalid_credential'
    | 'provider_permission_denied'
    | 'provider_model_unavailable'
    | 'provider_quota_exceeded'
    | 'unsupported_model'
    | 'internal_error'
    | 'upstream_timeout'
    | 'upstream_unavailable'
    | 'upstream_rejected'
    | 'unauthenticated'
    | 'invalid_request'
    | 'request_too_large'
    | 'credential_missing'
    | 'unauthorized'
    | 'rate_limited'
    | 'timeout'
    | 'network'
    | 'upstream'
    | 'invalid_response';
  readonly status?: number;

  constructor(
    code: ShaniLlmProxyError['code'],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'ShaniLlmProxyError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

/** Runtime injection seam for native configuration, web bootstrap and tests. */
export const configureShaniLlmProxyRuntime = (
  runtime: ShaniLlmProxyRuntime | null,
): void => {
  runtimeOverride = runtime;
};

export const serverVaultCredentialMarker = VAULT_MARKER;

export const isServerVaultCredentialMarker = (value: unknown): boolean =>
  value === VAULT_MARKER;

const firebaseFunctionsBaseUrl = (): string | undefined => {
  try {
    const projectId = getApp().options.projectId?.trim();
    if (!projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) {
      return undefined;
    }
    return `https://us-central1-${projectId}.cloudfunctions.net/shaniApi`;
  } catch {
    return undefined;
  }
};

const configuredBaseUrl = (): string => {
  const globals = globalThis as RuntimeGlobals;
  const value =
    runtimeOverride?.baseUrl ??
    NATIVE_RUNTIME_CONFIG.backendBaseUrl ??
    globals.__SHANIDMS_BACKEND_URL__ ??
    globals.process?.env?.SHANIDMS_BACKEND_URL ??
    firebaseFunctionsBaseUrl() ??
    '';
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new ShaniLlmProxyError(
      'backend_unconfigured',
      'ShaniDms AI backend is not configured',
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ShaniLlmProxyError(
      'backend_unconfigured',
      'ShaniDms AI backend URL is invalid',
    );
  }
  const localDevelopmentHost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !localDevelopmentHost) {
    throw new ShaniLlmProxyError(
      'backend_unconfigured',
      'ShaniDms AI backend must use HTTPS',
    );
  }
  return trimmed;
};

const defaultIdToken = async (): Promise<string | null> => {
  const currentUser = getAuth(getApp()).currentUser;
  if (!currentUser || typeof currentUser.getIdToken !== 'function') {
    return null;
  }
  return currentUser.getIdToken();
};

const currentRuntime = (): ShaniLlmProxyRuntime => ({
  baseUrl: configuredBaseUrl(),
  getFirebaseIdToken: runtimeOverride?.getFirebaseIdToken ?? defaultIdToken,
  getCurrentUserId:
    runtimeOverride?.getCurrentUserId ??
    (() => getAuth(getApp()).currentUser?.uid ?? null),
  fetch: runtimeOverride?.fetch ?? (globalThis.fetch as FetchLike),
});

const decodeJsonObject = (text: string): Record<string, unknown> => {
  if (text.length > MAX_PROXY_RESPONSE_BYTES) {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend response exceeded the allowed size',
    );
  }
  try {
    const value = text ? JSON.parse(text) : null;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ShaniLlmProxyError) {
      throw error;
    }
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend returned an invalid response',
    );
  }
};

const errorCodeForStatus = (
  status: number,
  serverCode: unknown,
): ShaniLlmProxyError['code'] => {
  const providerCodes = [
    'invalid_credential',
    'provider_permission_denied',
    'provider_model_unavailable',
    'provider_quota_exceeded',
    'unsupported_model',
    'unauthenticated',
    'internal_error',
    'upstream_timeout',
    'upstream_unavailable',
    'upstream_rejected',
  ] as const;
  if (providerCodes.some(code => code === serverCode)) {
    return serverCode as ShaniLlmProxyError['code'];
  }
  if (serverCode === 'credential_missing') {
    return 'credential_missing';
  }
  if (status === 404) {
    return 'backend_unconfigured';
  }
  if (status === 413) return 'request_too_large';
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 408 || status === 504) {
    return 'timeout';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status >= 500) {
    return 'upstream';
  }
  return 'invalid_request';
};

const proxyRequest = async (
  path: string,
  body: Record<string, unknown> | undefined,
  options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly expectedUserId?: string | undefined;
    readonly maxRequestBytes?: number;
  } = {},
): Promise<Record<string, unknown>> => {
  const runtime = currentRuntime();
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (
    serialized &&
    utf8ByteLength(serialized) >
      (options.maxRequestBytes ?? MAX_CHAT_REQUEST_BYTES)
  ) {
    throw new ShaniLlmProxyError(
      'request_too_large',
      'AI request exceeded the allowed size',
      413,
    );
  }

  const abortScope = createRequestAbortScope({
    ...(options.signal === undefined ? {} : {signal: options.signal}),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  try {
    abortScope.throwIfAborted();
    const expectedOwner =
      options.expectedUserId ?? runtime.getCurrentUserId?.();
    const assertOwner = () => {
      if (expectedOwner && runtime.getCurrentUserId?.() !== expectedOwner) {
        throw new ShaniLlmProxyError(
          'account_changed',
          'The signed-in account changed',
        );
      }
    };
    assertOwner();
    const token = await runtime.getFirebaseIdToken();
    assertOwner();
    abortScope.throwIfAborted();
    if (!token || token.length > 16_384) {
      throw new ShaniLlmProxyError(
        'unauthenticated',
        'Sign in is required before using AI',
        401,
      );
    }

    const response = await runtime.fetch(`${runtime.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-store',
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      ...(serialized === undefined ? {} : {body: serialized}),
      signal: abortScope.signal,
    });
    abortScope.throwIfAborted();
    const responseText = await response.text();
    abortScope.throwIfAborted();
    let decoded: Record<string, unknown>;
    try {
      decoded = decodeJsonObject(responseText);
    } catch (error) {
      if (!response.ok) {
        throw new ShaniLlmProxyError(
          errorCodeForStatus(response.status, undefined),
          'AI service request failed',
          response.status,
        );
      }
      throw error;
    }
    if (!response.ok) {
      const message =
        typeof decoded.message === 'string'
          ? decoded.message
          : `AI backend request failed (${response.status})`;
      throw new ShaniLlmProxyError(
        errorCodeForStatus(response.status, decoded.code),
        message,
        response.status,
      );
    }
    return decoded;
  } catch (error) {
    if (abortScope.kind === 'cancelled') {
      throw error instanceof RequestAbortError
        ? error
        : new RequestAbortError('cancelled');
    }
    if (abortScope.kind === 'timeout') {
      throw new ShaniLlmProxyError('timeout', 'AI request timed out');
    }
    if (error instanceof ShaniLlmProxyError) {
      throw error;
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'AI backend network request failed';
    throw new ShaniLlmProxyError('network', message);
  } finally {
    abortScope.dispose();
  }
};

const assertProvider = (provider: unknown): SupportedLlmProvider => {
  if (provider !== 'openai') {
    throw new ShaniLlmProxyError(
      'invalid_request',
      `Unsupported LLM provider: ${String(provider)}`,
    );
  }
  return provider;
};

const validateChatRequest = (request: LlmChatRequest): void => {
  if (
    typeof request.model !== 'string' ||
    request.model.trim().length === 0 ||
    request.model.length > 128
  ) {
    throw new ShaniLlmProxyError('invalid_request', 'Invalid AI model');
  }
  if (
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > MAX_MESSAGES
  ) {
    throw new ShaniLlmProxyError('invalid_request', 'Invalid AI messages');
  }
  let totalChars = 0;
  request.messages.forEach(message => {
    if (
      !message ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > MAX_MESSAGE_CHARS
    ) {
      throw new ShaniLlmProxyError('invalid_request', 'Invalid AI message');
    }
    totalChars += message.content.length;
  });
  if (totalChars > 480_000) {
    throw new ShaniLlmProxyError('invalid_request', 'AI context is too large');
  }
  if (
    request.temperature !== undefined &&
    (!Number.isFinite(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 2)
  ) {
    throw new ShaniLlmProxyError('invalid_request', 'Invalid AI temperature');
  }
  if (
    request.maxOutputTokens !== undefined &&
    (!Number.isInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1 ||
      request.maxOutputTokens > 16_384)
  ) {
    throw new ShaniLlmProxyError('invalid_request', 'Invalid AI output limit');
  }
};

const e2eChatResponse = (request: LlmChatRequest): LlmChatResponse => {
  const lastUserMessage = [...request.messages]
    .reverse()
    .find(message => message.role === 'user')?.content;
  const suffix = lastUserMessage?.trim()
    ? ` You said: ${lastUserMessage.trim()}`
    : '';
  return {
    content: `E2E stubbed OpenAI response.${suffix}`,
    raw: {stub: true, provider: 'openai', model: request.model},
  };
};

export class ShaniLlmProxyProvider implements LlmProvider {
  private readonly provider: SupportedLlmProvider;
  private readonly e2eApiKey: string;

  constructor(input: {
    readonly provider: SupportedLlmProvider;
    readonly e2eApiKey?: string;
  }) {
    this.provider = assertProvider(input.provider);
    this.e2eApiKey = input.e2eApiKey?.trim() ?? '';
  }

  async sendChat(request: LlmChatRequest): Promise<LlmChatResponse> {
    validateChatRequest(request);
    if (isE2E && this.e2eApiKey.startsWith('e2e-openai-')) {
      return e2eChatResponse(request);
    }
    const decoded = await proxyRequest(
      '/v1/llm/chat',
      {
        version: 1,
        provider: this.provider,
        model: request.model.trim(),
        messages: request.messages,
        ...(request.temperature === undefined
          ? {}
          : {temperature: request.temperature}),
        ...(request.maxOutputTokens === undefined
          ? {}
          : {maxOutputTokens: request.maxOutputTokens}),
      },
      request.abortSignal === undefined
        ? {}
        : {signal: request.abortSignal as AbortSignal},
    );
    if (
      decoded.version !== 1 ||
      decoded.provider !== this.provider ||
      typeof decoded.content !== 'string' ||
      decoded.content.trim().length === 0
    ) {
      throw new ShaniLlmProxyError(
        'invalid_response',
        'AI backend returned an invalid chat response',
      );
    }
    return {
      content: decoded.content,
      raw: {proxy: true, provider: decoded.provider, model: decoded.model},
    };
  }
}

export type LlmCredentialValidationResult =
  | {readonly ok: true; readonly note?: string}
  | {
      readonly ok: false;
      readonly reason:
        | 'missing'
        | 'unauthorized'
        | 'rate_limited'
        | 'network'
        | 'unknown';
      readonly message: string;
    };

export const validateLlmCredential = async (
  providerInput: SupportedLlmProvider,
  credentialInput: string,
): Promise<LlmCredentialValidationResult> => {
  const provider = assertProvider(providerInput);
  const credential = credentialInput.trim();
  if (!credential) {
    return {ok: false, reason: 'missing', message: 'Missing API key'};
  }
  if (credential.length > MAX_CREDENTIAL_CHARS) {
    return {ok: false, reason: 'unknown', message: 'API key is too long'};
  }
  if (isE2E && credential.startsWith('e2e-openai-')) {
    if (credential === 'e2e-openai-valid') {
      return {ok: true, note: 'E2E stub: valid'};
    }
    if (credential === 'e2e-openai-rate') {
      return {
        ok: false,
        reason: 'rate_limited',
        message: 'E2E stub: 429 (quota/rate limit)',
      };
    }
    return {
      ok: false,
      reason: 'unauthorized',
      message: 'E2E stub: unauthorized',
    };
  }
  try {
    const response = await proxyRequest('/v1/vault/llm/validate', {
      version: 1,
      provider,
      credential,
    });
    return response.valid === true
      ? {ok: true}
      : {
          ok: false,
          reason: 'unauthorized',
          message:
            typeof response.message === 'string'
              ? response.message
              : 'The API key was rejected',
        };
  } catch (error) {
    if (error instanceof ShaniLlmProxyError) {
      if (error.code === 'unauthorized') {
        return {ok: false, reason: 'unauthorized', message: error.message};
      }
      if (error.code === 'rate_limited') {
        return {ok: false, reason: 'rate_limited', message: error.message};
      }
      if (
        error.code === 'network' ||
        error.code === 'timeout' ||
        error.code === 'backend_unconfigured' ||
        error.code === 'unauthenticated'
      ) {
        return {ok: false, reason: 'network', message: error.message};
      }
      return {ok: false, reason: 'unknown', message: error.message};
    }
    return {
      ok: false,
      reason: 'unknown',
      message: 'Unable to validate API key',
    };
  }
};

export const provisionLlmCredential = async (
  providerInput: SupportedLlmProvider,
  credentialInput: string,
  expectedUserId?: string,
): Promise<void> => {
  const provider = assertProvider(providerInput);
  const credential = credentialInput.trim();
  if (!credential || credential.length > MAX_CREDENTIAL_CHARS) {
    throw new ShaniLlmProxyError('invalid_credential', 'Invalid API key');
  }
  if (isE2E && credential.startsWith('e2e-openai-')) {
    return;
  }
  const response = await proxyRequest(
    '/v1/vault/llm/provision',
    {
      version: 1,
      provider,
      credential,
    },
    {expectedUserId},
  );
  if (response.version !== 1 || response.configured !== true) {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend did not confirm credential provisioning',
    );
  }
};

export const getLlmCredentialStatus = async (
  providerInput: SupportedLlmProvider,
  expectedUserId?: string,
): Promise<boolean> => {
  const provider = assertProvider(providerInput);
  if (isE2E) {
    return false;
  }
  const response = await proxyRequest(
    `/v1/vault/llm/status?provider=${encodeURIComponent(provider)}`,
    undefined,
    {expectedUserId},
  );
  if (response.version !== 1 || typeof response.configured !== 'boolean') {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend returned an invalid credential status',
    );
  }
  return response.configured;
};

export const removeLlmCredential = async (
  providerInput: SupportedLlmProvider,
  expectedUserId?: string,
): Promise<void> => {
  const provider = assertProvider(providerInput);
  if (isE2E) {
    return;
  }
  const response = await proxyRequest(
    '/v1/vault/llm/remove',
    {
      version: 1,
      provider,
    },
    {expectedUserId},
  );
  if (response.version !== 1 || response.configured !== false) {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend did not confirm credential removal',
    );
  }
};

export const testLlmConnection = async (
  provider: SupportedLlmProvider,
  model: string,
): Promise<void> => {
  if (isE2E) {
    return;
  }
  const response = await proxyRequest(
    '/v1/vault/llm/test',
    {
      version: 1,
      provider: assertProvider(provider),
      model,
    },
    {timeoutMs: 85_000},
  );
  if (
    response.version !== 1 ||
    response.provider !== provider ||
    response.connected !== true ||
    response.model !== model
  ) {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend did not confirm the connection',
    );
  }
};

export const analyzeMealImageViaProxy = async (input: {
  readonly provider: SupportedLlmProvider;
  readonly e2eApiKey?: string;
  readonly model: string;
  readonly instruction: string;
  readonly mimeType: string;
  readonly base64: string;
  readonly abortSignal?: AbortSignal;
}): Promise<string> => {
  const provider = assertProvider(input.provider);
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType) ||
    input.base64.length === 0 ||
    input.base64.length > 8_000_000 ||
    input.instruction.length === 0 ||
    input.instruction.length > 12_000
  ) {
    throw new ShaniLlmProxyError(
      'invalid_request',
      'Invalid meal image request',
    );
  }
  if (isE2E && input.e2eApiKey?.startsWith('e2e-openai-')) {
    return 'E2E stubbed meal image analysis.';
  }
  const response = await proxyRequest(
    '/v1/llm/meal-image',
    {
      version: 1,
      provider,
      model: input.model,
      instruction: input.instruction,
      image: {mimeType: input.mimeType, base64: input.base64},
    },
    {
      timeoutMs: 70_000,
      maxRequestBytes: 8_500_000,
      ...(input.abortSignal === undefined ? {} : {signal: input.abortSignal}),
    },
  );
  if (
    response.version !== 1 ||
    response.provider !== provider ||
    typeof response.content !== 'string' ||
    response.content.trim().length === 0
  ) {
    throw new ShaniLlmProxyError(
      'invalid_response',
      'AI backend returned an invalid image response',
    );
  }
  return response.content.trim();
};
