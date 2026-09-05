import type {MealEntryId} from '../../domain/identifiers';
import type {JournalWorkspaceScope} from '../../domain/journal';
import type {MealImageInput, MealImageSnapshot} from '../../domain/meals';
import type {JournalMediaStore} from '../../engine/types';

/**
 * Minimal Adapter for hosts whose picker URI is already app-owned and durable.
 * Temporary picker URIs must use a filesystem-backed Adapter instead.
 */
export class AppOwnedUriJournalMediaStore implements JournalMediaStore {
  async stageMealImage(
    _scope: JournalWorkspaceScope,
    _mealId: MealEntryId,
    input: MealImageInput,
  ): Promise<MealImageSnapshot> {
    return {
      mimeType: input.mimeType,
      ...(input.fileName === undefined ? {} : {fileName: input.fileName}),
      ...(input.byteSize === undefined ? {} : {byteSize: input.byteSize}),
      ...(input.widthPx === undefined ? {} : {widthPx: input.widthPx}),
      ...(input.heightPx === undefined ? {} : {heightPx: input.heightPx}),
      syncState: {kind: 'local_only', localUri: input.uri},
    };
  }

  async removeMealImage(
    _scope: JournalWorkspaceScope,
    _mealId: MealEntryId,
    _image: MealImageSnapshot,
  ): Promise<void> {
    // The host owns these durable URIs; there is no managed copy to remove.
  }
}
