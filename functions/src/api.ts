import {
  ApiContractError,
  decodeChatRequest,
  decodeConnectionTestRequest,
  decodeCredentialRequest,
  decodeMealImageRequest,
  decodeNightscoutCredentialRequest,
  decodeNightscoutRangeRequest,
  decodeProviderRequest,
} from './contracts';
import type {CredentialVault} from './vault';
import type {LlmUpstream} from './openAiUpstream';
import {UpstreamError} from './openAiUpstream';
import type {NightscoutCredentialVault} from './nightscoutVault';
import {
  createNightscoutSourceId,
  createNightscoutWorkspaceId,
  normalizeNightscoutApiSecret,
} from './nightscoutVault';
import {
  NightscoutUpstream,
  NightscoutUpstreamError,
  normalizeNightscoutBaseUrl,
} from './nightscoutUpstream';

export interface AuthTokenVerifier {
  verify(token: string): Promise<{readonly uid: string}>;
}

export interface ApiRequest {
  readonly method: string;
  readonly path?: string;
  readonly url?: string;
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  header?(name: string): string | undefined;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(value: unknown): void;
  end(): void;
}

export interface ApiRateLimiter {
  consume(uid: string, route: string, nowMs: number): boolean;
}

interface RateBucket {
  startedAtMs: number;
  count: number;
}

/** Instance-local defence in depth. Production should also enable Cloud Armor. */
export class FixedWindowApiRateLimiter implements ApiRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly maximumRequests = 40,
    private readonly windowMs = 60_000,
  ) {}

  consume(uid: string, route: string, nowMs: number): boolean {
    const key = `${uid}:${route}`;
    const current = this.buckets.get(key);
    if (current === undefined || nowMs - current.startedAtMs >= this.windowMs) {
      this.buckets.set(key, {startedAtMs: nowMs, count: 1});
      return true;
    }
    if (current.count >= this.maximumRequests) {
      return false;
    }
    current.count += 1;
    return true;
  }
}

export interface ShaniApiDependencies {
  readonly auth: AuthTokenVerifier;
  readonly vault: CredentialVault;
  readonly nightscoutVault: NightscoutCredentialVault;
  readonly nightscoutUpstream: Pick<
    NightscoutUpstream,
    'validateCredential' | 'range'
  >;
  readonly upstream: LlmUpstream;
  readonly allowedModels: ReadonlySet<string>;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly rateLimiter?: ApiRateLimiter;
  readonly now?: () => number;
}

const MAX_BODY_BYTES = 8_500_000;
const KNOWN_API_PATHS = new Set([
  '/v1/vault/llm/validate',
  '/v1/vault/llm/provision',
  '/v1/vault/llm/status',
  '/v1/vault/llm/test',
  '/v1/vault/llm/remove',
  '/v1/vault/nightscout/provision',
  '/v1/vault/nightscout/status',
  '/v1/vault/nightscout/remove',
  '/v1/nightscout/range',
  '/v1/llm/chat',
  '/v1/llm/meal-image',
]);

const requestHeader = (request: ApiRequest, name: string): string | undefined => {
  const direct = request.header?.(name);
  if (direct !== undefined) return direct;
  const target = name.toLowerCase();
  const entry = Object.entries(request.headers).find(
    ([key]) => key.toLowerCase() === target,
  )?.[1];
  return Array.isArray(entry) ? entry[0] : entry;
};

const requestPath = (request: ApiRequest): string => {
  const raw = request.path ?? request.url ?? '/';
  try {
    return new URL(raw, 'https://api.invalid').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
};

const queryProvider = (request: ApiRequest): unknown => {
  try {
    const url = new URL(request.url ?? request.path ?? '/', 'https://api.invalid');
    return url.searchParams.get('provider');
  } catch {
    return undefined;
  }
};

const jsonBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

const bearerToken = (request: ApiRequest): string => {
  const authorization = requestHeader(request, 'authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~-]{20,16384})$/.exec(authorization);
  if (!match?.[1]) {
    throw new ApiContractError(401, 'unauthenticated', 'Authentication required');
  }
  return match[1];
};

const setResponseSecurityHeaders = (response: ApiResponse): void => {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
};

const configureCors = (
  request: ApiRequest,
  response: ApiResponse,
  allowedOrigins: ReadonlySet<string>,
): void => {
  const origin = requestHeader(request, 'origin');
  if (origin === undefined) return;
  if (!allowedOrigins.has(origin)) {
    throw new ApiContractError(403, 'origin_denied', 'Origin is not allowed');
  }
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

const requireMethod = (request: ApiRequest, method: 'GET' | 'POST'): void => {
  if (request.method.toUpperCase() !== method) {
    throw new ApiContractError(405, 'method_not_allowed', 'Method not allowed');
  }
};

const sendError = (response: ApiResponse, error: unknown): void => {
  if (
    error instanceof ApiContractError ||
    error instanceof UpstreamError ||
    error instanceof NightscoutUpstreamError
  ) {
    response.status(error.status).json({
      version: 1,
      code: error.code,
      message: error.message,
    });
    return;
  }
  response.status(500).json({
    version: 1,
    code: 'internal_error',
    message: 'The request could not be completed',
  });
};

export const createShaniApiHandler = (dependencies: ShaniApiDependencies) => {
  const limiter = dependencies.rateLimiter ?? new FixedWindowApiRateLimiter();
  const now = dependencies.now ?? Date.now;

  return async (request: ApiRequest, response: ApiResponse): Promise<void> => {
    setResponseSecurityHeaders(response);
    try {
      configureCors(request, response, dependencies.allowedOrigins);
      if (request.method.toUpperCase() === 'OPTIONS') {
        response.status(204).end();
        return;
      }
      if (jsonBytes(request.body) > MAX_BODY_BYTES) {
        throw new ApiContractError(413, 'request_too_large', 'Request is too large');
      }
      const token = bearerToken(request);
      let identity: {readonly uid: string};
      try {
        identity = await dependencies.auth.verify(token);
      } catch {
        throw new ApiContractError(401, 'unauthenticated', 'Authentication required');
      }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(identity.uid)) {
        throw new ApiContractError(401, 'unauthenticated', 'Invalid identity');
      }
      const path = requestPath(request);
      const rateLimitRoute = KNOWN_API_PATHS.has(path) ? path : '/unknown';
      if (!limiter.consume(identity.uid, rateLimitRoute, now())) {
        throw new ApiContractError(429, 'rate_limited', 'Too many requests');
      }

      if (path === '/v1/vault/llm/validate') {
        requireMethod(request, 'POST');
        const input = decodeCredentialRequest(request.body);
        const result = await dependencies.upstream.validateCredential(input.credential);
        response.status(200).json({
          version: 1,
          valid: result.valid,
          ...(result.rateLimited === undefined
            ? {}
            : {rateLimited: result.rateLimited}),
          ...(result.message === undefined ? {} : {message: result.message}),
        });
        return;
      }

      if (path === '/v1/vault/llm/provision') {
        requireMethod(request, 'POST');
        const input = decodeCredentialRequest(request.body);
        const validation = await dependencies.upstream.validateCredential(
          input.credential,
        );
        if (!validation.valid) {
          throw new ApiContractError(
            401,
            'invalid_credential',
            validation.message ?? 'Credential was rejected',
          );
        }
        await dependencies.vault.put(identity.uid, input.provider, input.credential);
        response.status(200).json({version: 1, configured: true});
        return;
      }

      if (path === '/v1/vault/llm/status') {
        requireMethod(request, 'GET');
        const input = decodeProviderRequest({
          version: 1,
          provider: queryProvider(request),
        });
        response.status(200).json({
          version: 1,
          configured: await dependencies.vault.has(identity.uid, input.provider),
        });
        return;
      }

      if (path === '/v1/vault/llm/remove') {
        requireMethod(request, 'POST');
        const input = decodeProviderRequest(request.body);
        await dependencies.vault.remove(identity.uid, input.provider);
        response.status(200).json({version: 1, configured: false});
        return;
      }

      if (path === '/v1/vault/llm/test') {
        requireMethod(request, 'POST');
        const input = decodeConnectionTestRequest(request.body, dependencies.allowedModels);
        const credential = await dependencies.vault.get(identity.uid, input.provider);
        if (credential === null) {
          throw new ApiContractError(
            409,
            'credential_missing',
            'Configure an AI credential first',
          );
        }
        await dependencies.upstream.testConnection(credential, input.model);
        response.status(200).json({
          version: 1,
          provider: input.provider,
          model: input.model,
          connected: true,
        });
        return;
      }

      if (path === '/v1/vault/nightscout/provision') {
        requireMethod(request, 'POST');
        const input = decodeNightscoutCredentialRequest(request.body);
        const credential = {
          url: normalizeNightscoutBaseUrl(input.url),
          apiSecretSha1: normalizeNightscoutApiSecret(input.apiKey),
        };
        await dependencies.nightscoutUpstream.validateCredential(credential);
        await dependencies.nightscoutVault.put(identity.uid, credential);
        response.status(200).json({
          version: 1,
          configured: true,
          sourceId: createNightscoutSourceId(credential.url),
          workspaceId: createNightscoutWorkspaceId(
            identity.uid,
            credential.url,
          ),
        });
        return;
      }

      if (path === '/v1/vault/nightscout/status') {
        requireMethod(request, 'GET');
        const credential = await dependencies.nightscoutVault.get(identity.uid);
        response.status(200).json({
          version: 1,
          configured: credential !== null,
          ...(credential === null
            ? {}
            : {
                sourceId: createNightscoutSourceId(credential.url),
                workspaceId: createNightscoutWorkspaceId(
                  identity.uid,
                  credential.url,
                ),
              }),
        });
        return;
      }

      if (path === '/v1/vault/nightscout/remove') {
        requireMethod(request, 'POST');
        const input = request.body;
        if (
          typeof input !== 'object' ||
          input === null ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          (input as Record<string, unknown>).version !== 1
        ) {
          throw new ApiContractError(400, 'invalid_request', 'Invalid request');
        }
        await dependencies.nightscoutVault.remove(identity.uid);
        response.status(200).json({version: 1, configured: false});
        return;
      }

      if (path === '/v1/nightscout/range') {
        requireMethod(request, 'POST');
        const input = decodeNightscoutRangeRequest(request.body);
        const credential = await dependencies.nightscoutVault.get(identity.uid);
        if (credential === null) {
          throw new ApiContractError(
            409,
            'nightscout_credential_missing',
            'Configure Nightscout first',
          );
        }
        const currentSourceId = createNightscoutSourceId(credential.url);
        const currentWorkspaceId = createNightscoutWorkspaceId(
          identity.uid,
          credential.url,
        );
        if (
          input.sourceId !== currentSourceId ||
          input.workspaceId !== currentWorkspaceId
        ) {
          throw new ApiContractError(
            409,
            'nightscout_identity_mismatch',
            'Nightscout Workspace changed; refresh before reading data',
          );
        }
        const data = await dependencies.nightscoutUpstream.range(
          credential,
          {
            version: input.version,
            kind: input.kind,
            startMs: input.startMs,
            endMs: input.endMs,
          },
        );
        response.status(200).json({version: 1, data});
        return;
      }

      if (path === '/v1/llm/chat') {
        requireMethod(request, 'POST');
        const input = decodeChatRequest(request.body, dependencies.allowedModels);
        const credential = await dependencies.vault.get(identity.uid, input.provider);
        if (credential === null) {
          throw new ApiContractError(
            409,
            'credential_missing',
            'Configure an AI credential first',
          );
        }
        const content = await dependencies.upstream.chat(credential, input);
        response.status(200).json({
          version: 1,
          provider: input.provider,
          model: input.model,
          content,
        });
        return;
      }

      if (path === '/v1/llm/meal-image') {
        requireMethod(request, 'POST');
        const input = decodeMealImageRequest(
          request.body,
          dependencies.allowedModels,
        );
        const credential = await dependencies.vault.get(identity.uid, input.provider);
        if (credential === null) {
          throw new ApiContractError(
            409,
            'credential_missing',
            'Configure an AI credential first',
          );
        }
        const content = await dependencies.upstream.analyzeMealImage(
          credential,
          input,
        );
        response.status(200).json({
          version: 1,
          provider: input.provider,
          model: input.model,
          content,
        });
        return;
      }

      throw new ApiContractError(404, 'not_found', 'Route not found');
    } catch (error) {
      sendError(response, error);
    }
  };
};
