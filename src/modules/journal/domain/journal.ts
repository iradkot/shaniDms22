import {
  ActivityEntryId,
  MealEntryId,
  NightscoutSourceId,
  ProductUserId,
  Revision,
  WorkspaceId,
} from './identifiers';

export interface JournalWorkspaceScope {
  readonly productUserId: ProductUserId;
  readonly workspaceId: WorkspaceId;
  readonly nightscoutSourceId: NightscoutSourceId;
}

export const JOURNAL_SYNC_FAILURE_CODES = {
  NETWORK: 'journal.sync.network',
  PERMISSION: 'journal.sync.permission',
  STORAGE: 'journal.sync.storage',
  REMOTE_REJECTED: 'journal.sync.remote_rejected',
  UNKNOWN: 'journal.sync.unknown',
} as const;

export type JournalSyncFailureCode =
  (typeof JOURNAL_SYNC_FAILURE_CODES)[keyof typeof JOURNAL_SYNC_FAILURE_CODES];

export type JournalSyncState =
  | {readonly kind: 'local_only'}
  | {
      readonly kind: 'pending';
      readonly queuedAt: number;
      readonly operationCount: number;
    }
  | {readonly kind: 'syncing'; readonly startedAt: number}
  | {
      readonly kind: 'synced';
      readonly syncedAt: number;
      readonly syncedRevision: Revision;
    }
  | {
      readonly kind: 'failed';
      readonly failedAt: number;
      readonly code: JournalSyncFailureCode;
      readonly retryable: boolean;
      readonly message: string;
    }
  | {
      readonly kind: 'conflict';
      readonly detectedAt: number;
      readonly conflictingFields: readonly string[];
    };

export type JournalLifecycleState =
  | {readonly kind: 'active'}
  | {
      readonly kind: 'trashed';
      readonly trashedAt: number;
      readonly purgeAfter: number;
    };

export interface JournalSnapshotBase<
  TKind extends 'meal' | 'activity',
  TId extends MealEntryId | ActivityEntryId,
> {
  readonly kind: TKind;
  readonly id: TId;
  readonly scope: JournalWorkspaceScope;
  readonly revision: Revision;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lifecycle: JournalLifecycleState;
  readonly syncState: JournalSyncState;
}

export type FieldChange<T> =
  | {readonly kind: 'set'; readonly value: T}
  | {readonly kind: 'clear'};

export interface JournalTimeRange {
  readonly fromInclusive: number;
  readonly toExclusive: number;
}

export interface JournalListQuery {
  readonly timeRange?: JournalTimeRange;
  readonly includeTrashed?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface JournalPage<TSnapshot> {
  readonly items: readonly TSnapshot[];
  readonly nextCursor?: string;
}

export type JournalStoreListener = () => void;
export type JournalUnsubscribe = () => void;

/**
 * Synchronous local observation seam suitable for useSyncExternalStore.
 * Snapshot references must stay stable until subscribers are notified.
 */
export interface JournalLiveObservation<TId, TSnapshot> {
  readonly getSnapshot: (id: TId) => TSnapshot | undefined;
  readonly getListSnapshot: (
    query?: JournalListQuery,
  ) => JournalPage<TSnapshot>;
  readonly subscribe: (listener: JournalStoreListener) => JournalUnsubscribe;
}

export interface ExpectedRevision {
  readonly expectedRevision: Revision;
}
