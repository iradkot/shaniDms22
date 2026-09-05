import type {JournalResult} from './result';
import type {MealEntryId} from '../domain/identifiers';
import type {JournalStoreListener, JournalUnsubscribe} from '../domain/journal';
import type {JournalTombstone} from '../domain/tombstones';

export interface JournalMediaCleanupFailure {
  readonly mealId: MealEntryId;
  readonly message: string;
}

export interface JournalTrashPurgeResult {
  readonly tombstones: readonly JournalTombstone[];
  /** Cleanup happens after the purge commit and never rolls it back. */
  readonly mediaCleanupFailures: readonly JournalMediaCleanupFailure[];
}

export interface JournalMaintenance {
  getTombstoneSnapshot(): readonly JournalTombstone[];
  subscribe(listener: JournalStoreListener): JournalUnsubscribe;
  purgeExpiredTrash(): Promise<JournalResult<JournalTrashPurgeResult>>;
}
