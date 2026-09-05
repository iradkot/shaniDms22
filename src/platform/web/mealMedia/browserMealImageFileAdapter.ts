import {
  MEAL_IMAGE_MAX_BYTES,
  type MealImageFileAdapter,
} from '../../../modules/mealMedia';
import type {JournalWorkspaceScope} from '../../../modules/journal';
import type {BrowserMealImageBlobRepository} from './browserMealImageBlobStore';

const OBJECT_NAME = /^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/;
const MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const prefixFor = (scope: JournalWorkspaceScope): string =>
  `meal-image-idb:${scope.productUserId}:${scope.workspaceId}:`;

export const browserMealImageLocalUri = (
  scope: JournalWorkspaceScope,
  objectName: string,
): string => {
  if (!OBJECT_NAME.test(objectName)) {
    throw new Error('The Meal Image object name is invalid.');
  }
  return `${prefixFor(scope)}${objectName}`;
};

export const isBrowserMealImageLocalUri = (
  scope: JournalWorkspaceScope,
  localUri: string,
): boolean =>
  localUri.startsWith(prefixFor(scope)) &&
  OBJECT_NAME.test(localUri.slice(prefixFor(scope).length));

export const createBrowserMealImageFileAdapter = (input: {
  readonly scope: JournalWorkspaceScope;
  readonly blobs: BrowserMealImageBlobRepository;
  readonly fetch?: typeof globalThis.fetch;
  readonly releasePickedUri?: (uri: string) => void;
  readonly timeoutMs?: number;
}): MealImageFileAdapter => {
  const request = input.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async stage({sourceUri, destinationName}) {
      if (!sourceUri.startsWith('blob:')) {
        throw new Error('The selected browser image is unavailable.');
      }
      const localUri = browserMealImageLocalUri(input.scope, destinationName);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? 10_000,
      );
      try {
        const response = await request(sourceUri, {signal: controller.signal});
        if (!response.ok) {
          throw new Error('The selected browser image is unavailable.');
        }
        const blob = await response.blob();
        if (
          blob.size <= 0 ||
          blob.size > MEAL_IMAGE_MAX_BYTES ||
          !MIME_TYPES.has(blob.type.toLocaleLowerCase('en-US'))
        ) {
          throw new Error('Meal Images must be a supported image up to 10 MB.');
        }
        await input.blobs.put(localUri, blob);
        return {localUri, byteSize: blob.size};
      } finally {
        clearTimeout(timeout);
        input.releasePickedUri?.(sourceUri);
      }
    },
    async remove(localUri) {
      if (!isBrowserMealImageLocalUri(input.scope, localUri)) {
        throw new Error('The local Meal Image URI is invalid.');
      }
      await input.blobs.remove(localUri);
    },
  };
};
