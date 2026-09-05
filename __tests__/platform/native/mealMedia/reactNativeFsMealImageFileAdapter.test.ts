import {
  copyFile,
  exists,
  mkdir,
  stat,
  unlink,
} from '@dr.pogodin/react-native-fs';
import {createReactNativeFsMealImageFileAdapter} from '../../../../src/platform/native/mealMedia/reactNativeFsMealImageFileAdapter';

const OBJECT_NAME = 'image_1234567890abcdef1234567890abcdef.jpg';
const LOCAL_URI =
  'file:///test-documents/meal-images/image_1234567890abcdef1234567890abcdef.jpg';

describe('React Native filesystem Meal Image adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(exists).mockResolvedValue(false);
    jest.mocked(stat).mockResolvedValue({
      path: LOCAL_URI,
      size: 1_024,
    } as Awaited<ReturnType<typeof stat>>);
  });

  it('stages only a managed immutable Meal Image destination', async () => {
    const adapter = createReactNativeFsMealImageFileAdapter();

    await expect(
      adapter.stage({
        sourceUri: 'content://picker/image',
        destinationName: OBJECT_NAME,
      }),
    ).resolves.toEqual({localUri: LOCAL_URI, byteSize: 1_024});
    expect(mkdir).toHaveBeenCalledWith('/test-documents/meal-images');
    expect(copyFile).toHaveBeenCalledWith(
      'content://picker/image',
      '/test-documents/meal-images/' + OBJECT_NAME,
    );
    await expect(
      adapter.stage({
        sourceUri: 'content://picker/image',
        destinationName: '../outside.jpg',
      }),
    ).rejects.toThrow('destination');
  });

  it('never deletes a path outside the app-owned Meal Image directory', async () => {
    jest.mocked(exists).mockResolvedValue(true);
    const adapter = createReactNativeFsMealImageFileAdapter();

    await adapter.remove(LOCAL_URI);
    expect(unlink).toHaveBeenCalledWith(
      '/test-documents/meal-images/' + OBJECT_NAME,
    );
    jest.mocked(unlink).mockClear();

    await expect(
      adapter.remove('file:///test-documents/private/credentials.json'),
    ).rejects.toThrow('not managed');
    expect(unlink).not.toHaveBeenCalled();
  });
});
