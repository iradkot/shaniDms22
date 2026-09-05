import {sha256Hex} from '../domain/canonical';
import type {
  RuntimePluginPersistenceSnapshot,
  RuntimePluginRepository,
  RuntimePluginScope,
} from '../domain/types';

const EMPTY_SNAPSHOT: RuntimePluginPersistenceSnapshot = {
  schemaVersion: 1,
  records: [],
  grants: [],
  audit: [],
};

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const scopeKey = (scope: RuntimePluginScope): string =>
  sha256Hex(`${scope.productUserId}\u0000${scope.workspaceId}`);

const validSnapshotRoot = (
  value: unknown,
): value is RuntimePluginPersistenceSnapshot => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.records) &&
    Array.isArray(record.grants) &&
    Array.isArray(record.audit) &&
    Object.keys(record).every(key =>
      ['schemaVersion', 'records', 'grants', 'audit'].includes(key),
    )
  );
};

export class InMemoryRuntimePluginRepository
  implements RuntimePluginRepository
{
  private readonly values = new Map<
    string,
    RuntimePluginPersistenceSnapshot
  >();

  async load(scope: RuntimePluginScope): Promise<RuntimePluginPersistenceSnapshot> {
    return clone(this.values.get(scopeKey(scope)) ?? EMPTY_SNAPSHOT);
  }

  async commit(
    scope: RuntimePluginScope,
    snapshot: RuntimePluginPersistenceSnapshot,
  ): Promise<void> {
    this.values.set(scopeKey(scope), clone(snapshot));
  }
}

export interface RuntimePluginKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface KeyValueRuntimePluginRepositoryOptions {
  readonly keyPrefix?: string;
  readonly onCorruption?: (error: Error) => void;
}

/**
 * Local-first repository with a write-ahead record. AsyncStorage and browser
 * storage adapters only need to implement three small key/value operations.
 */
export class KeyValueRuntimePluginRepository
  implements RuntimePluginRepository
{
  private readonly keyPrefix: string;

  constructor(
    private readonly storage: RuntimePluginKeyValueStore,
    private readonly options: KeyValueRuntimePluginRepositoryOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'shani:runtime-plugins:v1';
  }

  private keys(scope: RuntimePluginScope) {
    const suffix = scopeKey(scope);
    return {
      active: `${this.keyPrefix}:${suffix}:active`,
      pending: `${this.keyPrefix}:${suffix}:pending`,
    };
  }

  private decode(value: string | null): RuntimePluginPersistenceSnapshot | undefined {
    if (value === null || value.length > 1024 * 1024) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      return validSnapshotRoot(parsed) ? parsed : undefined;
    } catch (caught) {
      this.options.onCorruption?.(
        caught instanceof Error ? caught : new Error('Invalid plugin cache JSON.'),
      );
      return undefined;
    }
  }

  async load(scope: RuntimePluginScope): Promise<RuntimePluginPersistenceSnapshot> {
    const keys = this.keys(scope);
    const pendingRaw = await this.storage.getItem(keys.pending);
    const pending = this.decode(pendingRaw);
    if (pending) {
      await this.storage.setItem(keys.active, JSON.stringify(pending));
      await this.storage.removeItem(keys.pending);
      return clone(pending);
    }
    if (pendingRaw !== null) {
      await this.storage.removeItem(keys.pending);
      this.options.onCorruption?.(new Error('Discarded an invalid plugin WAL.'));
    }
    const activeRaw = await this.storage.getItem(keys.active);
    const active = this.decode(activeRaw);
    if (active) {
      return clone(active);
    }
    if (activeRaw !== null) {
      this.options.onCorruption?.(new Error('Discarded an invalid plugin cache.'));
    }
    return clone(EMPTY_SNAPSHOT);
  }

  async commit(
    scope: RuntimePluginScope,
    snapshot: RuntimePluginPersistenceSnapshot,
  ): Promise<void> {
    const keys = this.keys(scope);
    const encoded = JSON.stringify(snapshot);
    await this.storage.setItem(keys.pending, encoded);
    await this.storage.setItem(keys.active, encoded);
    await this.storage.removeItem(keys.pending);
  }
}

export const emptyRuntimePluginSnapshot = (): RuntimePluginPersistenceSnapshot =>
  clone(EMPTY_SNAPSHOT);
