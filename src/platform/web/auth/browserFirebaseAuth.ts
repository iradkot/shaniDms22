import type {IndexedDbKeyValueStore} from '../storage';

const SESSION_KEY = 'shani.web.firebase-session.v1';
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface BrowserFirebaseIdentity {
  readonly uid: string;
  readonly email: string;
  readonly displayName?: string;
}

interface StoredFirebaseSession {
  readonly schemaVersion: 1;
  readonly identity: BrowserFirebaseIdentity;
  readonly idToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number;
}

export type BrowserFirebaseAuthSnapshot =
  | {readonly status: 'loading'}
  | {readonly status: 'signed-out'; readonly error?: string}
  | {
      readonly status: 'signed-in';
      readonly identity: BrowserFirebaseIdentity;
      readonly connection: 'online' | 'offline';
    };

export interface BrowserFirebaseAuthOptions {
  readonly apiKey: string;
  readonly storage: Pick<
    IndexedDbKeyValueStore,
    'getItem' | 'setItem' | 'removeItem'
  >;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 20 && value.length <= 20_000;

const safeUid = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const safeEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 320 && value.includes('@');

const decodeStoredSession = (
  raw: string | null,
): StoredFirebaseSession | null => {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isRecord(value.identity) ||
      !safeUid(value.identity.uid) ||
      !safeEmail(value.identity.email) ||
      (value.identity.displayName !== undefined &&
        (typeof value.identity.displayName !== 'string' ||
          value.identity.displayName.length > 160)) ||
      !safeToken(value.idToken) ||
      !safeToken(value.refreshToken) ||
      typeof value.expiresAtMs !== 'number' ||
      !Number.isSafeInteger(value.expiresAtMs) ||
      value.expiresAtMs <= 0
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      identity: {
        uid: value.identity.uid,
        email: value.identity.email,
        ...(value.identity.displayName === undefined
          ? {}
          : {displayName: value.identity.displayName}),
      },
      idToken: value.idToken,
      refreshToken: value.refreshToken,
      expiresAtMs: value.expiresAtMs,
    };
  } catch {
    return null;
  }
};

const expiresAt = (nowMs: number, expiresIn: unknown): number => {
  const seconds =
    typeof expiresIn === 'string' && expiresIn.trim().length > 0
      ? Number(expiresIn)
      : expiresIn;
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds < 60 ||
    seconds > 31 * 24 * 60 * 60
  ) {
    throw new Error('Firebase returned an invalid session lifetime.');
  }
  return nowMs + Math.floor(seconds * 1_000);
};

const responseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new Error('Firebase returned an invalid response.');
  }
};

export class BrowserFirebaseAuth {
  private snapshot: BrowserFirebaseAuthSnapshot = {status: 'loading'};
  private session: StoredFirebaseSession | null = null;
  private readonly listeners = new Set<() => void>();
  private refreshPromise: Promise<string> | undefined;
  private authGeneration = 0;
  private storageTail: Promise<void> = Promise.resolve();
  private readonly request: typeof globalThis.fetch;
  private readonly now: () => number;

  constructor(private readonly options: BrowserFirebaseAuthOptions) {
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BrowserFirebaseAuthSnapshot => this.snapshot;

  private publish(snapshot: BrowserFirebaseAuthSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 20_000,
    );
    try {
      return await this.request(url, {...init, signal: controller.signal});
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Authentication request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private persist(
    session: StoredFirebaseSession,
    expectedGeneration: number,
  ): Promise<boolean> {
    return this.withStorageLock(async () => {
      if (this.authGeneration !== expectedGeneration) {
        return false;
      }
      await this.options.storage.setItem(SESSION_KEY, JSON.stringify(session));
      if (this.authGeneration !== expectedGeneration) {
        return false;
      }
      this.session = session;
      return true;
    });
  }

  private withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageTail.then(operation, operation);
    this.storageTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private isCurrent(
    expectedGeneration: number,
    expectedSession: StoredFirebaseSession,
  ): boolean {
    return (
      this.authGeneration === expectedGeneration &&
      this.session === expectedSession
    );
  }

  private staleSessionError(): Error {
    const error = new Error('Authentication session changed.');
    error.name = 'AbortError';
    return error;
  }

  async initialize(): Promise<void> {
    const generation = ++this.authGeneration;
    this.refreshPromise = undefined;
    const raw = await this.options.storage.getItem(SESSION_KEY);
    if (this.authGeneration !== generation) {
      return;
    }
    const stored = decodeStoredSession(raw);
    if (stored === null) {
      if (raw !== null) {
        await this.options.storage.removeItem(SESSION_KEY);
      }
      this.session = null;
      this.publish({status: 'signed-out'});
      return;
    }
    this.session = stored;
    this.publish({
      status: 'signed-in',
      identity: stored.identity,
      connection: 'offline',
    });
    try {
      await this.getIdToken(true);
    } catch {
      // The cached identity still scopes local-first data while offline.
    }
  }

  async signInWithGoogleCredential(googleIdToken: string): Promise<void> {
    if (!safeToken(googleIdToken)) {
      throw new Error('Google returned an invalid credential.');
    }
    const generation = ++this.authGeneration;
    this.refreshPromise = undefined;
    const response = await this.fetchWithTimeout(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
        this.options.apiKey,
      )}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          postBody: `id_token=${encodeURIComponent(
            googleIdToken,
          )}&providerId=google.com`,
          requestUri: globalThis.location?.origin ?? 'http://localhost',
          returnSecureToken: true,
          returnIdpCredential: false,
        }),
      },
    );
    const untrusted = await responseJson(response);
    if (this.authGeneration !== generation) {
      throw this.staleSessionError();
    }
    if (!response.ok || !isRecord(untrusted)) {
      throw new Error('Google sign-in could not be completed.');
    }
    if (
      !safeUid(untrusted.localId) ||
      !safeEmail(untrusted.email) ||
      !safeToken(untrusted.idToken) ||
      !safeToken(untrusted.refreshToken)
    ) {
      throw new Error('Firebase returned an invalid sign-in session.');
    }
    const identity: BrowserFirebaseIdentity = {
      uid: untrusted.localId,
      email: untrusted.email,
      ...(typeof untrusted.displayName === 'string' &&
      untrusted.displayName.trim().length > 0 &&
      untrusted.displayName.length <= 160
        ? {displayName: untrusted.displayName.trim()}
        : {}),
    };
    const session: StoredFirebaseSession = {
      schemaVersion: 1,
      identity,
      idToken: untrusted.idToken,
      refreshToken: untrusted.refreshToken,
      expiresAtMs: expiresAt(this.now(), untrusted.expiresIn),
    };
    if (!(await this.persist(session, generation))) {
      throw this.staleSessionError();
    }
    if (this.authGeneration === generation) {
      this.publish({status: 'signed-in', identity, connection: 'online'});
    }
  }

  async signOut(): Promise<void> {
    const generation = ++this.authGeneration;
    this.session = null;
    this.refreshPromise = undefined;
    await this.withStorageLock(() =>
      this.options.storage.removeItem(SESSION_KEY),
    );
    if (this.authGeneration === generation) {
      this.publish({status: 'signed-out'});
    }
  }

  getIdentity(): BrowserFirebaseIdentity | null {
    return this.session?.identity ?? null;
  }

  async getIdToken(forceRefresh = false): Promise<string> {
    const session = this.session;
    if (session === null) {
      throw new Error('Authentication required.');
    }
    if (
      !forceRefresh &&
      session.expiresAtMs - this.now() > TOKEN_REFRESH_MARGIN_MS
    ) {
      return session.idToken;
    }
    if (this.refreshPromise !== undefined) {
      return this.refreshPromise;
    }
    const generation = this.authGeneration;
    const refresh = this.refresh(session, generation).finally(() => {
      if (this.refreshPromise === refresh) {
        this.refreshPromise = undefined;
      }
    });
    this.refreshPromise = refresh;
    return refresh;
  }

  private async refresh(
    current: StoredFirebaseSession,
    generation: number,
  ): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(
          this.options.apiKey,
        )}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: current.refreshToken,
          }).toString(),
        },
      );
    } catch (error) {
      if (this.isCurrent(generation, current)) {
        this.publish({
          status: 'signed-in',
          identity: current.identity,
          connection: 'offline',
        });
      }
      throw error;
    }
    const untrusted = await responseJson(response);
    if (!this.isCurrent(generation, current)) {
      throw this.staleSessionError();
    }
    if (!response.ok || !isRecord(untrusted)) {
      if (response.status >= 400 && response.status < 500) {
        await this.signOut();
      }
      throw new Error('The Firebase session could not be refreshed.');
    }
    if (
      !safeUid(untrusted.user_id) ||
      untrusted.user_id !== current.identity.uid ||
      !safeToken(untrusted.id_token) ||
      !safeToken(untrusted.refresh_token)
    ) {
      await this.signOut();
      throw new Error('Firebase returned an invalid refreshed session.');
    }
    const next: StoredFirebaseSession = {
      ...current,
      idToken: untrusted.id_token,
      refreshToken: untrusted.refresh_token,
      expiresAtMs: expiresAt(this.now(), untrusted.expires_in),
    };
    if (!(await this.persist(next, generation))) {
      throw this.staleSessionError();
    }
    if (this.authGeneration !== generation) {
      throw this.staleSessionError();
    }
    this.publish({
      status: 'signed-in',
      identity: next.identity,
      connection: 'online',
    });
    return next.idToken;
  }
}
