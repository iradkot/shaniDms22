import {
  ExternalActivityRecordSnapshot,
  ExternalActivityRole,
  ExternalRecordReference,
  ExternalTreatmentRecordSnapshot,
  SupportingTreatmentRole,
} from '../domain/externalRecords';
import type {ActivityExternalEventLink} from '../domain/activities';
import {ActivityEntryId, Revision} from '../domain/identifiers';
import type {
  ActivityConflictInspection,
  JournalConflictDecision,
} from '../domain/conflicts';
import type {JournalConflictId} from '../domain/identifiers';
import {
  JournalLiveObservation,
  JournalListQuery,
  JournalPage,
  JournalWorkspaceScope,
} from '../domain/journal';
import {
  ActivitySnapshot,
  CaptureActivityInput,
  FinishActivityInput,
  ReviseActivityInput,
} from '../domain/activities';
import {JournalResult} from './result';

export type ActivityExternalCandidate =
  | {
      readonly kind: 'activity';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalActivityRecordSnapshot;
      readonly reason: string;
    }
  | {
      readonly kind: 'treatment';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly reason: string;
    };

export interface FindActivityLinkCandidatesInput {
  readonly nearStartedAt: number;
  readonly beforeMs?: number;
  readonly afterMs?: number;
}

export type LinkActivityExternalEventInput =
  | {
      readonly activityId: ActivityEntryId;
      readonly expectedRevision: Revision;
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalActivityRecordSnapshot;
      readonly role: ExternalActivityRole;
    }
  | {
      readonly activityId: ActivityEntryId;
      readonly expectedRevision: Revision;
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly role: SupportingTreatmentRole;
    };

export interface UnlinkActivityExternalEventInput {
  readonly activityId: ActivityEntryId;
  readonly expectedRevision: Revision;
  readonly record: ExternalRecordReference;
}

export interface RefreshActivityExternalEventInput {
  readonly activityId: ActivityEntryId;
  readonly expectedRevision: Revision;
  readonly record: ExternalRecordReference;
}

export type TransferActivityExternalEventInput =
  LinkActivityExternalEventInput & {
    readonly sourceActivityId: ActivityEntryId;
    readonly sourceExpectedRevision: Revision;
    readonly confirmed: true;
  };

export interface ActivityExternalTransferUndoReceipt {
  readonly kind: 'activity_external_transfer';
  readonly sourceActivityId: ActivityEntryId;
  readonly destinationActivityId: ActivityEntryId;
  readonly sourceRevisionAfterTransfer: Revision;
  readonly destinationRevisionAfterTransfer: Revision;
  readonly previousSourceLink: ActivityExternalEventLink;
}

export interface ActivityExternalEventTransfer {
  readonly source: ActivitySnapshot;
  readonly destination: ActivitySnapshot;
  readonly undo: ActivityExternalTransferUndoReceipt;
}

export interface ActivityExternalTransferUndoResult {
  readonly source: ActivitySnapshot;
  readonly destination: ActivitySnapshot;
}

export interface ActivityRevisionTarget {
  readonly activityId: ActivityEntryId;
  readonly expectedRevision: Revision;
}

export interface ResolveActivityConflictInput {
  readonly activityId: ActivityEntryId;
  readonly conflictId: JournalConflictId;
  readonly expectedRevision: Revision;
  readonly decision: JournalConflictDecision;
}

export interface ResolveOngoingActivitiesInput {
  readonly keepOngoing: ActivityEntryId;
  readonly finish: readonly {
    readonly activityId: ActivityEntryId;
    readonly expectedRevision: Revision;
    readonly endedAt: number;
  }[];
}

/**
 * Task-shaped Interface for one Product User and Workspace.
 * Starting offline never silently finishes or deletes another activity.
 */
export interface ActivitiesWorkspace
  extends JournalLiveObservation<ActivityEntryId, ActivitySnapshot> {
  readonly scope: JournalWorkspaceScope;

  capture(
    input: CaptureActivityInput,
  ): Promise<JournalResult<ActivitySnapshot>>;
  revise(input: ReviseActivityInput): Promise<JournalResult<ActivitySnapshot>>;
  finish(input: FinishActivityInput): Promise<JournalResult<ActivitySnapshot>>;
  get(activityId: ActivityEntryId): Promise<JournalResult<ActivitySnapshot>>;
  list(
    query?: JournalListQuery,
  ): Promise<JournalResult<JournalPage<ActivitySnapshot>>>;
  findLinkCandidates(
    input: FindActivityLinkCandidatesInput,
  ): Promise<JournalResult<readonly ActivityExternalCandidate[]>>;
  linkExternalEvent(
    input: LinkActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>>;
  unlinkExternalEvent(
    input: UnlinkActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>>;
  refreshExternalEvent(
    input: RefreshActivityExternalEventInput,
  ): Promise<JournalResult<ActivitySnapshot>>;
  transferExternalEvent(
    input: TransferActivityExternalEventInput,
  ): Promise<JournalResult<ActivityExternalEventTransfer>>;
  undoExternalEventTransfer(
    receipt: ActivityExternalTransferUndoReceipt,
  ): Promise<JournalResult<ActivityExternalTransferUndoResult>>;
  inspectConflicts(
    activityId: ActivityEntryId,
  ): Promise<JournalResult<readonly ActivityConflictInspection[]>>;
  resolveConflict(
    input: ResolveActivityConflictInput,
  ): Promise<JournalResult<ActivitySnapshot>>;
  resolveOngoingActivities(
    input: ResolveOngoingActivitiesInput,
  ): Promise<JournalResult<readonly ActivitySnapshot[]>>;
  trash(
    input: ActivityRevisionTarget,
  ): Promise<JournalResult<ActivitySnapshot>>;
  restore(
    input: ActivityRevisionTarget,
  ): Promise<JournalResult<ActivitySnapshot>>;
}
