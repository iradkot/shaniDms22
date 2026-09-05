import type {
  AlertRuleSyncMutation,
  AlertSyncScope,
  ImmutableUpdateRecord,
  RemoteAlertRuleRecord,
  UpdateReadRecord,
} from './model';

export interface AlertSyncRemoteAdapter {
  commitRule(
    scope: AlertSyncScope,
    mutation: AlertRuleSyncMutation,
  ): Promise<RemoteAlertRuleRecord>;
  listRules(scope: AlertSyncScope): Promise<readonly RemoteAlertRuleRecord[]>;
  putUpdate(
    scope: AlertSyncScope,
    record: ImmutableUpdateRecord,
  ): Promise<void>;
  listUpdates(scope: AlertSyncScope): Promise<readonly ImmutableUpdateRecord[]>;
  markRead(scope: AlertSyncScope, record: UpdateReadRecord): Promise<void>;
  listReadState(scope: AlertSyncScope): Promise<readonly UpdateReadRecord[]>;
}

export interface AlertSyncRetryTrigger {
  subscribe(listener: () => void): () => void;
}
