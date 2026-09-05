import {getApp} from '@react-native-firebase/app';
import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  getStorage,
  putFile,
  ref,
} from '@react-native-firebase/storage';
import type {MealImageStorageGateway} from './firebaseMealImageRemoteAdapter';

export const createReactNativeFirebaseMealImageGateway = (): MealImageStorageGateway => {
  const storage = () => getStorage(getApp());
  return {
    async inspect(objectPath) {
      const metadata = await getMetadata(ref(storage(), objectPath));
      return {
        ...(metadata.contentType === undefined || metadata.contentType === null
          ? {}
          : {contentType: metadata.contentType}),
        size: metadata.size,
        ...(metadata.customMetadata === undefined ||
        metadata.customMetadata === null
          ? {}
          : {customMetadata: metadata.customMetadata}),
      };
    },
    async upload(input) {
      await putFile(ref(storage(), input.objectPath), input.localUri, {
        contentType: input.mimeType,
        customMetadata: {...input.customMetadata},
        cacheControl: 'private,max-age=604800',
      });
    },
    resolve: objectPath => getDownloadURL(ref(storage(), objectPath)),
    remove: objectPath => deleteObject(ref(storage(), objectPath)),
  };
};
