export interface StringKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface NightscoutVaultAuthSession {
  getCurrentUserId(): string | null;
  subscribe(listener: (userId: string | null) => void): () => void;
}

export interface NightscoutVaultProfileSecret {
  readonly baseUrl: string;
  readonly apiSecretSha1: string;
}

export interface NightscoutVaultActiveProfileReader {
  /** Re-reads only the captured account's credential at retry time. */
  readActiveProfile(
    expectedUserId: string,
  ): Promise<NightscoutVaultProfileSecret | null>;
}

export interface NightscoutVaultRemote {
  provision(
    profile: NightscoutVaultProfileSecret,
    expectedUserId: string,
  ): Promise<void>;
  remove(expectedUserId: string): Promise<void>;
}

export interface NightscoutVaultRetryTrigger {
  subscribe(listener: () => void): () => void;
}

export type NightscoutVaultSyncErrorCode =
  | 'unauthenticated'
  | 'storage'
  | 'network'
  | 'rejected';

export type NightscoutVaultSyncSnapshot =
  | {readonly state: 'idle'; readonly pending: false}
  | {readonly state: 'pending'; readonly pending: true}
  | {readonly state: 'syncing'; readonly pending: true}
  | {
      readonly state: 'error';
      readonly pending: boolean;
      readonly error: {
        readonly code: NightscoutVaultSyncErrorCode;
        readonly message: string;
      };
    };

export interface NightscoutVaultSynchronizer {
  getSnapshot(): NightscoutVaultSyncSnapshot;
  subscribe(listener: () => void): () => void;
  /** Durably records a secret-free intent, then starts network work in the background. */
  requestReconciliation(intent: NightscoutVaultIntentKind): Promise<void>;
  /** Drains the current signed-in user's pending intent, if one exists. */
  retryPending(): Promise<void>;
  /** Enables sign-in and foreground retries. Returns a cleanup callback. */
  activate(): () => void;
}

interface ReconcileIntent {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly kind: NightscoutVaultIntentKind;
}

export type NightscoutVaultIntentKind = 'provision' | 'remove';

export interface CreateNightscoutVaultSynchronizerInput {
  readonly strings: StringKeyValueStore;
  readonly auth: NightscoutVaultAuthSession;
  readonly profiles: NightscoutVaultActiveProfileReader;
  readonly remote: NightscoutVaultRemote;
  readonly retryTrigger?: NightscoutVaultRetryTrigger;
}

const OUTBOX_PREFIX = 'nightscout.vault.reconcile.v1:';

const outboxKey = (userId: string): string =>
  `${OUTBOX_PREFIX}${encodeURIComponent(userId)}`;

const decodeIntent = (raw: string | null): ReconcileIntent | null => {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (
      record.schemaVersion !== 1 ||
      !Number.isSafeInteger(record.revision) ||
      (record.kind !== 'provision' && record.kind !== 'remove') ||
      (record.revision as number) < 1
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      revision: record.revision as number,
      kind: record.kind,
    };
  } catch {
    return null;
  }
};

const errorDetails = (
  error: unknown,
): {code: NightscoutVaultSyncErrorCode; message: string} => {
  const candidate = error as {code?: unknown; message?: unknown};
  const message =
    typeof candidate?.message === 'string' && candidate.message.trim()
      ? candidate.message
      : 'Nightscout vault sync failed';
  if (candidate?.code === 'unauthenticated') {
    return {code: 'unauthenticated', message};
  }
  if (candidate?.code === 'storage') {
    return {code: 'storage', message};
  }
  if (
    candidate?.code === 'invalid_request' ||
    candidate?.code === 'unauthorized'
  ) {
    return {code: 'rejected', message};
  }
  return {code: 'network', message};
};

class DefaultNightscoutVaultSynchronizer
  implements NightscoutVaultSynchronizer
{
  private snapshot: NightscoutVaultSyncSnapshot = {
    state: 'idle',
    pending: false,
  };
  private readonly listeners = new Set<() => void>();
  private storageTail: Promise<void> = Promise.resolve();
  private retryFlight: Promise<void> | null = null;
  private retryAgain = false;

  constructor(
    private readonly input: CreateNightscoutVaultSynchronizerInput,
  ) {}

  getSnapshot = (): NightscoutVaultSyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  requestReconciliation = async (
    intentKind: NightscoutVaultIntentKind,
  ): Promise<void> => {
    const userId = this.input.auth.getCurrentUserId()?.trim() ?? '';
    if (!userId) {
      this.publish({
        state: 'error',
        pending: false,
        error: {
          code: 'unauthenticated',
          message: 'Sign in is required to sync the Nightscout connection',
        },
      });
      return;
    }
    try {
      await this.withStorageLock(async () => {
        const key = outboxKey(userId);
        const previous = decodeIntent(await this.input.strings.getItem(key));
        const revision = (previous?.revision ?? 0) + 1;
        await this.input.strings.setItem(
          key,
          JSON.stringify({schemaVersion: 1, revision, kind: intentKind}),
        );
      });
      this.publish({state: 'pending', pending: true});
      this.retryPending().catch(() => undefined);
    } catch (error) {
      this.publish({
        state: 'error',
        pending: false,
        error: {
          code: 'storage',
          message:
            error instanceof Error
              ? error.message
              : 'Could not queue Nightscout vault sync',
        },
      });
    }
  };

  retryPending = (): Promise<void> => {
    if (this.retryFlight) {
      this.retryAgain = true;
      return this.retryFlight.then(() => this.retryFlight ?? Promise.resolve());
    }
    const flight = this.drain().finally(() => {
      if (this.retryFlight !== flight) {
        return;
      }
      this.retryFlight = null;
      if (this.retryAgain) {
        this.retryAgain = false;
        this.retryPending().catch(() => undefined);
      }
    });
    this.retryFlight = flight;
    return flight;
  };

  activate = (): (() => void) => {
    const stopAuth = this.input.auth.subscribe(userId => {
      if (userId?.trim()) {
        this.retryPending().catch(() => undefined);
      }
    });
    const stopRetry = this.input.retryTrigger?.subscribe(() => {
      this.retryPending().catch(() => undefined);
    });
    return () => {
      stopAuth();
      stopRetry?.();
    };
  };

  private async drain(): Promise<void> {
    while (true) {
      const userId = this.input.auth.getCurrentUserId()?.trim() ?? '';
      if (!userId) {
        this.publish({
          state: 'error',
          pending: false,
          error: {
            code: 'unauthenticated',
            message: 'Sign in is required to sync the Nightscout connection',
          },
        });
        return;
      }

      let intent: ReconcileIntent | null;
      try {
        intent = await this.withStorageLock(() =>
          this.input.strings.getItem(outboxKey(userId)).then(decodeIntent),
        );
      } catch (error) {
        this.publish({
          state: 'error',
          pending: true,
          error: {
            code: 'storage',
            message:
              error instanceof Error
                ? error.message
                : 'Could not read Nightscout vault sync queue',
          },
        });
        return;
      }
      if (intent === null) {
        this.publish({state: 'idle', pending: false});
        return;
      }

      this.publish({state: 'syncing', pending: true});
      try {
        if (intent.kind === 'remove') {
          await this.input.remote.remove(userId);
        } else {
          const activeProfile = await this.input.profiles.readActiveProfile(
            userId,
          );
          if (activeProfile === null) {
            const missingProfile = new Error(
              'The queued Nightscout connection is unavailable on this device',
            ) as Error & {code: string};
            missingProfile.code = 'storage';
            throw missingProfile;
          }
          if (this.input.auth.getCurrentUserId()?.trim() !== userId) {
            this.publish({state: 'pending', pending: true});
            return;
          }
          await this.input.remote.provision(activeProfile, userId);
        }
      } catch (error) {
        this.publish({
          state: 'error',
          pending: true,
          error: errorDetails(error),
        });
        return;
      }

      try {
        const hasNewerIntent = await this.withStorageLock(async () => {
          const key = outboxKey(userId);
          const latest = decodeIntent(await this.input.strings.getItem(key));
          if (latest?.revision === intent?.revision) {
            await this.input.strings.removeItem(key);
            return false;
          }
          return latest !== null;
        });
        if (!hasNewerIntent) {
          this.publish({state: 'idle', pending: false});
          return;
        }
      } catch (error) {
        this.publish({
          state: 'error',
          pending: true,
          error: {
            code: 'storage',
            message:
              error instanceof Error
                ? error.message
                : 'Could not finish Nightscout vault sync',
          },
        });
        return;
      }
    }
  }

  private publish(snapshot: NightscoutVaultSyncSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {
        // Observer failures must never stop credential reconciliation.
      }
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
}

export const createNightscoutVaultSynchronizer = (
  input: CreateNightscoutVaultSynchronizerInput,
): NightscoutVaultSynchronizer =>
  new DefaultNightscoutVaultSynchronizer(input);
