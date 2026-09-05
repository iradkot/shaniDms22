import {
  DocumentDirectoryPath,
  copyFile,
  exists,
  mkdir,
  stat,
  unlink,
} from '@dr.pogodin/react-native-fs';
import type {MealImageFileAdapter} from '../../../modules/mealMedia';

const DIRECTORY = `${DocumentDirectoryPath}/meal-images`;
const OBJECT_NAME =
  /^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/;

const managedFilePathFromUri = (uri: string): string => {
  let path: string;
  try {
    path = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
  } catch {
    throw new Error('The Meal Image local URI is not managed by the app.');
  }
  const prefix = `${DIRECTORY}/`;
  if (!path.startsWith(prefix) || !OBJECT_NAME.test(path.slice(prefix.length))) {
    throw new Error('The Meal Image local URI is not managed by the app.');
  }
  return path;
};

export const createReactNativeFsMealImageFileAdapter = (): MealImageFileAdapter => ({
  async stage(input) {
    if (!OBJECT_NAME.test(input.destinationName)) {
      throw new Error('The Meal Image destination is invalid.');
    }
    await mkdir(DIRECTORY);
    const destination = `${DIRECTORY}/${input.destinationName}`;
    if (await exists(destination)) {
      throw new Error('The Meal Image destination already exists.');
    }
    await copyFile(input.sourceUri, destination);
    const details = await stat(destination);
    return {
      localUri: `file://${destination}`,
      byteSize: details.size,
    };
  },
  async remove(localUri) {
    const path = managedFilePathFromUri(localUri);
    if (await exists(path)) {
      await unlink(path);
    }
  },
});
