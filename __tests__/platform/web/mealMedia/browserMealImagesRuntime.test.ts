import type {
  MealEntryId,
  MealImageSnapshot,
} from '../../../../src/modules/journal';
import {
  createAuthenticatedBrowserWorkspaceScope,
  createBrowserMealImagesRuntime,
  type BrowserMealImageBlobRepository,
} from '../../../../src/platform/web';

class MemoryStrings {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class MemoryBlobs implements BrowserMealImageBlobRepository {
  readonly values = new Map<string, Blob>();
  readonly uploaded = new Set<string>();

  async put(localUri: string, blob: Blob): Promise<void> {
    this.values.set(localUri, blob);
  }

  async get(localUri: string): Promise<Blob | undefined> {
    return this.values.get(localUri);
  }

  async markUploaded(localUri: string): Promise<void> {
    this.uploaded.add(localUri);
  }

  async remove(localUri: string): Promise<void> {
    this.values.delete(localUri);
  }

  async pruneUploaded(): Promise<void> {}
}

const scope = createAuthenticatedBrowserWorkspaceScope({
  uid: 'firebase-user-1',
  workspaceId: 'primary',
  nightscoutSourceId: 'ns_source_1',
});

describe('browser Meal Images runtime', () => {
  it('stages a picked Blob durably and reference-counts display URLs', async () => {
    const blobs = new MemoryBlobs();
    const revoked: string[] = [];
    const file = new Blob(['jpeg-bytes'], {type: 'image/jpeg'});
    const handle = createBrowserMealImagesRuntime({
      scope,
      strings: new MemoryStrings(),
      blobs,
      fetch: jest.fn(
        async () => ({ok: true, blob: async () => file} as Response),
      ),
      crypto: {
        getRandomValues: array => {
          (array as Uint8Array).fill(10);
          return array;
        },
      },
      createObjectUrl: () => 'blob:resolved-meal-image',
      revokeObjectUrl: uri => revoked.push(uri),
    });

    const image = await handle.store.stageMealImage(
      scope,
      'meal_1' as MealEntryId,
      {
        uri: 'blob:picked-meal-image',
        mimeType: 'image/jpeg',
        byteSize: file.size,
      },
    );

    expect(image.syncState).toMatchObject({
      kind: 'upload_pending',
      localUri:
        'meal-image-idb:firebase-user-1:primary:image_0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a.jpg',
    });
    expect(blobs.values.size).toBe(1);
    await expect(handle.runtime.resolve(image)).resolves.toBe(
      'blob:resolved-meal-image',
    );
    await expect(handle.runtime.resolve(image)).resolves.toBe(
      'blob:resolved-meal-image',
    );
    handle.runtime.release?.('blob:resolved-meal-image');
    expect(revoked).toEqual([]);
    handle.runtime.release?.('blob:resolved-meal-image');
    expect(revoked).toEqual(['blob:resolved-meal-image']);

    handle.dispose();
  });

  it('keeps local capture available without Firebase configuration', async () => {
    const handle = createBrowserMealImagesRuntime({
      scope,
      strings: new MemoryStrings(),
      blobs: new MemoryBlobs(),
      crypto: globalThis.crypto,
      createObjectUrl: () => 'blob:unused',
      revokeObjectUrl: jest.fn(),
    });

    await expect(handle.runtime.pick('library')).resolves.toEqual({
      kind: 'error',
      code: 'unavailable',
      message: 'Image selection is unavailable in this browser.',
    });
    expect(handle.store.prepareMealImageForRemote).toBeDefined();
    handle.dispose();
  });

  it('keeps a failed remote deletion queued until a later retry succeeds', async () => {
    const strings = new MemoryStrings();
    const objectPath =
      'users/firebase-user-1/workspaces/primary/mealImages/meal_1/image_1234567890abcdef1234567890abcdef.jpg';
    const request = jest
      .fn()
      .mockResolvedValueOnce({ok: false, status: 503})
      .mockResolvedValueOnce({ok: true, status: 204});
    const handle = createBrowserMealImagesRuntime({
      scope,
      strings,
      blobs: new MemoryBlobs(),
      auth: {getIdToken: async () => 'firebase-id-token'},
      storageBucket: 'shani-project.appspot.com',
      fetch: request as unknown as typeof globalThis.fetch,
      createObjectUrl: () => 'blob:unused',
      revokeObjectUrl: jest.fn(),
    });
    const image: MealImageSnapshot = {
      mimeType: 'image/jpeg',
      syncState: {
        kind: 'available',
        objectPath,
        displayUri: 'storage-object://meal-image',
        thumbnailUri: 'storage-object://meal-image',
      },
    };

    await handle.store.removeMealImage(scope, 'meal_1' as MealEntryId, image);
    expect([...strings.values.values()].join(' ')).toContain(objectPath);
    await expect(handle.retryPendingDeletions()).resolves.toEqual({
      removed: 1,
      pending: 0,
    });
    expect([...strings.values.values()].join(' ')).not.toContain(objectPath);
    expect(request).toHaveBeenCalledTimes(2);
    handle.dispose();
  });
});
