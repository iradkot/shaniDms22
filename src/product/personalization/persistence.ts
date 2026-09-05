import {createDefaultProductPersonalization} from './presets';
import type {
  PersonalizationLayout,
  StoredProductPersonalization,
} from './types';
import {
  parseStoredProductPersonalization,
  safeParseStoredProductPersonalization,
} from './validation';

export interface ProductPersonalizationKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const storageQueues = new WeakMap<
  object,
  Map<string, Promise<unknown>>
>();

/** @internal Serializes account-scoped persistence across hook/runtime changes. */
export const serializePersonalizationStorageAccess = async <T>(
  storage: ProductPersonalizationKeyValueStore,
  productUserId: string,
  operation: () => Promise<T>,
): Promise<T> => {
  let queues = storageQueues.get(storage);
  if (queues === undefined) {
    queues = new Map();
    storageQueues.set(storage, queues);
  }
  const key = safeKeyPart(productUserId, 'Product User ID');
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  queues.set(key, run);
  try {
    return await run;
  } finally {
    if (queues.get(key) === run) {
      queues.delete(key);
    }
  }
};

export interface ProductPersonalizationStorageScope {
  readonly productUserId: string;
  readonly workspaceId: string;
  readonly layout: PersonalizationLayout;
}

const safeKeyPart = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new Error(`${label} is invalid.`);
  }
  return encodeURIComponent(normalized);
};

export const productPersonalizationStorageKeys = (
  scope: ProductPersonalizationStorageScope,
) => {
  const user = safeKeyPart(scope.productUserId, 'Product User ID');
  const workspace = safeKeyPart(scope.workspaceId, 'Workspace ID');
  const layout = safeKeyPart(scope.layout, 'Layout');
  const prefix = 'shani.product-personalization.v1';
  return {
    account: `${prefix}.account:${user}`,
    workspace: `${prefix}.workspace:${user}:${workspace}`,
    layout: `${prefix}.layout:${user}`,
    device: `${prefix}.device:${user}:${workspace}:${layout}`,
  } as const;
};

export const productPersonalizationTransactionStorageKey = (
  productUserId: string,
): string =>
  `shani.product-personalization.v1.transaction:${safeKeyPart(
    productUserId,
    'Product User ID',
  )}`;

const decodeJson = (raw: string | null): unknown | undefined => {
  if (raw === null) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

type PersonalizationSection = 'account' | 'workspace' | 'layout' | 'device';

interface PendingPersonalizationTransaction {
  readonly schemaVersion: 1;
  readonly status: 'pending';
  readonly scope: ProductPersonalizationStorageScope;
  readonly value: StoredProductPersonalization;
}

const decodePendingTransaction = (
  raw: string | null,
  productUserId: string,
): PendingPersonalizationTransaction | undefined => {
  const candidate = decodeJson(raw);
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return undefined;
  }
  const value = candidate as Record<string, unknown>;
  if (value.schemaVersion !== 1 || value.status !== 'pending') {
    return undefined;
  }
  const untrustedScope = value.scope;
  if (
    typeof untrustedScope !== 'object' ||
    untrustedScope === null ||
    Array.isArray(untrustedScope)
  ) {
    throw new Error('Personalization write transaction is corrupt.');
  }
  const scopeRecord = untrustedScope as Record<string, unknown>;
  if (
    scopeRecord.productUserId !== productUserId ||
    typeof scopeRecord.workspaceId !== 'string' ||
    (scopeRecord.layout !== 'phone' &&
      scopeRecord.layout !== 'tablet' &&
      scopeRecord.layout !== 'desktop')
  ) {
    throw new Error('Personalization write transaction has an invalid scope.');
  }
  return {
    schemaVersion: 1,
    status: 'pending',
    scope: {
      productUserId,
      workspaceId: scopeRecord.workspaceId,
      layout: scopeRecord.layout,
    },
    value: parseStoredProductPersonalization(value.value),
  };
};

const recoverSection = <TSection extends PersonalizationSection>(
  section: TSection,
  candidate: unknown | undefined,
  fallback: StoredProductPersonalization,
): StoredProductPersonalization[TSection] => {
  if (candidate === undefined) {
    return fallback[section];
  }
  const parsed = safeParseStoredProductPersonalization({
    ...fallback,
    [section]: candidate,
  });
  return parsed.success ? parsed.value[section] : fallback[section];
};

/**
 * Local persistence keeps sync scopes physically separate. A corrupt device
 * recent list therefore cannot erase Account favorites or a Layout Profile.
 */
export class KeyValueProductPersonalizationStore {
  constructor(private readonly storage: ProductPersonalizationKeyValueStore) {}

  private async project(
    scope: ProductPersonalizationStorageScope,
    value: StoredProductPersonalization,
  ): Promise<void> {
    const keys = productPersonalizationStorageKeys(scope);
    await Promise.all([
      this.storage.setItem(keys.account, JSON.stringify(value.account)),
      this.storage.setItem(keys.workspace, JSON.stringify(value.workspace)),
      this.storage.setItem(keys.layout, JSON.stringify(value.layout)),
      this.storage.setItem(keys.device, JSON.stringify(value.device)),
    ]);
  }

  private async recoverPending(productUserId: string): Promise<void> {
    const transactionKey =
      productPersonalizationTransactionStorageKey(productUserId);
    const pending = decodePendingTransaction(
      await this.storage.getItem(transactionKey),
      productUserId,
    );
    if (pending === undefined) {
      return;
    }
    await this.project(pending.scope, pending.value);
    await this.storage.setItem(
      transactionKey,
      JSON.stringify({schemaVersion: 1, status: 'complete'}),
    );
  }

  async read(
    scope: ProductPersonalizationStorageScope,
  ): Promise<StoredProductPersonalization> {
    return serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        const keys = productPersonalizationStorageKeys(scope);
        const [accountRaw, workspaceRaw, layoutRaw, deviceRaw] =
          await Promise.all([
            this.storage.getItem(keys.account),
            this.storage.getItem(keys.workspace),
            this.storage.getItem(keys.layout),
            this.storage.getItem(keys.device),
          ]);
        const fallback = createDefaultProductPersonalization();
        return parseStoredProductPersonalization({
          schemaVersion: 1,
          account: recoverSection(
            'account',
            decodeJson(accountRaw),
            fallback,
          ),
          workspace: recoverSection(
            'workspace',
            decodeJson(workspaceRaw),
            fallback,
          ),
          layout: recoverSection(
            'layout',
            decodeJson(layoutRaw),
            fallback,
          ),
          device: recoverSection(
            'device',
            decodeJson(deviceRaw),
            fallback,
          ),
        });
      },
    );
  }

  async write(
    scope: ProductPersonalizationStorageScope,
    untrustedValue: unknown,
  ): Promise<StoredProductPersonalization> {
    const value = parseStoredProductPersonalization(untrustedValue);
    return serializePersonalizationStorageAccess(
      this.storage,
      scope.productUserId,
      async () => {
        await this.recoverPending(scope.productUserId);
        const transactionKey =
          productPersonalizationTransactionStorageKey(scope.productUserId);
        const transaction: PendingPersonalizationTransaction = {
          schemaVersion: 1,
          status: 'pending',
          scope,
          value,
        };
        await this.storage.setItem(transactionKey, JSON.stringify(transaction));
        await this.project(scope, value);
        await this.storage.setItem(
          transactionKey,
          JSON.stringify({schemaVersion: 1, status: 'complete'}),
        );
        return value;
      },
    );
  }
}
