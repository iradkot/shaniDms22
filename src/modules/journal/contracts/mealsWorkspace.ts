import {
  ExternalCarbRecordSnapshot,
  ExternalRecordReference,
  ExternalTreatmentRecordSnapshot,
  ReportedCarbohydrateRole,
  SupportingTreatmentRole,
} from '../domain/externalRecords';
import type {MealExternalEventLink} from '../domain/meals';
import {MealEntryId, Revision} from '../domain/identifiers';
import type {
  JournalConflictDecision,
  MealConflictInspection,
} from '../domain/conflicts';
import type {JournalConflictId} from '../domain/identifiers';
import {
  JournalLiveObservation,
  JournalListQuery,
  JournalPage,
  JournalWorkspaceScope,
} from '../domain/journal';
import {CaptureMealInput, MealSnapshot, ReviseMealInput} from '../domain/meals';
import {JournalResult} from './result';

export type MealExternalCandidate =
  | {
      readonly kind: 'carbohydrate';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalCarbRecordSnapshot;
      readonly reason: string;
    }
  | {
      readonly kind: 'treatment';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly reason: string;
    };

export interface FindMealLinkCandidatesInput {
  readonly nearMealStart: number;
  readonly beforeMs?: number;
  readonly afterMs?: number;
}

export type LinkMealExternalEventInput =
  | {
      readonly mealId: MealEntryId;
      readonly expectedRevision: Revision;
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalCarbRecordSnapshot;
      readonly role: ReportedCarbohydrateRole;
    }
  | {
      readonly mealId: MealEntryId;
      readonly expectedRevision: Revision;
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly role: SupportingTreatmentRole;
    };

export interface UnlinkMealExternalEventInput {
  readonly mealId: MealEntryId;
  readonly expectedRevision: Revision;
  readonly record: ExternalRecordReference;
}

export interface RefreshMealExternalEventInput {
  readonly mealId: MealEntryId;
  readonly expectedRevision: Revision;
  readonly record: ExternalRecordReference;
}

export type TransferMealExternalEventInput = LinkMealExternalEventInput & {
  readonly sourceMealId: MealEntryId;
  readonly sourceExpectedRevision: Revision;
  readonly confirmed: true;
};

export interface MealExternalTransferUndoReceipt {
  readonly kind: 'meal_external_transfer';
  readonly sourceMealId: MealEntryId;
  readonly destinationMealId: MealEntryId;
  readonly sourceRevisionAfterTransfer: Revision;
  readonly destinationRevisionAfterTransfer: Revision;
  readonly previousSourceLink: MealExternalEventLink;
}

export interface MealExternalEventTransfer {
  readonly source: MealSnapshot;
  readonly destination: MealSnapshot;
  readonly undo: MealExternalTransferUndoReceipt;
}

export interface MealExternalTransferUndoResult {
  /** The former destination from which the transferred link was removed. */
  readonly source: MealSnapshot;
  /** The original owner to which its exact prior link was restored. */
  readonly destination: MealSnapshot;
}

export interface MealRevisionTarget {
  readonly mealId: MealEntryId;
  readonly expectedRevision: Revision;
}

export interface ResolveMealConflictInput {
  readonly mealId: MealEntryId;
  readonly conflictId: JournalConflictId;
  readonly expectedRevision: Revision;
  readonly decision: JournalConflictDecision;
}

/**
 * Task-shaped Interface for one Product User and Workspace.
 * Implementations must persist accepted writes locally before resolving them.
 */
export interface MealsWorkspace
  extends JournalLiveObservation<MealEntryId, MealSnapshot> {
  readonly scope: JournalWorkspaceScope;

  capture(input: CaptureMealInput): Promise<JournalResult<MealSnapshot>>;
  revise(input: ReviseMealInput): Promise<JournalResult<MealSnapshot>>;
  get(mealId: MealEntryId): Promise<JournalResult<MealSnapshot>>;
  list(
    query?: JournalListQuery,
  ): Promise<JournalResult<JournalPage<MealSnapshot>>>;
  findLinkCandidates(
    input: FindMealLinkCandidatesInput,
  ): Promise<JournalResult<readonly MealExternalCandidate[]>>;
  linkExternalEvent(
    input: LinkMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>>;
  unlinkExternalEvent(
    input: UnlinkMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>>;
  refreshExternalEvent(
    input: RefreshMealExternalEventInput,
  ): Promise<JournalResult<MealSnapshot>>;
  transferExternalEvent(
    input: TransferMealExternalEventInput,
  ): Promise<JournalResult<MealExternalEventTransfer>>;
  undoExternalEventTransfer(
    receipt: MealExternalTransferUndoReceipt,
  ): Promise<JournalResult<MealExternalTransferUndoResult>>;
  inspectConflicts(
    mealId: MealEntryId,
  ): Promise<JournalResult<readonly MealConflictInspection[]>>;
  resolveConflict(
    input: ResolveMealConflictInput,
  ): Promise<JournalResult<MealSnapshot>>;
  trash(input: MealRevisionTarget): Promise<JournalResult<MealSnapshot>>;
  restore(input: MealRevisionTarget): Promise<JournalResult<MealSnapshot>>;
}
