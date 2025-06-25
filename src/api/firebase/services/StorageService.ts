// StorageService.ts
import { firebaseApp } from 'app/firebase';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class StorageService {
  /**
   * Retrieves the image URL from Firebase Storage.
   * Caches the URL in AsyncStorage to avoid repeated downloads.
   *
   * @param {string} imageName - The name of the image in the storage bucket.
   * @returns {Promise<string>} - The URL of the image.
   */
  async getFoodItemImage(imageName: string): Promise<string> {
    // Check if imageName is already a URL
    if (imageName.startsWith('http')) {
      return imageName; // Return the URL directly
    }

    // Proceed if imageName is not a URL (assumed to be a path within Firebase Storage)
    const fullPath = `food_item_images/${imageName}`;
    const cacheKey = `image-${imageName}`;
    try {
      const cachedUrl = await AsyncStorage.getItem(cacheKey);
      if (cachedUrl) {
        return cachedUrl;
      }
      console.log('fullPath', fullPath);
      const url = await getDownloadURL(ref(getStorage(firebaseApp), fullPath));
      await AsyncStorage.setItem(cacheKey, url);
      return url;
    } catch (error) {
      console.error('Failed to get image from Firebase Storage:', error);
      throw new Error('Could not retrieve image from storage.');
    }
  }
}

// Export an instance if you prefer to use it as a singleton
export default new StorageService();
