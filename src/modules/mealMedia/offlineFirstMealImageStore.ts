import type {
  JournalMediaStore,
  JournalWorkspaceScope,
  MealEntryId,
  MealImageInput,
  MealImageSnapshot,
} from '../journal';
import {
  MEAL_IMAGE_MAX_BYTES,
  type MealImageFileAdapter,
  type MealImageObjectNameGenerator,
  type MealImageRemoteAdapter,
} from './contracts';
import {
  buildMealImageObjectPath,
  mealImageStorageUri,
  parseMealImageObjectPath,
} from './objectPath';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const localUriOf = (image: MealImageSnapshot): string | undefined =>
  image.syncState.kind === 'available'
    ? image.syncState.localUri
    : image.syncState.localUri;

const objectNameOf = (image: MealImageSnapshot): string | undefined =>
  image.syncState.kind === 'upload_pending' ||
  image.syncState.kind === 'failed' ||
  image.syncState.kind === 'available'
    ? image.syncState.objectName
    : undefined;

const objectPathOf = (image: MealImageSnapshot): string | undefined =>
  image.syncState.kind === 'available'
    ? image.syncState.objectPath
    : undefined;

export class OfflineFirstMealImageStore implements JournalMediaStore {
  constructor(
    private readonly dependencies: {
      readonly files: MealImageFileAdapter;
      readonly objectNames: MealImageObjectNameGenerator;
      readonly remote?: MealImageRemoteAdapter;
    },
  ) {}

  async stageMealImage(
    _scope: JournalWorkspaceScope,
    _mealId: MealEntryId,
    input: MealImageInput,
  ): Promise<MealImageSnapshot> {
    const normalisedMimeType = input.mimeType.toLocaleLowerCase('en-US');
    const extension = EXTENSIONS[normalisedMimeType];
    if (extension === undefined) {
      throw new Error('Choose a supported image (JPEG, PNG, WebP or HEIC).');
    }
    if (
      input.byteSize !== undefined &&
      input.byteSize > MEAL_IMAGE_MAX_BYTES
    ) {
      throw new Error('Meal Images must be 10 MB or smaller.');
    }
    const objectName = `${this.dependencies.objectNames.next()}.${extension}`;
    if (!/^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/.test(objectName)) {
      throw new Error('The Meal Image object name generator is invalid.');
    }
    const staged = await this.dependencies.files.stage({
      sourceUri: input.uri,
      destinationName: objectName,
    });
    if (staged.byteSize <= 0 || staged.byteSize > MEAL_IMAGE_MAX_BYTES) {
      await this.dependencies.files.remove(staged.localUri).catch(() => undefined);
      throw new Error('Meal Images must be 10 MB or smaller.');
    }
    return {
      mimeType: normalisedMimeType,
      ...(input.fileName === undefined ? {} : {fileName: input.fileName}),
      byteSize: staged.byteSize,
      ...(input.widthPx === undefined ? {} : {widthPx: input.widthPx}),
      ...(input.heightPx === undefined ? {} : {heightPx: input.heightPx}),
      syncState: {
        kind: 'upload_pending',
        localUri: staged.localUri,
        objectName,
      },
    };
  }

  async prepareMealImageForRemote(
    scope: JournalWorkspaceScope,
    mealId: MealEntryId,
    image: MealImageSnapshot,
  ) {
    const objectName = objectNameOf(image);
    if (
      image.syncState.kind === 'available' &&
      image.syncState.objectPath !== undefined &&
      objectName !== undefined
    ) {
      try {
        if (
          image.syncState.objectPath ===
          buildMealImageObjectPath(scope, mealId, objectName)
        ) {
          return {ok: true as const, value: image};
        }
      } catch {
        // Rebuild below only when a durable local copy is available.
      }
    }
    const remote = this.dependencies.remote;
    const localUri = localUriOf(image);
    if (remote === undefined || localUri === undefined || objectName === undefined) {
      return {
        ok: false as const,
        error: {
          message: 'Meal Image cloud sync is not available.',
          retryable: false,
        },
      };
    }
    let objectPath: string;
    try {
      objectPath = buildMealImageObjectPath(scope, mealId, objectName);
    } catch (error) {
      return {
        ok: false as const,
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'The Meal Image path is invalid.',
          retryable: false,
        },
      };
    }
    const uploaded = await remote.upload({
      objectPath,
      localUri,
      mimeType: image.mimeType,
    });
    if (!uploaded.ok) {
      return uploaded;
    }
    const storageUri = mealImageStorageUri(objectPath);
    return {
      ok: true as const,
      value: {
        ...image,
        syncState: {
          kind: 'available' as const,
          localUri,
          objectName,
          objectPath,
          displayUri: storageUri,
          thumbnailUri: storageUri,
        },
      },
    };
  }

  async resolveMealImageUri(
    image: MealImageSnapshot,
  ): Promise<string | undefined> {
    const localUri = localUriOf(image);
    if (localUri !== undefined) {
      return localUri;
    }
    const objectPath = objectPathOf(image);
    return objectPath === undefined || this.dependencies.remote === undefined
      ? undefined
      : this.dependencies.remote.resolve(objectPath);
  }

  async removeMealImage(
    scope: JournalWorkspaceScope,
    mealId: MealEntryId,
    image: MealImageSnapshot,
  ): Promise<void> {
    let removalFailure: unknown;
    const localUri = localUriOf(image);
    if (localUri !== undefined) {
      try {
        await this.dependencies.files.remove(localUri);
      } catch (error) {
        removalFailure = error;
      }
    }
    const remote = this.dependencies.remote;
    if (remote === undefined) {
      if (removalFailure !== undefined) {
        throw removalFailure;
      }
      return;
    }
    const explicitPath = objectPathOf(image);
    const objectName = objectNameOf(image);
    const explicitParts =
      explicitPath === undefined
        ? undefined
        : parseMealImageObjectPath(explicitPath);
    const trustedExplicitPath =
      explicitParts !== undefined &&
      explicitParts.productUserId === scope.productUserId &&
      explicitParts.workspaceId === scope.workspaceId &&
      explicitParts.mealId === mealId &&
      (objectName === undefined || explicitParts.objectName === objectName)
        ? explicitPath
        : undefined;
    const path =
      trustedExplicitPath ??
      (objectName === undefined
        ? undefined
        : buildMealImageObjectPath(scope, mealId, objectName));
    if (path !== undefined) {
      try {
        await remote.remove(path);
      } catch (error) {
        removalFailure ??= error;
      }
    }
    if (removalFailure !== undefined) {
      throw removalFailure;
    }
  }
}
