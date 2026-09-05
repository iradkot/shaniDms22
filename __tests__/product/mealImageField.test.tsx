import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Image, Pressable} from 'react-native';
import {AppOwnedUriJournalMediaStore} from '../../src/modules/journal';
import type {
  MealImageInput,
  MealImageSnapshot,
} from '../../src/modules/journal';
import type {MealImagesRuntime} from '../../src/modules/mealMedia';
import {
  MealImageField,
  MealImagePreview,
} from '../../src/product/meals/MealImageField';

describe('Meal Image preview', () => {
  it('resolves an IndexedDB reference and releases the browser object URL', async () => {
    const image: MealImageSnapshot = {
      mimeType: 'image/jpeg',
      syncState: {
        kind: 'upload_pending',
        localUri: 'meal-image-idb://owner/workspace/meal/image.jpg',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      },
    };
    const release = jest.fn();
    const runtime: MealImagesRuntime = {
      store: new AppOwnedUriJournalMediaStore(),
      pick: jest.fn().mockResolvedValue({kind: 'cancelled'}),
      resolve: jest.fn().mockResolvedValue('blob:https://app.test/meal-image'),
      release,
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <MealImagePreview image={image} runtime={runtime} testID="preview" />,
      );
    });

    expect(runtime.resolve).toHaveBeenCalledWith(image);
    expect(tree!.root.findByType(Image).props.source).toEqual({
      uri: 'blob:https://app.test/meal-image',
    });
    act(() => tree!.unmount());
    expect(release).toHaveBeenCalledWith('blob:https://app.test/meal-image');
  });

  it('releases an unsaved browser picker URL when the form closes', async () => {
    const release = jest.fn();
    const runtime: MealImagesRuntime = {
      store: new AppOwnedUriJournalMediaStore(),
      pick: jest.fn().mockResolvedValue({
        kind: 'selected',
        image: {
          uri: 'blob:https://app.test/unsaved-meal-image',
          mimeType: 'image/jpeg',
          byteSize: 120,
        },
      }),
      resolve: jest.fn(),
      release,
    };
    const Harness = () => {
      const [value, setValue] = React.useState<
        MealImageInput | null | undefined
      >();
      return (
        <MealImageField
          disabled={false}
          locale="en"
          onChange={setValue}
          runtime={runtime}
          testIDPrefix="meal-create"
          value={value}
        />
      );
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    const library = tree!.root
      .findAllByProps({testID: 'meal-create-image-library'})
      .find(node => node.type === Pressable);
    await act(async () => library!.props.onPress());
    expect(tree!.root.findByType(Image).props.source).toEqual({
      uri: 'blob:https://app.test/unsaved-meal-image',
    });

    act(() => tree!.unmount());
    expect(release).toHaveBeenCalledWith(
      'blob:https://app.test/unsaved-meal-image',
    );
  });
});
