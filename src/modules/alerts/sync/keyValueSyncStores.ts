import {
  canonicalAlertSyncValue,
  compareRulePrecedence,
  parseAlertRuleSyncMutation,
  parseImmutableUpdateRecord,
  parseRemoteAlertRuleRecord,
  parseUpdateReadRecord,
  type AlertRuleSyncMutation,
  type AlertSyncScope,
  type ImmutableUpdateRecord,
  type RemoteAlertRuleRecord,
  type UpdateReadRecord,
} from './model';

export interface AlertSyncKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PendingRuleSyncOperation {
  readonly mutation: AlertRuleSyncMutation;
  readonly attempts: number;
}

export type PendingUpdateSyncOperation =
  | {
      readonly kind: 'update';
      readonly record: ImmutableUpdateRecord;
      readonly attempts: number;
    }
  | {
      readonly kind: 'read';
      readonly record: UpdateReadRecord;
      readonly attempts: number;
    };

interface RuleSyncState {
  readonly schemaVersion: 1;
  readonly heads: readonly RemoteAlertRuleRecord[];
  readonly outbox: readonly PendingRuleSyncOperation[];
}

interface UpdateSyncState {
  readonly schemaVersion: 1;
  readonly knownUpdateIds: readonly string[];
  readonly knownReadIds: readonly string[];
  readonly outbox: readonly PendingUpdateSyncOperation[];
}

const storageQueues = new WeakMap<object, Map<string, Promise<unknown>>>();

const serialize = async <T>(
  storage: AlertSyncKeyValueStore,
  key: string,
  operation: () => Promise<T>,
): Promise<T> => {
  let queues = storageQueues.get(storage);
  if (queues === undefined) {
    queues = new Map();
    storageQueues.set(storage, queues);
  }
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

const storageKey = (
  scope: AlertSyncScope,
  kind: 'rules' | 'updates',
): string =>
  `shani.alert-sync.v1.${kind}:${scope.ownerProductUserId}:${scope.workspaceId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseAttempts = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1_000_000
  ) {
    throw new Error('Alert sync retry count is invalid.');
  }
  return value;
};

const decodeJson = (raw: string | null): unknown => {
  if (raw === null) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Alert sync state is corrupt.');
  }
};

const parseRuleState = (
  raw: string | null,
  scope: AlertSyncScope,
): RuleSyncState => {
  const value = decodeJson(raw);
  if (value === undefined) {
    return {schemaVersion: 1, heads: [], outbox: []};
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.heads) ||
    !Array.isArray(value.outbox) ||
    Object.keys(value).some(
      key => !['schemaVersion', 'heads', 'outbox'].includes(key),
    )
  ) {
    throw new Error('Alert rule sync state is invalid.');
  }
  const heads = value.heads.map(head =>
    parseRemoteAlertRuleRecord(head, scope),
  );
  const outbox = value.outbox.map(candidate => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).length !== 2 ||
      !('mutation' in candidate) ||
      !('attempts' in candidate)
    ) {
      throw new Error('Alert rule outbox entry is invalid.');
    }
    return {
      mutation: parseAlertRuleSyncMutation(candidate.mutation, scope),
      attempts: parseAttempts(candidate.attempts),
    };
  });
  if (
    heads.length > 1_000 ||
    outbox.length > 1_000 ||
    new Set(heads.map(head => head.ruleId)).size !== heads.length ||
    new Set(outbox.map(entry => entry.mutation.ruleId)).size !== outbox.length
  ) {
    throw new Error('Alert rule sync state exceeds its bounds.');
  }
  return {schemaVersion: 1, heads, outbox};
};

const safeIds = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 5_000 ||
    value.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
  ) {
    throw new Error('Update sync identifiers are invalid.');
  }
  return [...new Set(value)];
};

const parseUpdateState = (
  raw: string | null,
  scope: AlertSyncScope,
): UpdateSyncState => {
  const value = decodeJson(raw);
  if (value === undefined) {
    return {
      schemaVersion: 1,
      knownUpdateIds: [],
      knownReadIds: [],
      outbox: [],
    };
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.outbox) ||
    Object.keys(value).some(
      key =>
        ![
          'schemaVersion',
          'knownUpdateIds',
          'knownReadIds',
          'outbox',
        ].includes(key),
    )
  ) {
    throw new Error('Update sync state is invalid.');
  }
  const outbox = value.outbox.map(candidate => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).length !== 3 ||
      (candidate.kind !== 'update' && candidate.kind !== 'read')
    ) {
      throw new Error('Update outbox entry is invalid.');
    }
    return candidate.kind === 'update'
      ? {
          kind: 'update' as const,
          record: parseImmutableUpdateRecord(candidate.record, scope),
          attempts: parseAttempts(candidate.attempts),
        }
      : {
          kind: 'read' as const,
          record: parseUpdateReadRecord(candidate.record, scope),
          attempts: parseAttempts(candidate.attempts),
        };
  });
  if (outbox.length > 2_000) {
    throw new Error('Update sync outbox exceeds its bounds.');
  }
  return {
    schemaVersion: 1,
    knownUpdateIds: safeIds(value.knownUpdateIds),
    knownReadIds: safeIds(value.knownReadIds),
    outbox,
  };
};

export class KeyValueAlertRuleSyncStore {
  private readonly key: string;

  constructor(
    private readonly storage: AlertSyncKeyValueStore,
    private readonly scope: AlertSyncScope,
  ) {
    this.key = storageKey(scope, 'rules');
  }

  private async readDirect(): Promise<RuleSyncState> {
    return parseRuleState(await this.storage.getItem(this.key), this.scope);
  }

  private async change(
    update: (current: RuleSyncState) => RuleSyncState,
  ): Promise<RuleSyncState> {
    return serialize(this.storage, this.key, async () => {
      const next = update(await this.readDirect());
      await this.storage.setItem(this.key, JSON.stringify(next));
      return next;
    });
  }

  read(): Promise<RuleSyncState> {
    return serialize(this.storage, this.key, () => this.readDirect());
  }

  async stage(untrusted: AlertRuleSyncMutation): Promise<void> {
    const mutation = parseAlertRuleSyncMutation(untrusted, this.scope);
    await this.change(current => {
      const previous = current.outbox.find(
        entry => entry.mutation.ruleId === mutation.ruleId,
      );
      const nextMutation =
        previous === undefined
          ? mutation
          : parseAlertRuleSyncMutation(
              {...mutation, baseRevision: previous.mutation.baseRevision},
              this.scope,
            );
      return {
        ...current,
        outbox: [
          ...current.outbox.filter(
            entry => entry.mutation.ruleId !== mutation.ruleId,
          ),
          {mutation: nextMutation, attempts: 0},
        ],
      };
    });
  }

  async applyWinner(untrusted: RemoteAlertRuleRecord): Promise<void> {
    const winner = parseRemoteAlertRuleRecord(untrusted, this.scope);
    await this.change(current => {
      const existing = current.heads.find(head => head.ruleId === winner.ruleId);
      const head =
        existing === undefined || winner.revision >= existing.revision
          ? winner
          : existing;
      const pending = current.outbox.find(
        entry => entry.mutation.ruleId === winner.ruleId,
      );
      const acknowledged =
        pending !== undefined &&
        compareRulePrecedence(winner, pending.mutation) >= 0;
      return {
        ...current,
        heads: [
          ...current.heads.filter(candidate => candidate.ruleId !== head.ruleId),
          head,
        ],
        outbox: acknowledged
          ? current.outbox.filter(
              entry => entry.mutation.ruleId !== winner.ruleId,
            )
          : current.outbox,
      };
    });
  }

  async markFailed(mutationId: string): Promise<void> {
    await this.change(current => ({
      ...current,
      outbox: current.outbox.map(entry =>
        entry.mutation.mutationId === mutationId
          ? {...entry, attempts: entry.attempts + 1}
          : entry,
      ),
    }));
  }
}

export class KeyValueUpdateCenterSyncStore {
  private readonly key: string;

  constructor(
    private readonly storage: AlertSyncKeyValueStore,
    private readonly scope: AlertSyncScope,
  ) {
    this.key = storageKey(scope, 'updates');
  }

  private async readDirect(): Promise<UpdateSyncState> {
    return parseUpdateState(await this.storage.getItem(this.key), this.scope);
  }

  private async change(
    update: (current: UpdateSyncState) => UpdateSyncState,
  ): Promise<UpdateSyncState> {
    return serialize(this.storage, this.key, async () => {
      const next = update(await this.readDirect());
      await this.storage.setItem(this.key, JSON.stringify(next));
      return next;
    });
  }

  read(): Promise<UpdateSyncState> {
    return serialize(this.storage, this.key, () => this.readDirect());
  }

  async stageUpdate(untrusted: ImmutableUpdateRecord): Promise<void> {
    const record = parseImmutableUpdateRecord(untrusted, this.scope);
    await this.change(current => {
      if (current.knownUpdateIds.includes(record.recordId)) {
        return current;
      }
      const previous = current.outbox.find(
        entry => entry.kind === 'update' && entry.record.recordId === record.recordId,
      );
      if (
        previous?.kind === 'update' &&
        canonicalAlertSyncValue(previous.record) !==
          canonicalAlertSyncValue(record)
      ) {
        throw new Error('An update ID is bound to different immutable content.');
      }
      return previous === undefined
        ? {...current, outbox: [...current.outbox, {kind: 'update', record, attempts: 0}]}
        : current;
    });
  }

  async stageRead(untrusted: UpdateReadRecord): Promise<void> {
    const record = parseUpdateReadRecord(untrusted, this.scope);
    await this.change(current => {
      if (current.knownReadIds.includes(record.itemId)) {
        return current;
      }
      const previous = current.outbox.find(
        entry => entry.kind === 'read' && entry.record.itemId === record.itemId,
      );
      const replacement =
        previous?.kind === 'read' && previous.record.readAtMs >= record.readAtMs
          ? previous
          : {kind: 'read' as const, record, attempts: 0};
      return {
        ...current,
        outbox: [
          ...current.outbox.filter(
            entry => entry.kind !== 'read' || entry.record.itemId !== record.itemId,
          ),
          replacement,
        ],
      };
    });
  }

  async acknowledgeUpdate(recordId: string): Promise<void> {
    await this.change(current => ({
      ...current,
      knownUpdateIds: [...new Set([...current.knownUpdateIds, recordId])].slice(-5_000),
      outbox: current.outbox.filter(
        entry => entry.kind !== 'update' || entry.record.recordId !== recordId,
      ),
    }));
  }

  async acknowledgeRead(itemId: string): Promise<void> {
    await this.change(current => ({
      ...current,
      knownReadIds: [...new Set([...current.knownReadIds, itemId])].slice(-5_000),
      outbox: current.outbox.filter(
        entry => entry.kind !== 'read' || entry.record.itemId !== itemId,
      ),
    }));
  }

  async markFailed(kind: 'update' | 'read', id: string): Promise<void> {
    await this.change(current => ({
      ...current,
      outbox: current.outbox.map(entry => {
        const matches =
          entry.kind === kind &&
          (entry.kind === 'update'
            ? entry.record.recordId === id
            : entry.record.itemId === id);
        return matches ? {...entry, attempts: entry.attempts + 1} : entry;
      }),
    }));
  }
}
