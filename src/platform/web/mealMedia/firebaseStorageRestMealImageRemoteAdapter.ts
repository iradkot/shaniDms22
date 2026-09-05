import {
  MEAL_IMAGE_MAX_BYTES,
  type MealImageRemoteAdapter,
  type MealImageRemoteMutationResult,
} from '../../../modules/mealMedia';
import type {JournalWorkspaceScope} from '../../../modules/journal';
import type {BrowserFirebaseAuth} from '../auth';
import type {BrowserMealImageBlobRepository} from './browserMealImageBlobStore';
import {isBrowserMealImageLocalUri} from './browserMealImageFileAdapter';

const OBJECT_PATH =
  /^users\/([A-Za-z0-9_-]{1,128})\/workspaces\/([A-Za-z0-9_-]{1,128})\/mealImages\/([A-Za-z0-9_-]{1,128})\/(image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif))$/;
const MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

interface ParsedObjectPath {
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
  readonly mealId: string;
  readonly objectName: string;
}

interface RemoteMetadata {
  readonly contentType: string;
  readonly size: number;
  readonly customMetadata: Readonly<Record<string, string>>;
}

class BrowserStorageError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'BrowserStorageError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseObjectPath = (objectPath: string): ParsedObjectPath => {
  const match = OBJECT_PATH.exec(objectPath);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    throw new BrowserStorageError(
      400,
      'invalid-object-path',
      'The Meal Image object path is invalid.',
    );
  }
  return {
    ownerProductUserId: match[1],
    workspaceId: match[2],
    mealId: match[3],
    objectName: match[4],
  };
};

const safeBucket = (value: string): string => {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (
    normalized.length < 3 ||
    normalized.length > 222 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(normalized) ||
    normalized.includes('..')
  ) {
    throw new Error('Firebase Storage bucket is invalid.');
  }
  return normalized;
};

const expectedMetadata = (
  parsed: ParsedObjectPath,
): Readonly<Record<string, string>> => ({
  schemaVersion: '1',
  ownerProductUserId: parsed.ownerProductUserId,
  workspaceId: parsed.workspaceId,
  mealId: parsed.mealId,
  objectName: parsed.objectName,
});

const decodeMetadata = (value: unknown): RemoteMetadata => {
  if (
    !isRecord(value) ||
    typeof value.contentType !== 'string' ||
    !MIME_TYPES.has(value.contentType.toLocaleLowerCase('en-US')) ||
    !isRecord(value.metadata)
  ) {
    throw new BrowserStorageError(
      502,
      'invalid-response',
      'Firebase Storage returned invalid Meal Image metadata.',
    );
  }
  const size = typeof value.size === 'string' ? Number(value.size) : value.size;
  if (
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MEAL_IMAGE_MAX_BYTES ||
    Object.values(value.metadata).some(item => typeof item !== 'string')
  ) {
    throw new BrowserStorageError(
      502,
      'invalid-response',
      'Firebase Storage returned invalid Meal Image metadata.',
    );
  }
  return {
    contentType: value.contentType,
    size,
    customMetadata: value.metadata as Readonly<Record<string, string>>,
  };
};

const mapMutationFailure = (error: unknown): MealImageRemoteMutationResult => {
  const status = error instanceof BrowserStorageError ? error.status : 0;
  const retryable =
    status === 0 || status === 408 || status === 429 || status >= 500;
  return {
    ok: false,
    error: {
      retryable,
      message: retryable
        ? 'Meal Image cloud sync is temporarily unavailable.'
        : 'Meal Image cloud sync was rejected.',
    },
  };
};

export interface BrowserFirebaseMealImageRemoteAdapter
  extends MealImageRemoteAdapter {
  download(objectPath: string): Promise<Blob>;
}

export const createFirebaseStorageRestMealImageRemoteAdapter = (input: {
  readonly scope: JournalWorkspaceScope;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'>;
  readonly storageBucket: string;
  readonly blobs: BrowserMealImageBlobRepository;
  readonly fetch?: typeof globalThis.fetch;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly timeoutMs?: number;
}): BrowserFirebaseMealImageRemoteAdapter => {
  const bucket = safeBucket(input.storageBucket);
  const request = input.fetch ?? globalThis.fetch.bind(globalThis);
  const createObjectUrl =
    input.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const objectUrl = (objectPath?: string): string =>
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
      bucket,
    )}/o${
      objectPath === undefined ? '' : `/${encodeURIComponent(objectPath)}`
    }`;
  const scopedObjectPath = (objectPath: string): ParsedObjectPath => {
    const parsed = parseObjectPath(objectPath);
    if (
      parsed.ownerProductUserId !== input.scope.productUserId ||
      parsed.workspaceId !== input.scope.workspaceId
    ) {
      throw new BrowserStorageError(
        403,
        'scope-mismatch',
        'The Meal Image object path belongs to another Workspace.',
      );
    }
    return parsed;
  };

  const authenticatedRequest = async (
    url: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const token = await input.auth.getIdToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? 30_000,
    );
    try {
      return await request(url, {
        ...init,
        headers: {
          Authorization: `Firebase ${token}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new BrowserStorageError(
        controller.signal.aborted ? 408 : 0,
        controller.signal.aborted ? 'timeout' : 'network',
        controller.signal.aborted
          ? 'Firebase Storage request timed out.'
          : 'Firebase Storage is unavailable.',
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const metadata = async (
    objectPath: string,
  ): Promise<RemoteMetadata | undefined> => {
    scopedObjectPath(objectPath);
    const response = await authenticatedRequest(objectUrl(objectPath));
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new BrowserStorageError(
        response.status,
        'metadata-failed',
        'Firebase Storage metadata request failed.',
      );
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new BrowserStorageError(
        502,
        'invalid-response',
        'Firebase Storage returned an invalid response.',
      );
    }
    return decodeMetadata(value);
  };

  const matches = (
    current: RemoteMetadata,
    expected: Readonly<Record<string, string>>,
    mimeType: string,
    size: number,
  ): boolean =>
    current.contentType === mimeType &&
    current.size === size &&
    Object.entries(expected).every(
      ([key, value]) => current.customMetadata[key] === value,
    );

  const upload = async (uploadInput: {
    readonly objectPath: string;
    readonly localUri: string;
    readonly mimeType: string;
  }): Promise<MealImageRemoteMutationResult> => {
    try {
      const parsed = scopedObjectPath(uploadInput.objectPath);
      const customMetadata = expectedMetadata(parsed);
      if (!isBrowserMealImageLocalUri(input.scope, uploadInput.localUri)) {
        throw new BrowserStorageError(
          403,
          'local-scope-mismatch',
          'The local Meal Image belongs to another Workspace.',
        );
      }
      const blob = await input.blobs.get(uploadInput.localUri);
      if (blob === undefined) {
        throw new BrowserStorageError(
          410,
          'local-image-missing',
          'The local Meal Image is missing.',
        );
      }
      const mimeType = uploadInput.mimeType.toLocaleLowerCase('en-US');
      if (!MIME_TYPES.has(mimeType) || blob.type !== mimeType) {
        throw new BrowserStorageError(
          400,
          'invalid-content-type',
          'The Meal Image content type is invalid.',
        );
      }
      const existing = await metadata(uploadInput.objectPath);
      if (existing !== undefined) {
        if (!matches(existing, customMetadata, mimeType, blob.size)) {
          throw new BrowserStorageError(
            409,
            'object-name-conflict',
            'The Meal Image object name is already in use.',
          );
        }
        await input.blobs.markUploaded(uploadInput.localUri);
        return {ok: true};
      }
      const boundary = `shani-${Math.random()
        .toString(36)
        .slice(2)}-${Date.now()}`;
      const metadataBody = JSON.stringify({
        name: uploadInput.objectPath,
        contentType: mimeType,
        cacheControl: 'private,max-age=604800',
        metadata: customMetadata,
      });
      const body = new Blob(
        [
          `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadataBody}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
          blob,
          `\r\n--${boundary}--`,
        ],
        {type: `multipart/related; boundary=${boundary}`},
      );
      const response = await authenticatedRequest(
        `${objectUrl()}?name=${encodeURIComponent(uploadInput.objectPath)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'X-Goog-Upload-Protocol': 'multipart',
          },
          body,
        },
      );
      if (!response.ok) {
        throw new BrowserStorageError(
          response.status,
          'upload-failed',
          'Firebase Storage upload failed.',
        );
      }
      await input.blobs.markUploaded(uploadInput.localUri);
      return {ok: true};
    } catch (error) {
      return mapMutationFailure(error);
    }
  };

  const download = async (objectPath: string): Promise<Blob> => {
    scopedObjectPath(objectPath);
    const response = await authenticatedRequest(
      `${objectUrl(objectPath)}?alt=media`,
    );
    if (!response.ok) {
      throw new BrowserStorageError(
        response.status,
        response.status === 404 ? 'object-not-found' : 'download-failed',
        'The Meal Image could not be downloaded.',
      );
    }
    const contentLength = Number(response.headers.get('Content-Length'));
    const responseMimeType = response.headers
      .get('Content-Type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLocaleLowerCase('en-US');
    if (
      Number.isFinite(contentLength) &&
      contentLength > MEAL_IMAGE_MAX_BYTES
    ) {
      throw new BrowserStorageError(
        413,
        'image-too-large',
        'The Meal Image is too large.',
      );
    }
    const blob = await response.blob();
    const blobMimeType = blob.type.toLocaleLowerCase('en-US');
    if (
      blob.size <= 0 ||
      blob.size > MEAL_IMAGE_MAX_BYTES ||
      (responseMimeType !== undefined && !MIME_TYPES.has(responseMimeType)) ||
      !MIME_TYPES.has(blobMimeType)
    ) {
      throw new BrowserStorageError(
        blob.size > MEAL_IMAGE_MAX_BYTES ? 413 : 502,
        'invalid-image-response',
        'The Meal Image download is invalid or too large.',
      );
    }
    return blob;
  };

  return {
    upload,
    download,
    async resolve(objectPath) {
      return createObjectUrl(await download(objectPath));
    },
    async remove(objectPath) {
      scopedObjectPath(objectPath);
      const response = await authenticatedRequest(objectUrl(objectPath), {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        throw new BrowserStorageError(
          response.status,
          'delete-failed',
          'The Meal Image could not be deleted.',
        );
      }
    },
  };
};
