import type {
  ExternalActivityRecordSnapshot,
  ExternalActivityRole,
  ExternalCarbRecordSnapshot,
  ExternalRecordReference,
  ExternalTreatmentRecordSnapshot,
  ReportedCarbohydrateRole,
  SupportingTreatmentRole,
} from './externalRecords';
import type {JournalConflictId, Revision} from './identifiers';
import type {FieldChange, JournalLifecycleState} from './journal';
import type {
  MealCarbohydrates,
  MealImageInput,
  MealImageSnapshot,
  MealSnapshot,
} from './meals';
import type {
  ActivityCategory,
  ActivityIntensity,
  ActivitySnapshot,
} from './activities';

export type JournalConflictDecision = 'keep_current' | 'apply_proposed';

export type JournalDetectedFieldValue<T> =
  | {readonly kind: 'present'; readonly value: T}
  | {readonly kind: 'absent'};

export interface MealConflictDetectedValues {
  readonly mealStart?: JournalDetectedFieldValue<number>;
  readonly name?: JournalDetectedFieldValue<string>;
  readonly mealCarbohydrates?: JournalDetectedFieldValue<MealCarbohydrates>;
  readonly image?: JournalDetectedFieldValue<MealImageSnapshot>;
  readonly notes?: JournalDetectedFieldValue<string>;
  readonly tags?: JournalDetectedFieldValue<readonly string[]>;
  readonly externalLinks?: JournalDetectedFieldValue<
    MealSnapshot['externalLinks']
  >;
  readonly lifecycle?: JournalDetectedFieldValue<JournalLifecycleState>;
}

export interface ActivityConflictDetectedValues {
  readonly category?: JournalDetectedFieldValue<ActivityCategory>;
  readonly customName?: JournalDetectedFieldValue<string>;
  readonly startedAt?: JournalDetectedFieldValue<number>;
  readonly endedAt?: JournalDetectedFieldValue<number>;
  readonly intensity?: JournalDetectedFieldValue<ActivityIntensity>;
  readonly notes?: JournalDetectedFieldValue<string>;
  readonly tags?: JournalDetectedFieldValue<readonly string[]>;
  readonly externalLinks?: JournalDetectedFieldValue<
    ActivitySnapshot['externalLinks']
  >;
  readonly lifecycle?: JournalDetectedFieldValue<JournalLifecycleState>;
}

export interface MealRevisionConflictProposal {
  readonly kind: 'meal_revision';
  readonly changes: {
    readonly mealStart?: FieldChange<number>;
    readonly name?: FieldChange<string>;
    readonly mealCarbohydrates?: FieldChange<MealCarbohydrates>;
    readonly image?: FieldChange<MealImageInput>;
    readonly notes?: FieldChange<string>;
    readonly tags?: FieldChange<readonly string[]>;
  };
}

export type MealLinkConflictProposal =
  | {
      readonly kind: 'meal_link_external_event';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalCarbRecordSnapshot;
      readonly role: ReportedCarbohydrateRole;
    }
  | {
      readonly kind: 'meal_link_external_event';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly role: SupportingTreatmentRole;
    };

export interface MealUnlinkConflictProposal {
  readonly kind: 'meal_unlink_external_event';
  readonly record: ExternalRecordReference;
}

export interface MealLifecycleConflictProposal {
  readonly kind: 'meal_lifecycle';
  readonly lifecycle: 'active' | 'trashed';
}

/** A remote link set is snapshot-free and can be inspected or applied as one fact. */
export interface MealExternalLinksConflictProposal {
  readonly kind: 'meal_external_links';
  readonly externalLinks: MealSnapshot['externalLinks'];
}

export type MealConflictProposal =
  | MealRevisionConflictProposal
  | MealLinkConflictProposal
  | MealUnlinkConflictProposal
  | MealExternalLinksConflictProposal
  | MealLifecycleConflictProposal;

export interface ActivityRevisionConflictProposal {
  readonly kind: 'activity_revision';
  readonly changes: {
    readonly category?: FieldChange<ActivityCategory>;
    readonly customName?: FieldChange<string>;
    readonly startedAt?: FieldChange<number>;
    readonly endedAt?: FieldChange<number>;
    readonly intensity?: FieldChange<ActivityIntensity>;
    readonly notes?: FieldChange<string>;
    readonly tags?: FieldChange<readonly string[]>;
  };
}

export type ActivityLinkConflictProposal =
  | {
      readonly kind: 'activity_link_external_event';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalActivityRecordSnapshot;
      readonly role: ExternalActivityRole;
    }
  | {
      readonly kind: 'activity_link_external_event';
      readonly record: ExternalRecordReference;
      readonly snapshot: ExternalTreatmentRecordSnapshot;
      readonly role: SupportingTreatmentRole;
    };

export interface ActivityUnlinkConflictProposal {
  readonly kind: 'activity_unlink_external_event';
  readonly record: ExternalRecordReference;
}

export interface ActivityLifecycleConflictProposal {
  readonly kind: 'activity_lifecycle';
  readonly lifecycle: 'active' | 'trashed';
}

/** A remote link set is snapshot-free and can be inspected or applied as one fact. */
export interface ActivityExternalLinksConflictProposal {
  readonly kind: 'activity_external_links';
  readonly externalLinks: ActivitySnapshot['externalLinks'];
}

export type ActivityConflictProposal =
  | ActivityRevisionConflictProposal
  | ActivityLinkConflictProposal
  | ActivityUnlinkConflictProposal
  | ActivityExternalLinksConflictProposal
  | ActivityLifecycleConflictProposal;

interface JournalConflictInspectionBase<TSnapshot, TProposal, TValues> {
  readonly conflictId: JournalConflictId;
  readonly detectedAt: number;
  readonly expectedRevision: Revision;
  readonly detectedAgainstRevision: Revision;
  readonly conflictingFields: readonly string[];
  readonly currentSnapshot: TSnapshot;
  readonly proposal: TProposal;
  readonly detectedValues: TValues;
}

export type MealConflictInspection = JournalConflictInspectionBase<
  MealSnapshot,
  MealConflictProposal,
  MealConflictDetectedValues
>;

export type ActivityConflictInspection = JournalConflictInspectionBase<
  ActivitySnapshot,
  ActivityConflictProposal,
  ActivityConflictDetectedValues
>;
