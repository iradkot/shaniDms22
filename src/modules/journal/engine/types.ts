import type {
  ActivitiesWorkspace,
  ActivityExternalCandidate,
  FindActivityLinkCandidatesInput,
} from '../contracts/activitiesWorkspace';
import type {
  FindMealLinkCandidatesInput,
  MealExternalCandidate,
  MealsWorkspace,
} from '../contracts/mealsWorkspace';
import type {JournalResult} from '../contracts/result';
import type {
  ActivityEntryId,
  JournalConflictId,
  MealEntryId,
  Revision,
} from '../domain/identifiers';
import type {
  ActivitySnapshot,
  CaptureActivityInput,
} from '../domain/activities';
import type {JournalWorkspaceScope} from '../domain/journal';
import type {
  ReadLinkedExternalRecordInput,
  ReadLinkedExternalRecordResult,
} from '../domain/externalRecords';
import type {
  CaptureMealInput,
  MealImageSnapshot,
  MealSnapshot,
} from '../domain/meals';
import type {
  ActivityConflictDetectedValues,
  ActivityConflictProposal,
  MealConflictDetectedValues,
  MealConflictProposal,
} from '../domain/conflicts';
import type {JournalTombstone} from '../domain/tombstones';
import type {JournalMaintenance} from '../contracts/maintenance';
import type {JournalRemoteAdapter, JournalSyncController} from '../sync';

export const JOURNAL_STATE_SCHEMA_VERSION = 1 as const;
export const JOURNAL_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type JournalEntityKind = 'meal' | 'activity';
export type JournalEntityId = MealEntryId | ActivityEntryId;
export type JournalEntitySnapshot = MealSnapshot | ActivitySnapshot;

/**
 * One durable, causally ordered local operation. The remote Adapter reads an
 * upsert from the current entity and a purge from its tombstone, so the queue
 * does not duplicate image metadata or medical content.
 */
interface JournalOutboxOperationBase {
  readonly operationId: string;
  readonly entityKind: JournalEntityKind;
  readonly entityId: JournalEntityId;
  readonly localRevision: Revision;
  readonly queuedAt: number;
}

export interface JournalUpsertOutboxOperation
  extends JournalOutboxOperationBase {
  readonly kind: 'upsert';
  readonly baseRevision: Revision | null;
  readonly changedFields: readonly string[];
}

export interface JournalPurgeOutboxOperation
  extends JournalOutboxOperationBase {
  readonly kind: 'purge';
  /** Null when the entry was created and purged before its first upload. */
  readonly baseRevision: Revision | null;
  readonly changedFields: readonly ['purge'];
}

export type JournalOutboxOperation =
  | JournalUpsertOutboxOperation
  | JournalPurgeOutboxOperation;

interface JournalFieldConflictRecordBase {
  readonly conflictId: JournalConflictId;
  readonly detectedAt: number;
  readonly expectedRevision: Revision;
  readonly detectedAgainstRevision: Revision;
  readonly conflictingFields: readonly string[];
}

export type JournalFieldConflictRecord =
  | (JournalFieldConflictRecordBase & {
      readonly entityKind: 'meal';
      readonly proposal: MealConflictProposal;
      readonly detectedValues: MealConflictDetectedValues;
    })
  | (JournalFieldConflictRecordBase & {
      readonly entityKind: 'activity';
      readonly proposal: ActivityConflictProposal;
      readonly detectedValues: ActivityConflictDetectedValues;
    });

export interface JournalRevisionRecord {
  readonly revision: Revision;
  readonly changedAt: number;
  readonly changedFields: readonly string[];
}

export interface JournalEntityMetadata {
  readonly entityKind: JournalEntityKind;
  readonly entityId: JournalEntityId;
  readonly fieldRevisions: Readonly<Record<string, Revision>>;
  readonly recentRevisions: readonly JournalRevisionRecord[];
  readonly conflicts: readonly JournalFieldConflictRecord[];
}

/** The entire value is committed as one local transaction with its outbox. */
export interface PersistedJournalState {
  readonly schemaVersion: typeof JOURNAL_STATE_SCHEMA_VERSION;
  readonly scope: JournalWorkspaceScope;
  readonly meals: readonly MealSnapshot[];
  readonly activities: readonly ActivitySnapshot[];
  readonly tombstones: readonly JournalTombstone[];
  /** Pull-applied deletion markers do not create a local outbox operation. */
  readonly remoteTombstones: readonly JournalTombstone[];
  readonly outbox: readonly JournalOutboxOperation[];
  readonly metadata: readonly JournalEntityMetadata[];
  readonly remoteCursor?: string;
}

/**
 * Local-substitutable persistence Seam. `read` is deliberately untrusted:
 * every production Adapter crosses a JSON/storage boundary.
 */
export interface JournalLocalStore {
  read(scope: JournalWorkspaceScope): Promise<JournalLocalRead>;
  commit(
    scope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult>;
}

export interface JournalLocalRead {
  readonly generation: number;
  readonly value: unknown | null;
}

export type JournalLocalCommitResult =
  | {readonly ok: true; readonly generation: number}
  | {readonly ok: false; readonly actualGeneration: number};

export interface JournalClock {
  now(): number;
}

export interface JournalIdGenerator {
  nextEntryId(kind: JournalEntityKind): string;
  nextOperationId(): string;
}

/**
 * Stages picker-owned media into durable app-owned storage before a meal write
 * is accepted. LLM access is intentionally absent from this Seam.
 */
export interface JournalMediaStore {
  stageMealImage(
    scope: JournalWorkspaceScope,
    mealId: MealEntryId,
    input: NonNullable<CaptureMealInput['image']>,
  ): Promise<MealImageSnapshot>;
  removeMealImage(
    scope: JournalWorkspaceScope,
    mealId: MealEntryId,
    image: MealImageSnapshot,
  ): Promise<void>;
  /**
   * Optional remote preparation Seam. A durable local image remains usable
   * when this returns a retryable failure; Journal sync retries it later.
   */
  prepareMealImageForRemote?(
    scope: JournalWorkspaceScope,
    mealId: MealEntryId,
    image: MealImageSnapshot,
  ): Promise<JournalMealImageRemotePreparationResult>;
}

export type JournalMealImageRemotePreparationResult =
  | {readonly ok: true; readonly value: MealImageSnapshot}
  | {
      readonly ok: false;
      readonly error: {readonly message: string; readonly retryable: boolean};
    };

/** Read-only Nightscout/external record Seam. No write can be represented. */
export interface JournalExternalRecordReader {
  findMealCandidates(
    scope: JournalWorkspaceScope,
    input: FindMealLinkCandidatesInput,
  ): Promise<JournalResult<readonly MealExternalCandidate[]>>;
  findActivityCandidates(
    scope: JournalWorkspaceScope,
    input: FindActivityLinkCandidatesInput,
  ): Promise<JournalResult<readonly ActivityExternalCandidate[]>>;
  readLinkedRecord(
    scope: JournalWorkspaceScope,
    input: ReadLinkedExternalRecordInput,
  ): Promise<JournalResult<ReadLinkedExternalRecordResult>>;
}

export interface JournalEngineDependencies {
  readonly localStore: JournalLocalStore;
  readonly clock: JournalClock;
  readonly ids: JournalIdGenerator;
  readonly mediaStore: JournalMediaStore;
  readonly externalRecords?: JournalExternalRecordReader;
  readonly remoteAdapter?: JournalRemoteAdapter;
}

export interface JournalOutboxView {
  getSnapshot(): readonly JournalOutboxOperation[];
  subscribe(listener: () => void): () => void;
}

export interface JournalWorkspace {
  readonly scope: JournalWorkspaceScope;
  readonly meals: MealsWorkspace;
  readonly activities: ActivitiesWorkspace;
  readonly maintenance: JournalMaintenance;
  readonly outbox: JournalOutboxView;
  readonly sync: JournalSyncController;
}

export interface JournalEngine {
  open(scope: JournalWorkspaceScope): Promise<JournalResult<JournalWorkspace>>;
}

export interface JournalMutationRecord<
  TSnapshot extends JournalEntitySnapshot,
> {
  readonly snapshot: TSnapshot;
  readonly changedFields: readonly string[];
}

export type NewEntityInput = CaptureMealInput | CaptureActivityInput;
