import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';

import {NATIVE_RUNTIME_CONFIG} from 'app/platform/native/runtimeConfig';
import {
  RequestAbortError,
  createRequestAbortScope,
} from 'app/utils/requestAbortScope';

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

export interface NativeAuthenticatedBackendSession {
  readonly userId: string;
  readonly idToken: string;
}

export interface NativeAuthenticatedBackendRuntime {
  readonly baseUrl: string | (() => string);
  readonly getSession: () => Promise<NativeAuthenticatedBackendSession | null>;
  readonly fetch: FetchLike;
}

export interface NativeAuthenticatedBackendRequest {
  readonly method?: 'GET' | 'POST';
  readonly expectedUserId: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface NativeAuthenticatedBackendClient {
  requestJson(
    path: string,
    request: NativeAuthenticatedBackendRequest,
  ): Promise<Record<string, unknown>>;
}

export type NativeAuthenticatedBackendErrorCode =
  | 'backend_unconfigured'
  | 'unauthenticated'
  | 'invalid_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'upstream'
  | 'invalid_response';

export class NativeAuthenticatedBackendError extends Error {
  constructor(
    readonly code: NativeAuthenticatedBackendErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NativeAuthenticatedBackendError';
  }
}

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_CHARS = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

type RuntimeGlobals = typeof globalThis & {
  __SHANIDMS_BACKEND_URL__?: string;
  process?: {env?: Readonly<Record<string, string | undefined>>};
};

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

const defaultBaseUrl = (): string => {
  const globals = globalThis as RuntimeGlobals;
  return (
    NATIVE_RUNTIME_CONFIG.backendBaseUrl ??
    globals.__SHANIDMS_BACKEND_URL__ ??
    globals.process?.env?.SHANIDMS_BACKEND_URL ??
    firebaseFunctionsBaseUrl() ??
    ''
  );
};

const normalizeBaseUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new NativeAuthenticatedBackendError(
      'backend_unconfigured',
      'ShaniDms backend is not configured',
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new NativeAuthenticatedBackendError(
      'backend_unconfigured',
      'ShaniDms backend URL is invalid',
    );
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new NativeAuthenticatedBackendError(
      'backend_unconfigured',
      'ShaniDms backend must use HTTPS',
    );
  }
  return trimmed;
};

const decodeJsonObject = (text: string): Record<string, unknown> => {
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new NativeAuthenticatedBackendError(
      'invalid_response',
      'Backend response exceeded the allowed size',
    );
  }
  try {
    const value: unknown = text ? JSON.parse(text) : null;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Expected a JSON object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof NativeAuthenticatedBackendError) {
      throw error;
    }
    throw new NativeAuthenticatedBackendError(
      'invalid_response',
      'Backend returned an invalid response',
    );
  }
};

const errorCodeForStatus = (
  status: number,
): NativeAuthenticatedBackendErrorCode => {
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

const validatePath = (path: string): void => {
  if (!/^\/v1\/[A-Za-z0-9/?&=._%-]+$/.test(path)) {
    throw new NativeAuthenticatedBackendError(
      'invalid_request',
      'Backend path is invalid',
    );
  }
};

export const createNativeAuthenticatedBackendClient = (
  runtime: NativeAuthenticatedBackendRuntime,
): NativeAuthenticatedBackendClient => ({
  async requestJson(path, request) {
    validatePath(path);
    const serialized =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    if (
      serialized !== undefined &&
      new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES
    ) {
      throw new NativeAuthenticatedBackendError(
        'invalid_request',
        'Backend request exceeded the allowed size',
        413,
      );
    }

    const baseUrl = normalizeBaseUrl(
      typeof runtime.baseUrl === 'function'
        ? runtime.baseUrl()
        : runtime.baseUrl,
    );
    const abortScope = createRequestAbortScope({
      ...(request.signal === undefined ? {} : {signal: request.signal}),
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    try {
      abortScope.throwIfAborted();
      const expectedUserId = request.expectedUserId.trim();
      const session = await runtime.getSession();
      abortScope.throwIfAborted();
      if (
        !expectedUserId ||
        session === null ||
        session.userId !== expectedUserId ||
        !session.idToken ||
        session.idToken.length > 16_384
      ) {
        throw new NativeAuthenticatedBackendError(
          'unauthenticated',
          'The signed-in account changed before vault sync',
          401,
        );
      }

      const response = await runtime.fetch(`${baseUrl}${path}`, {
        method: request.method ?? (serialized === undefined ? 'GET' : 'POST'),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.idToken}`,
          'Cache-Control': 'no-store',
          ...(serialized === undefined
            ? {}
            : {'Content-Type': 'application/json'}),
        },
        ...(serialized === undefined ? {} : {body: serialized}),
        signal: abortScope.signal,
      });
      abortScope.throwIfAborted();
      const responseText = await response.text();
      abortScope.throwIfAborted();
      const decoded = decodeJsonObject(responseText);
      if (!response.ok) {
        throw new NativeAuthenticatedBackendError(
          errorCodeForStatus(response.status),
          typeof decoded.message === 'string'
            ? decoded.message
            : `Backend request failed (${response.status})`,
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
        throw new NativeAuthenticatedBackendError(
          'timeout',
          'Backend request timed out',
        );
      }
      if (error instanceof NativeAuthenticatedBackendError) {
        throw error;
      }
      throw new NativeAuthenticatedBackendError(
        'network',
        error instanceof Error && error.message
          ? error.message
          : 'Backend network request failed',
      );
    } finally {
      abortScope.dispose();
    }
  },
});

const defaultSession =
  async (): Promise<NativeAuthenticatedBackendSession | null> => {
    const user = getAuth(getApp()).currentUser;
    if (!user || typeof user.getIdToken !== 'function') {
      return null;
    }
    const idToken = await user.getIdToken();
    return {userId: user.uid, idToken};
  };

/** Shared native authenticated backend seam. URL and auth are resolved per request. */
export const nativeAuthenticatedBackendClient =
  createNativeAuthenticatedBackendClient({
    baseUrl: defaultBaseUrl,
    getSession: defaultSession,
    fetch: (input, init) => globalThis.fetch(input, init),
  });
