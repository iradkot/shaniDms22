import type {BrowserFirebaseAuth} from '../auth';
import {createRequestAbortScope} from '../../../utils/requestAbortScope';

export class WebApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'WebApiError';
  }
}

export interface AuthenticatedWebApiClientOptions {
  readonly baseUrl: string;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'>;
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
    } = {},
  ): Promise<unknown> {
    if (!/^\/v1\/[a-z0-9/_-]+(?:\?[a-z0-9%&=._-]+)?$/i.test(path)) {
      throw new Error('Web API path is invalid.');
    }
    const abortScope = createRequestAbortScope({
      ...(options.signal === undefined ? {} : {signal: options.signal}),
      timeoutMs: options.timeoutMs ?? this.options.timeoutMs ?? 25_000,
    });
    try {
      abortScope.throwIfAborted();
      const token = await this.options.auth.getIdToken();
      abortScope.throwIfAborted();
      const response = await this.request(`${this.options.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
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
