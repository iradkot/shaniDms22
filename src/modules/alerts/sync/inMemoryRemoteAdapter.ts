import {
  canonicalAlertSyncValue,
  compareRulePrecedence,
  parseAlertRuleSyncMutation,
  parseImmutableUpdateRecord,
  parseRemoteAlertRuleRecord,
  parseUpdateReadRecord,
  toRemoteRuleRecord,
  type AlertSyncScope,
  type ImmutableUpdateRecord,
  type RemoteAlertRuleRecord,
  type UpdateReadRecord,
} from './model';
import type {AlertSyncRemoteAdapter} from './remoteAdapter';

const scopeKey = (scope: AlertSyncScope): string =>
  `${scope.ownerProductUserId}:${scope.workspaceId}`;

export class InMemoryAlertSyncRemoteAdapter
  implements AlertSyncRemoteAdapter
{
  private readonly rules = new Map<string, Map<string, RemoteAlertRuleRecord>>();
  private readonly updates = new Map<string, Map<string, ImmutableUpdateRecord>>();
  private readonly reads = new Map<string, Map<string, UpdateReadRecord>>();

  private bucket<T>(
    collection: Map<string, Map<string, T>>,
    scope: AlertSyncScope,
  ): Map<string, T> {
    const key = scopeKey(scope);
    let bucket = collection.get(key);
    if (bucket === undefined) {
      bucket = new Map();
      collection.set(key, bucket);
    }
    return bucket;
  }

  async commitRule(scope: AlertSyncScope, untrusted: unknown) {
    const mutation = parseAlertRuleSyncMutation(untrusted, scope);
    const rules = this.bucket(this.rules, scope);
    const current = rules.get(mutation.ruleId);
    if (current === undefined) {
      if (mutation.baseRevision !== 0) {
        throw new Error('Alert rule base revision does not exist.');
      }
      const created = toRemoteRuleRecord(mutation, 1);
      rules.set(mutation.ruleId, created);
      return created;
    }
    if (current.mutationId === mutation.mutationId) {
      const candidate = toRemoteRuleRecord(mutation, current.revision);
      if (
        canonicalAlertSyncValue(candidate) !==
        canonicalAlertSyncValue(current)
      ) {
        throw new Error('Alert rule mutation ID has conflicting content.');
      }
      return current;
    }
    if (compareRulePrecedence(mutation, current) <= 0) {
      return current;
    }
    const replacement = toRemoteRuleRecord(mutation, current.revision + 1);
    rules.set(mutation.ruleId, replacement);
    return replacement;
  }

  async listRules(scope: AlertSyncScope) {
    return [...this.bucket(this.rules, scope).values()].map(record =>
      parseRemoteAlertRuleRecord(record, scope),
    );
  }

  async putUpdate(scope: AlertSyncScope, untrusted: unknown): Promise<void> {
    const record = parseImmutableUpdateRecord(untrusted, scope);
    const updates = this.bucket(this.updates, scope);
    const current = updates.get(record.recordId);
    if (
      current !== undefined &&
      canonicalAlertSyncValue(current) !== canonicalAlertSyncValue(record)
    ) {
      throw new Error('Update record ID has conflicting immutable content.');
    }
    updates.set(record.recordId, record);
  }

  async listUpdates(scope: AlertSyncScope) {
    return [...this.bucket(this.updates, scope).values()].map(record =>
      parseImmutableUpdateRecord(record, scope),
    );
  }

  async markRead(scope: AlertSyncScope, untrusted: unknown): Promise<void> {
    const record = parseUpdateReadRecord(untrusted, scope);
    const reads = this.bucket(this.reads, scope);
    const current = reads.get(record.itemId);
    if (current === undefined || record.readAtMs > current.readAtMs) {
      reads.set(record.itemId, record);
    }
  }

  async listReadState(scope: AlertSyncScope) {
    return [...this.bucket(this.reads, scope).values()].map(record =>
      parseUpdateReadRecord(record, scope),
    );
  }
}
