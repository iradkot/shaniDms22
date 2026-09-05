import type {
  AlertRulesRepository,
  AlertRulesSnapshot,
  AppOwnedUpdateCenterRepository,
  NewUpdateCenterItem,
  UpdateCenterSnapshot,
} from '../contracts';
import type {AlertRule, AlertRuleInput} from '../domain/alertRules';
import type {UpdateCenterItem} from '../domain/updates';
import {
  compareRulePrecedence,
  createRuleMutation,
  isAlertSyncId,
  ruleRecordToDomain,
  updateItemToRecord,
  updateRecordToItem,
  type AlertSyncScope,
  type RemoteAlertRuleRecord,
  type UpdateReadRecord,
} from './model';
import {
  KeyValueAlertRuleSyncStore,
  KeyValueUpdateCenterSyncStore,
} from './keyValueSyncStores';
import type {
  AlertSyncRemoteAdapter,
  AlertSyncRetryTrigger,
} from './remoteAdapter';

export interface AlertRuleLocalReplica extends AlertRulesRepository {
  /** Replaces the local projection without creating another sync mutation. */
  replaceFromSync(rules: readonly AlertRule[]): Promise<void>;
}

export interface UpdateCenterLocalReplica
  extends AppOwnedUpdateCenterRepository {
  /** Replaces the local projection without changing immutable content. */
  replaceFromSync(items: readonly UpdateCenterItem[]): Promise<void>;
}

export interface AlertSyncClock {
  now(): number;
}

export interface AlertSyncIds {
  next(): string;
}

export interface AlertsSynchronizationResult {
  readonly remoteEnabled: boolean;
  readonly pendingCount: number;
  readonly failedOperations: number;
}

const toRuleInput = (rule: AlertRule): AlertRuleInput => ({
  name: rule.name,
  enabled: rule.enabled,
  lowerBoundMgDl: rule.lowerBoundMgDl,
  upperBoundMgDl: rule.upperBoundMgDl,
  activeFromMinute: rule.activeFromMinute,
  activeToMinute: rule.activeToMinute,
  trend: rule.trend,
});

const safeNow = (clock: AlertSyncClock): number => {
  const value = clock.now();
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Alert sync clock returned an invalid timestamp.');
  }
  return value;
};

const safeMutationId = (ids: AlertSyncIds): string => {
  const value = ids.next();
  if (!isAlertSyncId(value)) {
    throw new Error('Alert sync mutation ID is invalid.');
  }
  return value;
};

interface OfflineFirstAlertRulesOptions {
  readonly local: AlertRuleLocalReplica;
  readonly store: KeyValueAlertRuleSyncStore;
  readonly scope: AlertSyncScope;
  readonly clock: AlertSyncClock;
  readonly ids: AlertSyncIds;
  readonly remote?: AlertSyncRemoteAdapter;
}

export class OfflineFirstAlertRulesRepository
  implements AlertRulesRepository
{
  private syncTail: Promise<AlertsSynchronizationResult> | undefined;

  constructor(private readonly options: OfflineFirstAlertRulesOptions) {}

  subscribe = (listener: () => void): (() => void) =>
    this.options.local.subscribe(listener);

  getSnapshot = (): AlertRulesSnapshot => this.options.local.getSnapshot();

  private async ensureLocalReady(): Promise<readonly AlertRule[]> {
    if (this.options.local.getSnapshot().status !== 'ready') {
      await this.options.local.refresh();
    }
    const snapshot = this.options.local.getSnapshot();
    if (snapshot.status !== 'ready') {
      throw new Error('Alert rules are unavailable.');
    }
    return snapshot.rules;
  }

  private async seedUnsyncedRules(): Promise<void> {
    const [rules, state] = await Promise.all([
      this.ensureLocalReady(),
      this.options.store.read(),
    ]);
    const known = new Set([
      ...state.heads.map(head => head.ruleId),
      ...state.outbox.map(entry => entry.mutation.ruleId),
    ]);
    for (const rule of rules) {
      if (!known.has(rule.id) && isAlertSyncId(rule.id)) {
        await this.options.store.stage(
          createRuleMutation({
            scope: this.options.scope,
            ruleId: rule.id,
            baseRevision: 0,
            mutationId: safeMutationId(this.options.ids),
            changedAtMs: safeNow(this.options.clock),
            value: toRuleInput(rule),
          }),
        );
      }
    }
  }

  private async stageRule(
    ruleId: string,
    value?: AlertRuleInput,
  ): Promise<void> {
    const state = await this.options.store.read();
    const head = state.heads.find(candidate => candidate.ruleId === ruleId);
    const pending = state.outbox.find(
      candidate => candidate.mutation.ruleId === ruleId,
    );
    await this.options.store.stage(
      createRuleMutation({
        scope: this.options.scope,
        ruleId,
        baseRevision:
          pending?.mutation.baseRevision ?? head?.revision ?? 0,
        mutationId: safeMutationId(this.options.ids),
        changedAtMs: safeNow(this.options.clock),
        ...(value === undefined ? {} : {value}),
      }),
    );
  }

  private kickSync(): void {
    this.synchronize().catch(() => undefined);
  }

  async refresh(): Promise<void> {
    await this.options.local.refresh();
    await this.seedUnsyncedRules();
    await this.synchronize();
  }

  async add(input: AlertRuleInput): Promise<AlertRule> {
    const created = await this.options.local.add(input);
    await this.stageRule(created.id, toRuleInput(created));
    this.kickSync();
    return created;
  }

  async update(ruleId: string, input: AlertRuleInput): Promise<void> {
    await this.options.local.update(ruleId, input);
    const rule = (await this.ensureLocalReady()).find(
      candidate => candidate.id === ruleId,
    );
    if (rule === undefined) {
      throw new Error(`Alert rule not found after update: ${ruleId}`);
    }
    await this.stageRule(ruleId, toRuleInput(rule));
    this.kickSync();
  }

  async setEnabled(ruleId: string, enabled: boolean): Promise<void> {
    await this.options.local.setEnabled(ruleId, enabled);
    const rule = (await this.ensureLocalReady()).find(
      candidate => candidate.id === ruleId,
    );
    if (rule === undefined) {
      throw new Error(`Alert rule not found after update: ${ruleId}`);
    }
    await this.stageRule(ruleId, toRuleInput(rule));
    this.kickSync();
  }

  async delete(ruleId: string): Promise<void> {
    await this.options.local.delete(ruleId);
    await this.stageRule(ruleId);
    this.kickSync();
  }

  private async applyRemoteRules(
    records: readonly RemoteAlertRuleRecord[],
  ): Promise<void> {
    for (const record of records) {
      await this.options.store.applyWinner(record);
    }
    const current = await this.ensureLocalReady();
    const state = await this.options.store.read();
    const rules = new Map(current.map(rule => [rule.id, rule]));
    for (const head of state.heads) {
      const pending = state.outbox.find(
        entry => entry.mutation.ruleId === head.ruleId,
      );
      if (
        pending !== undefined &&
        compareRulePrecedence(pending.mutation, head) > 0
      ) {
        continue;
      }
      const previous = rules.get(head.ruleId);
      const projected = ruleRecordToDomain(
        head,
        previous?.triggeredAtMs ?? [],
      );
      if (projected === undefined) {
        rules.delete(head.ruleId);
      } else {
        rules.set(head.ruleId, projected);
      }
    }
    await this.options.local.replaceFromSync([...rules.values()]);
  }

  synchronize(): Promise<AlertsSynchronizationResult> {
    if (this.syncTail !== undefined) {
      return this.syncTail;
    }
    const run = this.synchronizeUnlocked().finally(() => {
      if (this.syncTail === run) {
        this.syncTail = undefined;
      }
    });
    this.syncTail = run;
    return run;
  }

  private async synchronizeUnlocked(): Promise<AlertsSynchronizationResult> {
    await this.seedUnsyncedRules();
    if (this.options.remote === undefined) {
      return {
        remoteEnabled: false,
        pendingCount: (await this.options.store.read()).outbox.length,
        failedOperations: 0,
      };
    }
    let failedOperations = 0;
    const pending = (await this.options.store.read()).outbox;
    for (const entry of pending) {
      try {
        const winner = await this.options.remote.commitRule(
          this.options.scope,
          entry.mutation,
        );
        await this.applyRemoteRules([winner]);
      } catch {
        failedOperations += 1;
        await this.options.store.markFailed(entry.mutation.mutationId);
      }
    }
    try {
      await this.applyRemoteRules(
        await this.options.remote.listRules(this.options.scope),
      );
    } catch {
      failedOperations += 1;
    }
    return {
      remoteEnabled: true,
      pendingCount: (await this.options.store.read()).outbox.length,
      failedOperations,
    };
  }

  activate(retryTrigger: AlertSyncRetryTrigger): () => void {
    const retry = () => this.kickSync();
    const unsubscribe = retryTrigger.subscribe(retry);
    retry();
    return unsubscribe;
  }
}

interface OfflineFirstUpdateCenterOptions {
  readonly local: UpdateCenterLocalReplica;
  readonly store: KeyValueUpdateCenterSyncStore;
  readonly scope: AlertSyncScope;
  readonly clock: AlertSyncClock;
  readonly remote?: AlertSyncRemoteAdapter;
}

export class OfflineFirstUpdateCenterRepository
  implements AppOwnedUpdateCenterRepository
{
  private syncTail: Promise<AlertsSynchronizationResult> | undefined;

  constructor(private readonly options: OfflineFirstUpdateCenterOptions) {}

  subscribe = (listener: () => void): (() => void) =>
    this.options.local.subscribe(listener);

  getSnapshot = (): UpdateCenterSnapshot => this.options.local.getSnapshot();

  private async ensureLocalReady(): Promise<readonly UpdateCenterItem[]> {
    if (this.options.local.getSnapshot().status !== 'ready') {
      await this.options.local.refresh();
    }
    const snapshot = this.options.local.getSnapshot();
    if (snapshot.status !== 'ready') {
      throw new Error('Update Center is unavailable.');
    }
    return snapshot.items;
  }

  private syncable(item: UpdateCenterItem): boolean {
    return (
      item.readState !== 'unknown' &&
      item.content.kind !== 'alert-rule-trigger' &&
      isAlertSyncId(item.id)
    );
  }

  private async seedUnsyncedItems(): Promise<void> {
    const items = await this.ensureLocalReady();
    for (const item of items) {
      if (!this.syncable(item)) {
        continue;
      }
      await this.options.store.stageUpdate(
        updateItemToRecord(this.options.scope, item),
      );
      if (item.readState === 'read') {
        await this.options.store.stageRead(this.readRecord(item.id));
      }
    }
  }

  private readRecord(itemId: string): UpdateReadRecord {
    return {
      schemaVersion: 1,
      documentKind: 'update_center_read',
      ownerProductUserId: this.options.scope.ownerProductUserId,
      workspaceId: this.options.scope.workspaceId,
      itemId,
      readAtMs: safeNow(this.options.clock),
    };
  }

  private kickSync(): void {
    this.synchronize().catch(() => undefined);
  }

  async refresh(): Promise<void> {
    await this.options.local.refresh();
    await this.seedUnsyncedItems();
    await this.synchronize();
  }

  async append(item: NewUpdateCenterItem): Promise<UpdateCenterItem> {
    const created = await this.options.local.append(item);
    if (this.syncable(created)) {
      await this.options.store.stageUpdate(
        updateItemToRecord(this.options.scope, created),
      );
      this.kickSync();
    }
    return created;
  }

  async markRead(itemId: string): Promise<void> {
    await this.options.local.markRead(itemId);
    if (isAlertSyncId(itemId)) {
      await this.options.store.stageRead(this.readRecord(itemId));
      this.kickSync();
    }
  }

  synchronize(): Promise<AlertsSynchronizationResult> {
    if (this.syncTail !== undefined) {
      return this.syncTail;
    }
    const run = this.synchronizeUnlocked().finally(() => {
      if (this.syncTail === run) {
        this.syncTail = undefined;
      }
    });
    this.syncTail = run;
    return run;
  }

  private async synchronizeUnlocked(): Promise<AlertsSynchronizationResult> {
    await this.seedUnsyncedItems();
    if (this.options.remote === undefined) {
      return {
        remoteEnabled: false,
        pendingCount: (await this.options.store.read()).outbox.length,
        failedOperations: 0,
      };
    }
    let failedOperations = 0;
    const pending = (await this.options.store.read()).outbox;
    for (const entry of pending) {
      try {
        if (entry.kind === 'update') {
          await this.options.remote.putUpdate(
            this.options.scope,
            entry.record,
          );
          await this.options.store.acknowledgeUpdate(entry.record.recordId);
        } else {
          await this.options.remote.markRead(
            this.options.scope,
            entry.record,
          );
          await this.options.store.acknowledgeRead(entry.record.itemId);
        }
      } catch {
        failedOperations += 1;
        await this.options.store.markFailed(
          entry.kind,
          entry.kind === 'update'
            ? entry.record.recordId
            : entry.record.itemId,
        );
      }
    }

    try {
      const [records, readRecords] = await Promise.all([
        this.options.remote.listUpdates(this.options.scope),
        this.options.remote.listReadState(this.options.scope),
      ]);
      const readIds = new Set(readRecords.map(record => record.itemId));
      const state = await this.options.store.read();
      const pendingUpdateIds = new Set(
        state.outbox.flatMap(entry =>
          entry.kind === 'update' ? [entry.record.recordId] : [],
        ),
      );
      const items = new Map(
        (await this.ensureLocalReady()).map(item => [item.id, item]),
      );
      for (const record of records) {
        if (!pendingUpdateIds.has(record.recordId)) {
          items.set(
            record.recordId,
            updateRecordToItem(record, readIds.has(record.recordId)),
          );
        }
        await this.options.store.acknowledgeUpdate(record.recordId);
      }
      for (const read of readRecords) {
        const current = items.get(read.itemId);
        if (current !== undefined) {
          items.set(read.itemId, {...current, readState: 'read'});
        }
        await this.options.store.acknowledgeRead(read.itemId);
      }
      await this.options.local.replaceFromSync(
        [...items.values()].sort(
          (left, right) => right.occurredAtMs - left.occurredAtMs,
        ),
      );
    } catch {
      failedOperations += 1;
    }

    return {
      remoteEnabled: true,
      pendingCount: (await this.options.store.read()).outbox.length,
      failedOperations,
    };
  }

  activate(retryTrigger: AlertSyncRetryTrigger): () => void {
    const retry = () => this.kickSync();
    const unsubscribe = retryTrigger.subscribe(retry);
    retry();
    return unsubscribe;
  }
}
