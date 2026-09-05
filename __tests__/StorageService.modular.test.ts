import AsyncStorage from '@react-native-async-storage/async-storage';

const mockImageRef = {fullPath: 'food_item_images/meal.jpg'};
const mockGetDownloadUrl = jest.fn(
  async (_reference?: unknown) => 'https://cdn.example/meal.jpg',
);

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({name: '[DEFAULT]'}),
}));

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: () => ({app: '[DEFAULT]'}),
  ref: () => mockImageRef,
  getDownloadURL: (reference: unknown) => mockGetDownloadUrl(reference),
}));

import {StorageService} from '../src/api/firebase/services/StorageService';

describe('StorageService modular Firebase access', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns direct URLs without contacting Firebase Storage', async () => {
    const directUrl = 'https://images.example/already-resolved.jpg';

    await expect(
      new StorageService().getFoodItemImage(directUrl),
    ).resolves.toBe(directUrl);
    expect(mockGetDownloadUrl).not.toHaveBeenCalled();
  });

  it('caches a resolved Storage URL for later offline reads', async () => {
    const service = new StorageService();

    await expect(service.getFoodItemImage('meal.jpg')).resolves.toBe(
      'https://cdn.example/meal.jpg',
    );
    await expect(service.getFoodItemImage('meal.jpg')).resolves.toBe(
      'https://cdn.example/meal.jpg',
    );

    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
    expect(mockGetDownloadUrl).toHaveBeenCalledWith(mockImageRef);
    await expect(AsyncStorage.getItem('image-meal.jpg')).resolves.toBe(
      'https://cdn.example/meal.jpg',
    );
  });
});
