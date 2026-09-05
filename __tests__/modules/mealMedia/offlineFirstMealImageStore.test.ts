import {
  MEAL_IMAGE_MAX_BYTES,
  OfflineFirstMealImageStore,
  buildMealImageObjectPath,
  type MealImageFileAdapter,
  type MealImageRemoteAdapter,
} from '../../../src/modules/mealMedia';
import {
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  type JournalWorkspaceScope,
  type MealImageSnapshot,
} from '../../../src/modules/journal';

const valueOf = <T>(result: {ok: true; value: T} | {ok: false}): T => {
  if (!result.ok) {
    throw new Error('Invalid test fixture.');
  }
  return result.value;
};

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('owner-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('source-1')),
};
const mealId = valueOf(parseMealEntryId('meal-1'));

class MemoryFiles implements MealImageFileAdapter {
  readonly staged: Array<{sourceUri: string; destinationName: string}> = [];
  readonly removed: string[] = [];
  byteSize = 512_000;

  async stage(input: {sourceUri: string; destinationName: string}) {
    this.staged.push(input);
    return {
      localUri: `file:///documents/meal-images/${input.destinationName}`,
      byteSize: this.byteSize,
    };
  }

  async remove(localUri: string) {
    this.removed.push(localUri);
  }
}

class MemoryRemote implements MealImageRemoteAdapter {
  readonly uploads: Array<{
    objectPath: string;
    localUri: string;
    mimeType: string;
  }> = [];
  readonly removed: string[] = [];
  uploadFailure: {message: string; retryable: boolean} | undefined;

  async upload(input: {
    objectPath: string;
    localUri: string;
    mimeType: string;
  }) {
    this.uploads.push(input);
    if (this.uploadFailure !== undefined) {
      return {ok: false as const, error: this.uploadFailure};
    }
    return {ok: true as const};
  }

  async resolve(objectPath: string) {
    return `https://storage.example.test/${encodeURIComponent(objectPath)}`;
  }

  async remove(objectPath: string) {
    this.removed.push(objectPath);
  }
}

describe('OfflineFirstMealImageStore', () => {
  it('copies a selected image into durable app storage before returning it', async () => {
    const files = new MemoryFiles();
    const store = new OfflineFirstMealImageStore({
      files,
      objectNames: {next: () => 'image_1234567890abcdef1234567890abcdef'},
    });

    const image = await store.stageMealImage(scope, mealId, {
      uri: 'file:///temporary-picker/photo.jpg',
      mimeType: 'image/jpeg',
      fileName: 'Lunch photo.jpg',
      byteSize: 700_000,
      widthPx: 1200,
      heightPx: 900,
    });

    expect(files.staged).toEqual([
      {
        sourceUri: 'file:///temporary-picker/photo.jpg',
        destinationName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    ]);
    expect(image).toEqual({
      mimeType: 'image/jpeg',
      fileName: 'Lunch photo.jpg',
      byteSize: 512_000,
      widthPx: 1200,
      heightPx: 900,
      syncState: {
        kind: 'upload_pending',
        localUri:
          'file:///documents/meal-images/image_1234567890abcdef1234567890abcdef.jpg',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    });
  });

  it('rejects unsafe formats and oversized files without leaving a managed copy', async () => {
    const files = new MemoryFiles();
    const store = new OfflineFirstMealImageStore({
      files,
      objectNames: {next: () => 'image_1234567890abcdef1234567890abcdef'},
    });

    await expect(
      store.stageMealImage(scope, mealId, {
        uri: 'file:///temporary-picker/document.pdf',
        mimeType: 'application/pdf',
        byteSize: 100,
      }),
    ).rejects.toThrow('supported image');
    expect(files.staged).toHaveLength(0);

    files.byteSize = MEAL_IMAGE_MAX_BYTES + 1;
    await expect(
      store.stageMealImage(scope, mealId, {
        uri: 'file:///temporary-picker/huge.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('10 MB');
    expect(files.removed).toEqual([
      'file:///documents/meal-images/image_1234567890abcdef1234567890abcdef.png',
    ]);
  });

  it('uploads a durable pending image to the owner and Workspace path', async () => {
    const files = new MemoryFiles();
    const remote = new MemoryRemote();
    const store = new OfflineFirstMealImageStore({
      files,
      remote,
      objectNames: {next: () => 'image_1234567890abcdef1234567890abcdef'},
    });
    const pending = await store.stageMealImage(scope, mealId, {
      uri: 'file:///temporary-picker/photo.jpg',
      mimeType: 'image/jpeg',
    });

    const synced = await store.prepareMealImageForRemote(
      scope,
      mealId,
      pending,
    );

    const objectPath =
      'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';
    expect(remote.uploads).toEqual([
      {
        objectPath,
        localUri:
          'file:///documents/meal-images/image_1234567890abcdef1234567890abcdef.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(synced).toEqual({
      ok: true,
      value: {
        ...pending,
        syncState: {
          kind: 'available',
          localUri:
            'file:///documents/meal-images/image_1234567890abcdef1234567890abcdef.jpg',
          objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
          objectPath,
          displayUri: `storage-object://${encodeURIComponent(objectPath)}`,
          thumbnailUri: `storage-object://${encodeURIComponent(objectPath)}`,
        },
      },
    });
  });

  it('returns a retryable failure without losing the local image', async () => {
    const files = new MemoryFiles();
    const remote = new MemoryRemote();
    remote.uploadFailure = {message: 'Offline', retryable: true};
    const store = new OfflineFirstMealImageStore({
      files,
      remote,
      objectNames: {next: () => 'image_1234567890abcdef1234567890abcdef'},
    });
    const pending: MealImageSnapshot = {
      mimeType: 'image/jpeg',
      syncState: {
        kind: 'upload_pending',
        localUri: 'file:///documents/meal-images/photo.jpg',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    };

    await expect(
      store.prepareMealImageForRemote(scope, mealId, pending),
    ).resolves.toEqual({
      ok: false,
      error: {message: 'Offline', retryable: true},
    });
    expect(files.removed).toHaveLength(0);
  });

  it('resolves remote-only images and removes local and remote copies', async () => {
    const files = new MemoryFiles();
    const remote = new MemoryRemote();
    const store = new OfflineFirstMealImageStore({
      files,
      remote,
      objectNames: {next: () => 'unused_1234567890abcd'},
    });
    const objectPath = buildMealImageObjectPath(
      scope,
      mealId,
      'image_1234567890abcdef1234567890abcdef.jpg',
    );
    const image: MealImageSnapshot = {
      mimeType: 'image/jpeg',
      syncState: {
        kind: 'available',
        objectPath,
        displayUri: `storage-object://${encodeURIComponent(objectPath)}`,
        thumbnailUri: `storage-object://${encodeURIComponent(objectPath)}`,
      },
    };

    await expect(store.resolveMealImageUri(image)).resolves.toBe(
      `https://storage.example.test/${encodeURIComponent(objectPath)}`,
    );
    await store.removeMealImage(scope, mealId, {
      ...image,
      syncState: {
        ...image.syncState,
        localUri: 'file:///documents/meal-images/photo.jpg',
      },
    });

    expect(files.removed).toEqual([
      'file:///documents/meal-images/photo.jpg',
    ]);
    expect(remote.removed).toEqual([objectPath]);
  });

  it('never deletes an explicit image path from another Workspace', async () => {
    const files = new MemoryFiles();
    const remote = new MemoryRemote();
    const store = new OfflineFirstMealImageStore({
      files,
      remote,
      objectNames: {next: () => 'unused_1234567890abcd'},
    });
    const image: MealImageSnapshot = {
      mimeType: 'image/jpeg',
      syncState: {
        kind: 'available',
        objectPath:
          'users/owner-1/workspaces/workspace-2/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg',
        displayUri: 'storage-object://cross-scope',
        thumbnailUri: 'storage-object://cross-scope',
      },
    };

    await store.removeMealImage(scope, mealId, image);

    expect(remote.removed).toEqual([]);
  });
});
