import {
  assertAlertSyncScope,
  canonicalAlertSyncValue,
  compareRulePrecedence,
  parseAlertRuleSyncMutation,
  parseImmutableUpdateRecord,
  parseRemoteAlertRuleRecord,
  parseUpdateReadRecord,
  toRemoteRuleRecord,
  type AlertSyncScope,
  type RemoteAlertRuleRecord,
} from './model';
import type {AlertSyncRemoteAdapter} from './remoteAdapter';

export type AlertFirestoreDocumentSnapshot =
  | {readonly exists: false}
  | {readonly exists: true; readonly data: unknown};

export interface AlertFirestoreListedDocument {
  readonly id: string;
  readonly data: unknown;
}

export interface AlertFirestoreTransaction {
  get(documentPath: string): Promise<AlertFirestoreDocumentSnapshot>;
  set(documentPath: string, value: Readonly<Record<string, unknown>>): void;
}

export interface AlertFirestoreGateway {
  get(documentPath: string): Promise<AlertFirestoreDocumentSnapshot>;
  list(collectionPath: string): Promise<readonly AlertFirestoreListedDocument[]>;
  runTransaction<T>(
    operation: (transaction: AlertFirestoreTransaction) => Promise<T>,
  ): Promise<T>;
}

const pathId = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} cannot be used in a Firestore path.`);
  }
  return value;
};

const workspaceRoot = (scope: AlertSyncScope): string => {
  const normalized = assertAlertSyncScope(scope);
  return `users/${pathId(
    normalized.ownerProductUserId,
    'Product User ID',
  )}/workspaces/${pathId(normalized.workspaceId, 'Workspace ID')}`;
};

export const alertRuleFirestorePath = (
  scope: AlertSyncScope,
  ruleId: string,
): string => `${workspaceRoot(scope)}/alertRules/${pathId(ruleId, 'Rule ID')}`;

export const updateCenterRecordFirestorePath = (
  scope: AlertSyncScope,
  recordId: string,
): string =>
  `${workspaceRoot(scope)}/updateCenterRecords/${pathId(
    recordId,
    'Update record ID',
  )}`;

export const updateCenterReadFirestorePath = (
  scope: AlertSyncScope,
  itemId: string,
): string =>
  `${workspaceRoot(scope)}/updateCenterReadState/${pathId(
    itemId,
    'Update item ID',
  )}`;

const sameRuleMutation = (
  current: RemoteAlertRuleRecord,
  incoming: ReturnType<typeof parseAlertRuleSyncMutation>,
): boolean =>
  canonicalAlertSyncValue(current) ===
  canonicalAlertSyncValue(toRemoteRuleRecord(incoming, current.revision));

const sameImmutableRecord = (left: unknown, right: unknown): boolean =>
  canonicalAlertSyncValue(left) === canonicalAlertSyncValue(right);

/**
 * Firestore owns revision assignment. Concurrent rule edits use deterministic
 * last-write-wins by changedAtMs and then opaque mutationId.
 */
export const createFirestoreAlertsRemoteAdapter = (
  gateway: AlertFirestoreGateway,
): AlertSyncRemoteAdapter => ({
  async commitRule(scope, untrustedMutation) {
    const mutation = parseAlertRuleSyncMutation(untrustedMutation, scope);
    const path = alertRuleFirestorePath(scope, mutation.ruleId);
    return gateway.runTransaction(async transaction => {
      const existing = await transaction.get(path);
      if (!existing.exists) {
        if (mutation.baseRevision !== 0) {
          throw new Error('Alert rule base revision does not exist.');
        }
        const created = toRemoteRuleRecord(mutation, 1);
        transaction.set(path, {...created});
        return created;
      }
      const current = parseRemoteAlertRuleRecord(existing.data, scope);
      if (current.ruleId !== mutation.ruleId) {
        throw new Error('Alert rule document ID does not match its content.');
      }
      if (mutation.baseRevision > current.revision) {
        throw new Error('Alert rule base revision is ahead of the server.');
      }
      if (current.mutationId === mutation.mutationId) {
        if (!sameRuleMutation(current, mutation)) {
          throw new Error('Alert rule mutation ID has conflicting content.');
        }
        return current;
      }
      if (compareRulePrecedence(mutation, current) <= 0) {
        return current;
      }
      const replacement = toRemoteRuleRecord(mutation, current.revision + 1);
      transaction.set(path, {...replacement});
      return replacement;
    });
  },

  async listRules(scope) {
    const records = await gateway.list(`${workspaceRoot(scope)}/alertRules`);
    return records.map(record => {
      const value = parseRemoteAlertRuleRecord(record.data, scope);
      if (value.ruleId !== record.id) {
        throw new Error('Alert rule document ID does not match its content.');
      }
      return value;
    });
  },

  async putUpdate(scope, untrustedRecord) {
    const record = parseImmutableUpdateRecord(untrustedRecord, scope);
    const path = updateCenterRecordFirestorePath(scope, record.recordId);
    await gateway.runTransaction(async transaction => {
      const existing = await transaction.get(path);
      if (!existing.exists) {
        transaction.set(path, {...record});
        return;
      }
      const current = parseImmutableUpdateRecord(existing.data, scope);
      if (!sameImmutableRecord(current, record)) {
        throw new Error('Update record ID has conflicting immutable content.');
      }
    });
  },

  async listUpdates(scope) {
    const records = await gateway.list(
      `${workspaceRoot(scope)}/updateCenterRecords`,
    );
    return records.map(record => {
      const value = parseImmutableUpdateRecord(record.data, scope);
      if (value.recordId !== record.id) {
        throw new Error('Update document ID does not match its content.');
      }
      return value;
    });
  },

  async markRead(scope, untrustedRecord) {
    const record = parseUpdateReadRecord(untrustedRecord, scope);
    const path = updateCenterReadFirestorePath(scope, record.itemId);
    await gateway.runTransaction(async transaction => {
      const existing = await transaction.get(path);
      if (!existing.exists) {
        transaction.set(path, {...record});
        return;
      }
      const current = parseUpdateReadRecord(existing.data, scope);
      if (record.readAtMs > current.readAtMs) {
        transaction.set(path, {...record});
      }
    });
  },

  async listReadState(scope) {
    const records = await gateway.list(
      `${workspaceRoot(scope)}/updateCenterReadState`,
    );
    return records.map(record => {
      const value = parseUpdateReadRecord(record.data, scope);
      if (value.itemId !== record.id) {
        throw new Error('Update read document ID does not match its content.');
      }
      return value;
    });
  },
});
