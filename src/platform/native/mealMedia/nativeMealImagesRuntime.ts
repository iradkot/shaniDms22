import {sha1} from 'js-sha1';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {
  MEAL_IMAGE_MAX_BYTES,
  DurableMealImageDeletionQueue,
  OfflineFirstMealImageStore,
  type MealImagePickResult,
  type MealImagesRuntime,
} from '../../../modules/mealMedia';
import {createFirebaseMealImageRemoteAdapter} from './firebaseMealImageRemoteAdapter';
import {createReactNativeFirebaseMealImageGateway} from './reactNativeFirebaseMealImageGateway';
import {createReactNativeFsMealImageFileAdapter} from './reactNativeFsMealImageFileAdapter';
import {createQueuedMealImageRemoteAdapter} from './queuedMealImageRemoteAdapter';

let sequence = 0;
const objectNames = {
  next: (): string => {
    sequence += 1;
    return `image_${sha1(
      `${Date.now()}:${sequence}:${Math.random()}`,
    ).slice(0, 32)}`;
  },
};

const firebaseRemote = createFirebaseMealImageRemoteAdapter(
  createReactNativeFirebaseMealImageGateway(),
);
const queuedRemote = createQueuedMealImageRemoteAdapter(
  firebaseRemote,
  new DurableMealImageDeletionQueue(AsyncStorage),
);

export const nativeMealImageStore = new OfflineFirstMealImageStore({
  files: createReactNativeFsMealImageFileAdapter(),
  objectNames,
  remote: queuedRemote.adapter,
});

const pick = async (
  source: 'camera' | 'library',
): Promise<MealImagePickResult> => {
  const options = {
    mediaType: 'photo' as const,
    quality: 0.8 as const,
    maxWidth: 1600,
    maxHeight: 1600,
    includeBase64: false,
    assetRepresentationMode: 'compatible' as const,
    ...(source === 'library' ? {selectionLimit: 1} : {saveToPhotos: false}),
  };
  const response =
    source === 'camera'
      ? await launchCamera(options)
      : await launchImageLibrary(options);
  if (response.didCancel) {
    return {kind: 'cancelled'};
  }
  if (response.errorCode !== undefined) {
    return {
      kind: 'error',
      code:
        response.errorCode === 'permission'
          ? 'permission_denied'
          : 'selection_failed',
      message:
        response.errorCode === 'permission'
          ? 'Camera or photo access was not granted.'
          : 'The image could not be selected.',
    };
  }
  const asset = response.assets?.[0];
  if (asset?.uri === undefined || asset.type === undefined) {
    return {
      kind: 'error',
      code: 'unavailable',
      message: 'The selected image is unavailable.',
    };
  }
  if (asset.fileSize !== undefined && asset.fileSize > MEAL_IMAGE_MAX_BYTES) {
    return {
      kind: 'error',
      code: 'too_large',
      message: 'Meal Images must be 10 MB or smaller.',
    };
  }
  return {
    kind: 'selected',
    image: {
      uri: asset.uri,
      mimeType: asset.type,
      ...(asset.fileName === undefined ? {} : {fileName: asset.fileName}),
      ...(asset.fileSize === undefined ? {} : {byteSize: asset.fileSize}),
      ...(asset.width === undefined ? {} : {widthPx: asset.width}),
      ...(asset.height === undefined ? {} : {heightPx: asset.height}),
    },
  };
};

export const nativeMealImagesRuntime: MealImagesRuntime = {
  store: nativeMealImageStore,
  pick,
  resolve: image => nativeMealImageStore.resolveMealImageUri(image),
};

export const retryPendingNativeMealImageDeletions =
  queuedRemote.retryPendingDeletions;
