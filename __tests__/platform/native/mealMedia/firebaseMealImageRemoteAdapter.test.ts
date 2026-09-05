import {
  createFirebaseMealImageRemoteAdapter,
  type MealImageStorageGateway,
} from '../../../../src/platform/native/mealMedia/firebaseMealImageRemoteAdapter';

const OBJECT_PATH =
  'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';

const gateway = (): jest.Mocked<MealImageStorageGateway> => ({
  inspect: jest.fn().mockResolvedValue(undefined),
  upload: jest.fn().mockResolvedValue(undefined),
  resolve: jest.fn().mockResolvedValue('https://example.test/image'),
  remove: jest.fn().mockResolvedValue(undefined),
});

describe('Firebase Meal Image remote adapter', () => {
  it('uploads with exact owner and Workspace metadata', async () => {
    const storage = gateway();
    const adapter = createFirebaseMealImageRemoteAdapter(storage);

    await expect(
      adapter.upload({
        objectPath: OBJECT_PATH,
        localUri: 'file:///documents/image.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ok: true});

    expect(storage.upload).toHaveBeenCalledWith({
      objectPath: OBJECT_PATH,
      localUri: 'file:///documents/image.jpg',
      mimeType: 'image/jpeg',
      customMetadata: {
        schemaVersion: '1',
        ownerProductUserId: 'owner-1',
        workspaceId: 'workspace-1',
        mealId: 'meal-1',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    });
  });

  it('treats the exact existing immutable object as an idempotent retry', async () => {
    const storage = gateway();
    storage.inspect.mockResolvedValue({
      contentType: 'image/jpeg',
      customMetadata: {
        schemaVersion: '1',
        ownerProductUserId: 'owner-1',
        workspaceId: 'workspace-1',
        mealId: 'meal-1',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    });
    const adapter = createFirebaseMealImageRemoteAdapter(storage);

    await expect(
      adapter.upload({
        objectPath: OBJECT_PATH,
        localUri: 'file:///documents/image.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ok: true});
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('never overwrites a mismatched object and classifies connectivity failures', async () => {
    const collision = gateway();
    collision.inspect.mockResolvedValue({
      contentType: 'image/png',
      customMetadata: {},
    });
    const collisionAdapter = createFirebaseMealImageRemoteAdapter(collision);
    await expect(
      collisionAdapter.upload({
        objectPath: OBJECT_PATH,
        localUri: 'file:///documents/image.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {retryable: false},
    });
    expect(collision.upload).not.toHaveBeenCalled();

    const offline = gateway();
    offline.inspect.mockRejectedValue({code: 'storage/retry-limit-exceeded'});
    const offlineAdapter = createFirebaseMealImageRemoteAdapter(offline);
    await expect(
      offlineAdapter.upload({
        objectPath: OBJECT_PATH,
        localUri: 'file:///documents/image.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {retryable: true},
    });
  });

  it('rejects an invalid object path before touching Firebase Storage', async () => {
    const storage = gateway();
    const adapter = createFirebaseMealImageRemoteAdapter(storage);

    await expect(
      adapter.upload({
        objectPath: `${OBJECT_PATH}/nested`,
        localUri: 'file:///documents/image.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({ok: false, error: {retryable: false}});
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('makes deletion idempotent when the remote object is already gone', async () => {
    const storage = gateway();
    storage.remove.mockRejectedValue({code: 'storage/object-not-found'});
    const adapter = createFirebaseMealImageRemoteAdapter(storage);

    await expect(adapter.remove(OBJECT_PATH)).resolves.toBeUndefined();
  });
});
