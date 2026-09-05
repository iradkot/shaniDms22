import {
  createAuthenticatedBrowserWorkspaceScope,
  createFirebaseStorageRestMealImageRemoteAdapter,
  type BrowserMealImageBlobRepository,
} from '../../../../src/platform/web';

const OBJECT_PATH =
  'users/user-1/workspaces/primary/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';
const LOCAL_URI =
  'meal-image-idb:user-1:primary:image_1234567890abcdef1234567890abcdef.jpg';
const scope = createAuthenticatedBrowserWorkspaceScope({
  uid: 'user-1',
  workspaceId: 'primary',
  nightscoutSourceId: 'ns-source-1',
});

class MemoryBlobs implements BrowserMealImageBlobRepository {
  readonly blob = new Blob(['jpeg-image'], {type: 'image/jpeg'});
  readonly uploaded: string[] = [];

  async put(): Promise<void> {}

  async get(localUri: string): Promise<Blob | undefined> {
    return localUri === LOCAL_URI ? this.blob : undefined;
  }

  async markUploaded(localUri: string): Promise<void> {
    this.uploaded.push(localUri);
  }

  async remove(): Promise<void> {}

  async pruneUploaded(): Promise<void> {}
}

const response = (input: {
  readonly status: number;
  readonly json?: unknown;
  readonly blob?: Blob;
  readonly contentLength?: string;
}): Response =>
  ({
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    json: async () => input.json,
    blob: async () => input.blob ?? new Blob(),
    headers: {
      get: (name: string) =>
        name.toLocaleLowerCase('en-US') === 'content-length'
          ? input.contentLength ?? null
          : name.toLocaleLowerCase('en-US') === 'content-type'
          ? input.blob?.type ?? null
          : null,
    },
  } as unknown as Response);

describe('Firebase Storage REST Meal Image adapter', () => {
  it('uploads an immutable object with exact owner metadata and no token leak', async () => {
    const blobs = new MemoryBlobs();
    const request = jest
      .fn()
      .mockResolvedValueOnce(response({status: 404}))
      .mockResolvedValueOnce(response({status: 200, json: {}}));
    const remote = createFirebaseStorageRestMealImageRemoteAdapter({
      scope,
      auth: {getIdToken: async () => 'firebase-secret-id-token'},
      storageBucket: 'shani-project.appspot.com',
      blobs,
      fetch: request,
      createObjectUrl: () => 'blob:downloaded',
    });

    await expect(
      remote.upload({
        objectPath: OBJECT_PATH,
        localUri: LOCAL_URI,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ok: true});

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toContain(
      encodeURIComponent(OBJECT_PATH),
    );
    expect(request.mock.calls[1]?.[0]).toContain(
      `?name=${encodeURIComponent(OBJECT_PATH)}`,
    );
    const uploadInit = request.mock.calls[1]?.[1] as RequestInit;
    expect(uploadInit.headers).toMatchObject({
      Authorization: 'Firebase firebase-secret-id-token',
      'X-Goog-Upload-Protocol': 'multipart',
    });
    const multipart = await (uploadInit.body as Blob).text();
    expect(multipart).toContain('"schemaVersion":"1"');
    expect(multipart).toContain('"ownerProductUserId":"user-1"');
    expect(multipart).toContain('"workspaceId":"primary"');
    expect(multipart).toContain('"mealId":"meal-1"');
    expect(multipart).toContain(
      '"objectName":"image_1234567890abcdef1234567890abcdef.jpg"',
    );
    expect(JSON.stringify(request.mock.calls)).not.toContain(
      'firebase-secret-id-token?',
    );
    expect(blobs.uploaded).toEqual([LOCAL_URI]);
  });

  it('accepts an identical existing object but rejects unsafe paths locally', async () => {
    const blobs = new MemoryBlobs();
    const request = jest.fn().mockResolvedValue(
      response({
        status: 200,
        json: {
          contentType: 'image/jpeg',
          size: String(blobs.blob.size),
          metadata: {
            schemaVersion: '1',
            ownerProductUserId: 'user-1',
            workspaceId: 'primary',
            mealId: 'meal-1',
            objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
          },
        },
      }),
    );
    const remote = createFirebaseStorageRestMealImageRemoteAdapter({
      scope,
      auth: {getIdToken: async () => 'firebase-id-token'},
      storageBucket: 'shani-project.appspot.com',
      blobs,
      fetch: request,
    });

    await expect(
      remote.upload({
        objectPath: OBJECT_PATH,
        localUri: LOCAL_URI,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ok: true});
    await expect(
      remote.upload({
        objectPath: '../other-user/image.jpg',
        localUri: LOCAL_URI,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        retryable: false,
        message: 'Meal Image cloud sync was rejected.',
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds authenticated downloads before creating a display URL', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(
        response({status: 200, contentLength: String(11 * 1024 * 1024)}),
      );
    const remote = createFirebaseStorageRestMealImageRemoteAdapter({
      scope,
      auth: {getIdToken: async () => 'firebase-id-token'},
      storageBucket: 'shani-project.appspot.com',
      blobs: new MemoryBlobs(),
      fetch: request,
    });

    await expect(remote.download(OBJECT_PATH)).rejects.toThrow('too large');
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Firebase firebase-id-token',
    });
  });

  it('rejects a downloaded payload whose MIME type is not an image', async () => {
    const request = jest.fn().mockResolvedValue(
      response({
        status: 200,
        blob: new Blob(['not-an-image'], {type: 'text/plain'}),
      }),
    );
    const remote = createFirebaseStorageRestMealImageRemoteAdapter({
      scope,
      auth: {getIdToken: async () => 'firebase-id-token'},
      storageBucket: 'shani-project.appspot.com',
      blobs: new MemoryBlobs(),
      fetch: request,
    });

    await expect(remote.download(OBJECT_PATH)).rejects.toThrow(
      'invalid or too large',
    );
  });

  it('rejects valid-looking paths from another user or Workspace before I/O', async () => {
    const request = jest.fn();
    const remote = createFirebaseStorageRestMealImageRemoteAdapter({
      scope,
      auth: {getIdToken: async () => 'firebase-id-token'},
      storageBucket: 'shani-project.appspot.com',
      blobs: new MemoryBlobs(),
      fetch: request,
    });
    const otherUser = OBJECT_PATH.replace('users/user-1/', 'users/user-2/');
    const otherWorkspace = OBJECT_PATH.replace(
      '/workspaces/primary/',
      '/workspaces/secondary/',
    );

    await expect(remote.resolve(otherUser)).rejects.toThrow(
      'another Workspace',
    );
    await expect(remote.remove(otherWorkspace)).rejects.toThrow(
      'another Workspace',
    );
    await expect(
      remote.upload({
        objectPath: otherWorkspace,
        localUri: LOCAL_URI,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({ok: false, error: {retryable: false}});
    await expect(
      remote.upload({
        objectPath: OBJECT_PATH,
        localUri: LOCAL_URI.replace(':user-1:', ':user-2:'),
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({ok: false, error: {retryable: false}});
    expect(request).not.toHaveBeenCalled();
  });
});
