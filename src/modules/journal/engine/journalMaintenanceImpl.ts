import type {
  JournalMediaCleanupFailure,
  JournalMaintenance,
  JournalTrashPurgeResult,
} from '../contracts/maintenance';
import {journalOk} from '../contracts/result';
import type {JournalResult} from '../contracts/result';
import {storageFailure} from './operationHelpers';
import {deepFreeze} from './immutable';
import type {JournalWorkspaceRuntime} from './workspaceRuntime';

export class LocalJournalMaintenance implements JournalMaintenance {
  readonly getTombstoneSnapshot;
  readonly subscribe;

  constructor(private readonly runtime: JournalWorkspaceRuntime) {
    this.getTombstoneSnapshot = runtime.getTombstoneSnapshot;
    this.subscribe = runtime.subscribe;
  }

  async purgeExpiredTrash(): Promise<JournalResult<JournalTrashPurgeResult>> {
    const now = this.runtime.dependencies.clock.now();
    if (!Number.isSafeInteger(now) || now <= 0) {
      return storageFailure(
        new Error('Journal clock returned an invalid timestamp.'),
      );
    }
    let committed;
    try {
      committed = await this.runtime.purgeExpiredTrash(now);
    } catch (error) {
      return storageFailure(error);
    }

    const mediaCleanupFailures: JournalMediaCleanupFailure[] = [];
    for (const media of committed.mealImages) {
      try {
        await this.runtime.dependencies.mediaStore.removeMealImage(
          this.runtime.scope,
          media.mealId,
          media.image,
        );
      } catch (error) {
        mediaCleanupFailures.push({
          mealId: media.mealId,
          message:
            error instanceof Error
              ? error.message
              : 'The purged meal image could not be removed.',
        });
      }
    }

    return journalOk(
      deepFreeze({
        tombstones: committed.tombstones,
        mediaCleanupFailures,
      }),
    );
  }
}
