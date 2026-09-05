export {JOURNAL_ERROR_CODES, journalError, journalOk} from './contracts/result';
export type {
  JournalError,
  JournalErrorCode,
  JournalResult,
} from './contracts/result';

export type {
  FindMealLinkCandidatesInput,
  LinkMealExternalEventInput,
  MealExternalEventTransfer,
  MealExternalTransferUndoReceipt,
  MealExternalTransferUndoResult,
  MealExternalCandidate,
  MealRevisionTarget,
  MealsWorkspace,
  ResolveMealConflictInput,
  RefreshMealExternalEventInput,
  TransferMealExternalEventInput,
  UnlinkMealExternalEventInput,
} from './contracts/mealsWorkspace';
export type {
  ActivitiesWorkspace,
  ActivityExternalCandidate,
  ActivityRevisionTarget,
  FindActivityLinkCandidatesInput,
  LinkActivityExternalEventInput,
  ActivityExternalEventTransfer,
  ActivityExternalTransferUndoReceipt,
  ActivityExternalTransferUndoResult,
  ResolveOngoingActivitiesInput,
  ResolveActivityConflictInput,
  RefreshActivityExternalEventInput,
  TransferActivityExternalEventInput,
  UnlinkActivityExternalEventInput,
} from './contracts/activitiesWorkspace';

export {
  parseActivityEntryId,
  parseExternalRecordKey,
  parseJournalConflictId,
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from './domain/identifiers';
export type {
  ActivityEntryId,
  ExternalRecordKey,
  JournalConflictId,
  MealEntryId,
  NightscoutSourceId,
  ProductUserId,
  Revision,
  WorkspaceId,
} from './domain/identifiers';

export type {
  ActivityConflictDetectedValues,
  ActivityConflictInspection,
  ActivityConflictProposal,
  ActivityLifecycleConflictProposal,
  ActivityLinkConflictProposal,
  ActivityRevisionConflictProposal,
  ActivityUnlinkConflictProposal,
  JournalConflictDecision,
  JournalDetectedFieldValue,
  MealConflictDetectedValues,
  MealConflictInspection,
  MealConflictProposal,
  MealLifecycleConflictProposal,
  MealLinkConflictProposal,
  MealRevisionConflictProposal,
  MealUnlinkConflictProposal,
} from './domain/conflicts';
export type {JournalTombstone} from './domain/tombstones';

export type {
  JournalMaintenance,
  JournalMediaCleanupFailure,
  JournalTrashPurgeResult,
} from './contracts/maintenance';

export {
  areExactExternalDuplicates,
  decodeExternalRecordPayload,
  parseExternalCarbRecordSnapshot,
  parseExternalActivityRecordSnapshot,
  parseExternalTreatmentRecordSnapshot,
  toExternalRecordReference,
  validateExternalLinksFromOneSource,
} from './domain/externalRecords';
export type {
  CarbPurpose,
  DecodedExternalRecord,
  ExternalActivityRecordSnapshot,
  ExternalActivityRole,
  ExternalCarbRecordSnapshot,
  ExternalEventLink,
  ExternalIdentifiers,
  ExternalRecordAvailability,
  ExternalRecordReference,
  ExternalRecordSnapshot,
  ExternalRecordUnavailableReason,
  ExternalStableIdentity,
  ExternalTreatmentRecordSnapshot,
  IdentifiedExternalRecord,
  ReportedCarbohydrateRole,
  ReadLinkedExternalRecordInput,
  ReadLinkedExternalRecordResult,
  SupportingTreatmentPurpose,
  SupportingTreatmentRole,
  UnidentifiedExternalRecord,
} from './domain/externalRecords';

export {JOURNAL_SYNC_FAILURE_CODES} from './domain/journal';
export type {
  ExpectedRevision,
  FieldChange,
  JournalLifecycleState,
  JournalLiveObservation,
  JournalListQuery,
  JournalPage,
  JournalSnapshotBase,
  JournalSyncFailureCode,
  JournalSyncState,
  JournalStoreListener,
  JournalTimeRange,
  JournalUnsubscribe,
  JournalWorkspaceScope,
} from './domain/journal';

export {
  deriveReportedCarbohydrates,
  parseCaptureMealInput,
  parseMealCarbohydrates,
  parseMealImageInput,
  validateMealSnapshot,
} from './domain/meals';
export type {
  CaptureMealInput,
  MealCarbohydrates,
  MealExternalEventLink,
  MealImageInput,
  MealImageSnapshot,
  MealImageSyncState,
  MealSnapshot,
  NormalizedCaptureMealInput,
  ReportedCarbohydrateComponent,
  ReportedCarbohydrates,
  ReviseMealInput,
} from './domain/meals';

export {
  parseActivityCategory,
  parseActivityIntensity,
  parseCaptureActivityInput,
  validateActivitySnapshot,
} from './domain/activities';
export type {
  ActivityCategory,
  ActivityExternalEventLink,
  ActivityIntensity,
  ActivitySnapshot,
  CaptureActivityInput,
  FinishActivityInput,
  NormalizedCaptureActivityInput,
  ReviseActivityInput,
} from './domain/activities';

export {VALIDATION_ISSUE_CODES} from './domain/validation';
export type {
  ParseResult,
  ValidationIssue,
  ValidationIssueCode,
  ValidationPathSegment,
} from './domain/validation';

export {createJournalEngine} from './engine';
export {
  decodePersistedJournalState,
  emptyJournalState,
  JOURNAL_STATE_SCHEMA_VERSION,
  JOURNAL_TRASH_RETENTION_MS,
} from './engine';
export type {
  JournalClock,
  JournalEngine,
  JournalEngineDependencies,
  JournalEntityId,
  JournalEntityKind,
  JournalEntityMetadata,
  JournalEntitySnapshot,
  JournalExternalRecordReader,
  JournalFieldConflictRecord,
  JournalIdGenerator,
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  JournalMediaStore,
  JournalOutboxOperation,
  JournalPurgeOutboxOperation,
  JournalUpsertOutboxOperation,
  JournalOutboxView,
  JournalRevisionRecord,
  JournalStateDecodeResult,
  JournalWorkspace,
  PersistedJournalState,
} from './engine';

export {
  AppOwnedUriJournalMediaStore,
  InMemoryJournalLocalStore,
  KeyValueJournalLocalStore,
  journalScopeStorageKey,
} from './adapters/local';
export type {JournalStringKeyValueStore} from './adapters/local';

export * from './sync';
