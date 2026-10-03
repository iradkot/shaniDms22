import type {BrowserFirebaseAuth} from '../auth';
import {createRequestAbortScope} from '../../../utils/requestAbortScope';
import {capturePrivacyAuthorization} from '../../../modules/privacy';

export class WebApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'WebApiError';
  }
}

export interface AuthenticatedWebApiClientOptions {
  readonly baseUrl: string;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'> &
    Partial<Pick<BrowserFirebaseAuth, 'getIdentity' | 'getSessionRevision'>>;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class AuthenticatedWebApiClient {
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: AuthenticatedWebApiClientOptions) {
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async requestJson(
    path: string,
    options: {
      readonly method?: 'GET' | 'POST';
      readonly body?: unknown;
      readonly signal?: AbortSignal;
      readonly timeoutMs?: number;
      readonly expectedUserId?: string;
    } = {},
  ): Promise<unknown> {
    const authorize =
      !path.startsWith('/v1/privacy/') &&
      !path.startsWith('/v1/account/delete') &&
      !path.endsWith('/remove')
        ? capturePrivacyAuthorization(
            path.startsWith('/v1/llm/') ? 'ai' : 'cloud',
          )
        : () => undefined;
    const capturedAuthRevision = this.options.auth.getSessionRevision?.();
    const checkOwner = () => {
      if (
        capturedAuthRevision !== undefined &&
        this.options.auth.getSessionRevision?.() !== capturedAuthRevision
      ) {
        throw new WebApiError(
          401,
          'account_changed',
          'The signed-in account changed.',
        );
      }
      if (
        options.expectedUserId !== undefined &&
        this.options.auth.getIdentity?.()?.uid !== options.expectedUserId
      ) {
        throw new WebApiError(
          401,
          'account_changed',
          'The signed-in account changed.',
        );
      }
    };
    if (!/^\/v1\/[a-z0-9/_-]+(?:\?[a-z0-9%&=._-]+)?$/i.test(path)) {
      throw new Error('Web API path is invalid.');
    }
    const abortScope = createRequestAbortScope({
      ...(options.signal === undefined ? {} : {signal: options.signal}),
      timeoutMs: options.timeoutMs ?? this.options.timeoutMs ?? 25_000,
    });
    try {
      abortScope.throwIfAborted();
      if (path !== '/v1/account/delete/finish') {
        checkOwner();
      }
      const token =
        path === '/v1/account/delete/finish'
          ? null
          : await this.options.auth.getIdToken();
      if (path !== '/v1/account/delete/finish') {
        checkOwner();
      }
      abortScope.throwIfAborted();
      authorize();
      const response = await this.request(`${this.options.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(token === null ? {} : {Authorization: `Bearer ${token}`}),
          ...(options.body === undefined
            ? {}
            : {'Content-Type': 'application/json'}),
        },
        ...(options.body === undefined
          ? {}
          : {body: JSON.stringify(options.body)}),
        signal: abortScope.signal,
      });
      abortScope.throwIfAborted();
      let value: unknown;
      try {
        value = await response.json();
        abortScope.throwIfAborted();
      } catch (error) {
        abortScope.throwIfAborted();
        if (response.ok) {
          throw new WebApiError(
            response.status,
            'invalid_response',
            'The server returned an invalid response.',
          );
        }
      }
      if (!response.ok) {
        const code =
          isRecord(value) &&
          typeof value.code === 'string' &&
          /^[a-z][a-z_]{0,63}$/.test(value.code)
            ? value.code
            : response.status === 401
            ? 'unauthenticated'
            : response.status === 404
            ? 'not_found'
            : response.status === 429
            ? 'rate_limited'
            : response.status >= 500
            ? 'upstream_unavailable'
            : 'request_failed';
        // Provider errors can echo credentials or user content. Only the stable
        // code crosses this boundary; presentation maps it to trusted copy.
        throw new WebApiError(
          response.status,
          code,
          'The request could not be completed.',
        );
      }
      authorize();
      if (
        path !== '/v1/account/delete/finish' &&
        !path.startsWith('/v1/account/delete')
      ) {
        checkOwner();
      }
      return value;
    } catch (error) {
      if (abortScope.kind === 'cancelled') {
        throw new WebApiError(0, 'cancelled', 'The request was cancelled.');
      }
      if (abortScope.kind === 'timeout') {
        throw new WebApiError(408, 'timeout', 'The request timed out.');
      }
      if (error instanceof WebApiError) {
        throw error;
      }
      throw new WebApiError(0, 'network', 'The server could not be reached.');
    } finally {
      abortScope.dispose();
    }
  }
}
