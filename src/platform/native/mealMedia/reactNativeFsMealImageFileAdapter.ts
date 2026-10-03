import {
  DocumentDirectoryPath,
  copyFile,
  exists,
  mkdir,
  stat,
  unlink,
} from '@dr.pogodin/react-native-fs';
import type {MealImageFileAdapter} from '../../../modules/mealMedia';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';

const DIRECTORY = `${DocumentDirectoryPath}/meal-images`;
const OBJECT_NAME = /^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/;

const blockedOwners = new Set<string>();
const stageTails = new Map<string, Promise<void>>();
export const blockNativeMealImageOwner = async (uid: string): Promise<void> => {
  blockedOwners.add(uid);
  await stageTails.get(uid)?.catch(() => undefined);
};
const ownStagedImage = <T>(
  uid: string,
  uri: string,
  copy: () => Promise<T>,
): Promise<T> => {
  const operation = (stageTails.get(uid) ?? Promise.resolve()).then(
    async () => {
      if (blockedOwners.has(uid)) {
        throw new Error('Account deletion is in progress.');
      }
      const key = `meal.image.ownership.v1:${uid}`;
      const raw = await AsyncStorage.getItem(key);
      const images: unknown = raw === null ? [] : JSON.parse(raw);
      if (
        !Array.isArray(images) ||
        images.some(image => typeof image !== 'string')
      ) {
        throw new Error('Invalid image ownership index.');
      }
      await AsyncStorage.setItem(
        key,
        JSON.stringify([...new Set([...images, uri])]),
      );
      return copy();
    },
  );
  stageTails.set(
    uid,
    operation.then(
      () => undefined,
      () => undefined,
    ),
  );
  return operation;
};

const managedFilePathFromUri = (uri: string): string => {
  let path: string;
  try {
    path = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
  } catch {
    throw new Error('The Meal Image local URI is not managed by the app.');
  }
  const prefix = `${DIRECTORY}/`;
  if (
    !path.startsWith(prefix) ||
    !OBJECT_NAME.test(path.slice(prefix.length))
  ) {
    throw new Error('The Meal Image local URI is not managed by the app.');
  }
  return path;
};

export const createReactNativeFsMealImageFileAdapter =
  (): MealImageFileAdapter => ({
    async stage(input) {
      const uid = getAuth(getApp()).currentUser?.uid;
      if (!uid) {
        throw new Error('Sign in before saving a Meal Image.');
      }
      if (!OBJECT_NAME.test(input.destinationName)) {
        throw new Error('The Meal Image destination is invalid.');
      }
      await mkdir(DIRECTORY);
      const destination = `${DIRECTORY}/${input.destinationName}`;
      if (await exists(destination)) {
        throw new Error('The Meal Image destination already exists.');
      }
      if (getAuth(getApp()).currentUser?.uid !== uid) {
        throw new Error('Account changed.');
      }
      // Record ownership BEFORE copying. Even an interrupted copy or failed
      // Journal save remains attributable and can be removed on account deletion.
      return ownStagedImage(uid, `file://${destination}`, async () => {
        if (getAuth(getApp()).currentUser?.uid !== uid) {
          throw new Error('Account changed.');
        }
        await copyFile(input.sourceUri, destination);
        const details = await stat(destination);
        return {localUri: `file://${destination}`, byteSize: details.size};
      });
    },
    async remove(localUri) {
      const path = managedFilePathFromUri(localUri);
      if (await exists(path)) {
        await unlink(path);
      }
    },
  });
