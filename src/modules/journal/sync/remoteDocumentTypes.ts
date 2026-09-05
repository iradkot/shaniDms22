import type {
  ActivityEntryId,
  ExternalRecordKey,
  MealEntryId,
  NightscoutSourceId,
  ProductUserId,
  Revision,
  WorkspaceId,
} from '../domain/identifiers';
import type {ActivityCategory, ActivityIntensity} from '../domain/activities';
import type {
  CarbPurpose,
  ExternalIdentityNamespace,
  SupportingTreatmentPurpose,
} from '../domain/externalRecords';
import type {JournalLifecycleState} from '../domain/journal';
import type {MealCarbohydrates} from '../domain/meals';

export const JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION = 1 as const;

/** Scope fields checked by both the remote Adapter and Firestore rules. */
export interface RemoteJournalDocumentScope {
  readonly ownerProductUserId: ProductUserId;
  readonly workspaceId: WorkspaceId;
  readonly nightscoutSourceId: NightscoutSourceId;
}

/** Stable Nightscout identity only. No external record snapshot is synced. */
export interface RemoteExternalRecordIdentity {
  readonly nightscoutSourceId: NightscoutSourceId;
  readonly recordKey: ExternalRecordKey;
  readonly namespace: ExternalIdentityNamespace;
  readonly value: string;
}

export type RemoteMealExternalRole =
  | {
      readonly kind: 'reported_carbohydrate';
      readonly purpose: CarbPurpose;
    }
  | {
      readonly kind: 'supporting_treatment';
      readonly purpose: SupportingTreatmentPurpose;
    };

export type RemoteActivityExternalRole =
  | {readonly kind: 'activity'}
  | {
      readonly kind: 'supporting_treatment';
      readonly purpose: SupportingTreatmentPurpose;
    };

export interface RemoteExternalEventLink<TRole> {
  readonly identity: RemoteExternalRecordIdentity;
  readonly role: TRole;
  readonly linkedAt: number;
}

export type RemoteMealImageProjection =
  | {readonly kind: 'none'}
  | {
      readonly kind: 'omitted';
      readonly reason: 'remote_object_identity_unavailable';
    }
  | {
      readonly kind: 'stored';
      /** Safe object name only; owner and Workspace path comes from scope. */
      readonly objectName: string;
      readonly mimeType: string;
      readonly byteSize?: number;
      readonly widthPx?: number;
      readonly heightPx?: number;
    };

interface RemoteJournalDocumentBase<
  TKind extends 'meal' | 'activity',
  TId extends MealEntryId | ActivityEntryId,
  TRole,
> {
  readonly schemaVersion: typeof JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION;
  readonly documentKind: TKind;
  readonly scope: RemoteJournalDocumentScope;
  readonly entityId: TId;
  readonly revision: Revision;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lifecycle: JournalLifecycleState;
  readonly externalLinks: readonly RemoteExternalEventLink<TRole>[];
}

export interface RemoteMealDocument
  extends RemoteJournalDocumentBase<
    'meal',
    MealEntryId,
    RemoteMealExternalRole
  > {
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: MealCarbohydrates;
  readonly image: RemoteMealImageProjection;
  readonly notes?: string;
  readonly tags: readonly string[];
}

export interface RemoteActivityDocument
  extends RemoteJournalDocumentBase<
    'activity',
    ActivityEntryId,
    RemoteActivityExternalRole
  > {
  readonly category: ActivityCategory;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: ActivityIntensity;
  readonly notes?: string;
  readonly tags: readonly string[];
}

export type RemoteJournalDocument = RemoteMealDocument | RemoteActivityDocument;
