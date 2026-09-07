import type {ProductPersonalizationKeyValueStore} from './persistence';
import {
  KeyValueProductPersonalizationStore,
  serializePersonalizationStorageAccess,
} from './persistence';
import type {StoredProductPersonalization} from './types';
import {
  PERSONALIZATION_SYNC_SECTION_IDS,
  applyPersonalizationSyncMutation,
  buildPersonalizationSyncMutation,
  decodeRemotePersonalizationDocument,
  encodeRemotePersonalizationDocument,
  personalizationSectionChanged,
  personalizationSyncSections,
  validatePersonalizationSyncMutation,
  type PersonalizationSyncMutation,
  type PersonalizationSyncSectionId,
  type ProductPersonalizationRemoteAdapter,
  type ProductPersonalizationSyncScope,
  type RemotePersonalizationSnapshot,
} from './sync';
import {parseStoredProductPersonalization} from './validation';

export interface PersonalizationSyncClock {
  now(): number;
}

export interface PersonalizationSyncMutationIds {
  next(): string;
}

export interface PersonalizationSectionSyncState {
  readonly schemaVersion: 1;
  readonly section: PersonalizationSyncSectionId;
  readonly appliedRevision: number;
  readonly pending?: PersonalizationSyncMutation;
}

const safeKeyPart = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
};

export const productPersonalizationSyncStorageKey = (
  scope: ProductPersonalizationSyncScope,
  section: PersonalizationSyncSectionId,
): string => {
  const user = safeKeyPart(scope.productUserId, 'Product User ID');
  const workspace = safeKeyPart(scope.workspaceId, 'Workspace ID');
  const source = safeKeyPart(scope.nightscoutSourceId, 'Nightscout Source ID');
  const prefix = 'shani.product-personalization-sync.v1';
  if (section === 'account') {
    return `${prefix}.account:${user}`;
  }
  if (section === 'workspace') {
    return `${prefix}.workspace:${user}:${workspace}:${source}`;
  }
  return `${prefix}.${section.replace(':', '-')}:${user}`;
};

export const productPersonalizationSyncTransactionStorageKey = (
  productUserId: string,
): string =>
  `shani.product-personalization-sync.v1.transaction:${safeKeyPart(
    productUserId,
    'Product User ID',
  )}`;

const emptyState = (
  section: PersonalizationSyncSectionId,
): PersonalizationSectionSyncState => ({
  schemaVersion: 1,
  section,
  appliedRevision: 0,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseSyncState = (
  untrusted: unknown,
  scope: ProductPersonalizationSyncScope,
  section: PersonalizationSyncSectionId,
): PersonalizationSectionSyncState => {
  if (!isRecord(untrusted)) {
    throw new Error('Personalization sync state is invalid.');
  }
  const keys = Object.keys(untrusted).sort();
  const expected = (
    untrusted.pending === undefined
      ? ['appliedRevision', 'schemaVersion', 'section']
      : ['appliedRevision', 'pending', 'schemaVersion', 'section']
  ).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.section !== section ||
    typeof untrusted.appliedRevision !== 'number' ||
    !Number.isSafeInteger(untrusted.appliedRevision) ||
    untrusted.appliedRevision < 0
  ) {
    throw new Error('Personalization sync state is invalid.');
  }
  const pending =
    untrusted.pending === undefined
      ? undefined
      : validatePersonalizationSyncMutation(untrusted.pending, scope, section);
  return {
    schemaVersion: 1,
    section,
    appliedRevision: untrusted.appliedRevision,
    ...(pending === undefined ? {} : {pending}),
  };
};

interface PendingPersonalizationSyncTransaction {
  readonly schemaVersion: 1;
  readonly status: 'pending';
  readonly scope: ProductPersonalizationSyncScope;
  readonly mutations: readonly PersonalizationSyncMutation[];
}

const parseTransactionScope = (
  value: unknown,
  expectedProductUserId: string,
): ProductPersonalizationSyncScope => {
  if (!isRecord(value)) {
    throw new Error('Personalization sync transaction scope is invalid.');
  }
  if (
    value.productUserId !== expectedProductUserId ||
    typeof value.workspaceId !== 'string' ||
    typeof value.nightscoutSourceId !== 'string' ||
    (value.layout !== 'phone' &&
      value.layout !== 'tablet' &&
      value.layout !== 'desktop')
  ) {
    throw new Error('Personalization sync transaction scope is invalid.');
  }
  const scope: ProductPersonalizationSyncScope = {
    productUserId: expectedProductUserId,
    workspaceId: value.workspaceId,
    nightscoutSourceId: value.nightscoutSourceId,
    layout: value.layout,
  };
  // Deriving a key validates every opaque identifier before it is used.
  productPersonalizationSyncStorageKey(scope, 'workspace');
  return scope;
};

const parsePendingSyncTransaction = (
  raw: string | null,
  productUserId: string,
): PendingPersonalizationSyncTransaction | undefined => {
  if (raw === null) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Personalization sync transaction is corrupt.');
  }
  if (!isRecord(value) || value.status === 'complete') {
    return undefined;
  }
  if (
    value.schemaVersion !== 1 ||
    value.status !== 'pending' ||
    !Array.isArray(value.mutations) ||
    value.mutations.length === 0 ||
    value.mutations.length > PERSONALIZATION_SYNC_SECTION_IDS.length
  ) {
    throw new Error('Personalization sync transaction is invalid.');
  }
  const scope = parseTransactionScope(value.scope, productUserId);
  const mutations = value.mutations.map(candidate => {
    if (!isRecord(candidate) || typeof candidate.section !== 'string') {
      throw new Error('Personalization sync transaction is invalid.');
    }
    if (
      !PERSONALIZATION_SYNC_SECTION_IDS.includes(
        candidate.section as PersonalizationSyncSectionId,
      )
    ) {
      throw new Error('Personalization sync transaction is invalid.');
    }
    return validatePersonalizationSyncMutation(
      candidate,
      scope,
      candidate.section as PersonalizationSyncSectionId,
    );
  });
  if (
    new Set(mutations.map(mutation => mutation.section)).size !==
    mutations.length
  ) {
    throw new Error('Personalization sync transaction has duplicate sections.');
  }
  return {schemaVersion: 1, status: 'pending', scope, mutations};
};

export class KeyValueProductPersonalizationSyncStore {
  constructor(private readonly storage: ProductPersonalizationKeyValueStore) {}

  private async readDirect(
    scope: ProductPersonalizationSyncScope,
    section: PersonalizationSyncSectionId,
  ): Promise<PersonalizationSectionSyncState> {
    const raw = await this.storage.getItem(
      productPersonalizationSyncStorageKey(scope, section),
    );
    if (raw === null) {
      return emptyState(section);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('Personalization sync state is corrupt.');
    }
    return parseSyncState(decoded, scope, section);
  }

  private async stageDirect(
    scope: ProductPersonalizationSyncScope,
    mutation: PersonalizationSyncMutation,
  ): Promise<void> {
    const current = await this.readDirect(scope, mutation.section);
    const pending = validatePersonalizationSyncMutation(
      mutation,
      scope,
      mutation.section,
    );
    await this.storage.setItem(
      productPersonalizationSyncStorageKey(scope, mutation.section),
      JSON.stringify({...current, pending}),
    );
  }

  private async recoverPending(productUserId: string): Promise<void> {
    const key = productPersonalizationSyncTransactionStorageKey(productUserId);
    const pending = parsePendingSyncTransaction(
      await this.storage.getItem(key),
      productUserId,
    );
    if (pending === undefined) {
      return;
    }
    for (const mutation of pending.mutations) {
      await this.stageDirect(pending.scope, mutation);
    }
    await this.storage.setItem(
      key,
      JSON.stringify({schemaVersion: 1, status: 'complete'}),
    );
  }

  async read(
    scope: ProductPersonalizationSyncScope,
    section: PersonalizationSyncSectionId,
  ): Promise<PersonalizationSectionSyncState> {
    return serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        return this.readDirect(scope, section);
      },
    );
  }

  async stage(
    scope: ProductPersonalizationSyncScope,
    mutation: PersonalizationSyncMutation,
  ): Promise<void> {
    await this.stageBatch(scope, [mutation]);
  }

  async stageBatch(
    scope: ProductPersonalizationSyncScope,
    mutations: readonly PersonalizationSyncMutation[],
  ): Promise<void> {
    if (mutations.length === 0) {
      return;
    }
    await serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        const normalized = mutations.map(mutation =>
          validatePersonalizationSyncMutation(
            mutation,
            scope,
            mutation.section,
          ),
        );
        if (
          new Set(normalized.map(mutation => mutation.section)).size !==
          normalized.length
        ) {
          throw new Error('A personalization save repeated a sync section.');
        }
        const transaction: PendingPersonalizationSyncTransaction = {
          schemaVersion: 1,
          status: 'pending',
          scope,
          mutations: normalized,
        };
        const transactionKey = productPersonalizationSyncTransactionStorageKey(
          scope.productUserId,
        );
        await this.storage.setItem(transactionKey, JSON.stringify(transaction));
        for (const mutation of normalized) {
          await this.stageDirect(scope, mutation);
        }
        await this.storage.setItem(
          transactionKey,
          JSON.stringify({schemaVersion: 1, status: 'complete'}),
        );
      },
    );
  }

  async markApplied(
    scope: ProductPersonalizationSyncScope,
    snapshot: RemotePersonalizationSnapshot,
  ): Promise<void> {
    await serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        const normalized = decodeRemotePersonalizationDocument(
          encodeRemotePersonalizationDocument(snapshot),
          scope,
          snapshot.section,
        );
        await this.storage.setItem(
          productPersonalizationSyncStorageKey(scope, normalized.section),
          JSON.stringify({
            schemaVersion: 1,
            section: normalized.section,
            appliedRevision: normalized.revision,
          }),
        );
      },
    );
  }

  async countPending(scope: ProductPersonalizationSyncScope): Promise<number> {
    return serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        const states = await Promise.all(
          PERSONALIZATION_SYNC_SECTION_IDS.map(section =>
            this.readDirect(scope, section),
          ),
        );
        return states.filter(state => state.pending !== undefined).length;
      },
    );
  }
}

export type PersonalizationSynchronizationResult = {
  readonly preferences: StoredProductPersonalization;
  readonly pendingCount: number;
  readonly failedSections: readonly PersonalizationSyncSectionId[];
  readonly remoteEnabled: boolean;
};

export interface OfflineFirstProductPersonalizationRepositoryOptions {
  readonly localStore: KeyValueProductPersonalizationStore;
  readonly syncStore: KeyValueProductPersonalizationSyncStore;
  readonly remote?: ProductPersonalizationRemoteAdapter;
  readonly clock: PersonalizationSyncClock;
  readonly mutationIds: PersonalizationSyncMutationIds;
}

/**
 * Full-section pending mutations are intentionally coalesced to one per sync
 * section. The outbox is therefore durable but bounded to five small records.
 */
export class OfflineFirstProductPersonalizationRepository {
  private readonly operationTails = new Map<string, Promise<unknown>>();
  private readonly synchronizationTails = new Map<string, Promise<unknown>>();
  private readonly synchronizationRuns = new Map<
    string,
    Promise<PersonalizationSynchronizationResult>
  >();

  constructor(
    private readonly options: OfflineFirstProductPersonalizationRepositoryOptions,
  ) {}

  private async runForProductUser<T>(
    scope: ProductPersonalizationSyncScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = safeKeyPart(scope.productUserId, 'Product User ID');
    const previous = this.operationTails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    this.operationTails.set(key, run);
    try {
      return await run;
    } finally {
      if (this.operationTails.get(key) === run) {
        this.operationTails.delete(key);
      }
    }
  }

  private async openUnlocked(
    scope: ProductPersonalizationSyncScope,
  ): Promise<StoredProductPersonalization> {
    let preferences = await this.options.localStore.read(scope);
    for (const section of personalizationSyncSections()) {
      const state = await this.options.syncStore.read(scope, section);
      if (state.pending !== undefined) {
        preferences = applyPersonalizationSyncMutation(
          preferences,
          state.pending,
        );
      }
    }
    return parseStoredProductPersonalization(preferences);
  }

  async open(
    scope: ProductPersonalizationSyncScope,
  ): Promise<StoredProductPersonalization> {
    return this.runForProductUser(scope, () => this.openUnlocked(scope));
  }

  async save(
    scope: ProductPersonalizationSyncScope,
    current: StoredProductPersonalization,
    next: StoredProductPersonalization,
  ): Promise<StoredProductPersonalization> {
    return this.runForProductUser(scope, async () => {
      const before = parseStoredProductPersonalization(current);
      const desired = parseStoredProductPersonalization(next);
      const changed = personalizationSyncSections().filter(section =>
        personalizationSectionChanged(before, desired, section),
      );
      let value = await this.openUnlocked(scope);
      const savedAt = this.options.clock.now();
      const mutations = changed.map(section =>
        buildPersonalizationSyncMutation({
          scope,
          section,
          preferences: desired,
          mutationId: this.options.mutationIds.next(),
          savedAt,
        }),
      );
      await this.options.syncStore.stageBatch(scope, mutations);
      mutations.forEach(mutation => {
        value = applyPersonalizationSyncMutation(value, mutation);
      });
      if (JSON.stringify(before.device) !== JSON.stringify(desired.device)) {
        value = parseStoredProductPersonalization({
          ...value,
          device: desired.device,
        });
      }
      // Device recents are written here but are never represented in sync state.
      await this.options.localStore.write(scope, value);
      return value;
    });
  }

  synchronize(
    scope: ProductPersonalizationSyncScope,
  ): Promise<PersonalizationSynchronizationResult> {
    // Network work has its own per-account ordering. It must never hold the
    // local persistence lock, otherwise an offline connection blocks saves.
    const userKey = safeKeyPart(scope.productUserId, 'Product User ID');
    const syncKey = JSON.stringify([
      userKey,
      scope.workspaceId,
      scope.nightscoutSourceId,
      scope.layout,
    ]);
    const existing = this.synchronizationRuns.get(syncKey);
    if (existing) {
      return existing;
    }
    const previous =
      this.synchronizationTails.get(userKey) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.synchronizeSections(scope));
    this.synchronizationRuns.set(syncKey, run);
    this.synchronizationTails.set(userKey, run);
    const cleanup = () => {
      if (this.synchronizationRuns.get(syncKey) === run) {
        this.synchronizationRuns.delete(syncKey);
      }
      if (this.synchronizationTails.get(userKey) === run) {
        this.synchronizationTails.delete(userKey);
      }
    };
    run.then(cleanup, cleanup);
    return run;
  }

  private async synchronizeSections(
    scope: ProductPersonalizationSyncScope,
  ): Promise<PersonalizationSynchronizationResult> {
    const remote = this.options.remote;
    const failedSections: PersonalizationSyncSectionId[] = [];
    if (remote) {
      for (const section of personalizationSyncSections()) {
        try {
          const state = await this.runForProductUser(scope, () =>
            this.options.syncStore.read(scope, section),
          );
          const untrustedWinner =
            state.pending === undefined
              ? await remote.fetch(scope, section)
              : await remote.commit(scope, state.pending);
          if (untrustedWinner === undefined) {
            continue;
          }
          const winner = decodeRemotePersonalizationDocument(
            encodeRemotePersonalizationDocument(untrustedWinner),
            scope,
            section,
          );
          await this.runForProductUser(scope, async () => {
            const latest = await this.options.syncStore.read(scope, section);
            // A local save may have replaced the pending mutation while the
            // network was working. Its value and outbox entry remain authoritative
            // until a later sync sends that exact mutation.
            if (
              latest.pending?.mutationId !== state.pending?.mutationId ||
              latest.appliedRevision !== state.appliedRevision
            ) {
              return;
            }
            if (
              state.pending === undefined &&
              winner.revision <= latest.appliedRevision
            ) {
              return;
            }
            const preferences = applyPersonalizationSyncMutation(
              await this.openUnlocked(scope),
              winner,
            );
            await this.options.localStore.write(scope, preferences);
            await this.options.syncStore.markApplied(scope, winner);
          });
        } catch {
          failedSections.push(section);
        }
      }
    }
    return this.runForProductUser(scope, async () => ({
      preferences: await this.openUnlocked(scope),
      pendingCount: await this.options.syncStore.countPending(scope),
      failedSections,
      remoteEnabled: remote !== undefined,
    }));
  }
}
