import {useCallback} from 'react';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  updateDoc,
} from '@react-native-firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  putFile,
  ref,
} from '@react-native-firebase/storage';
import {FoodItemDTO} from 'app/types/food.types';
import {PhotoFile} from 'react-native-vision-camera';
import {imagePathToUri} from 'app/utils/image.utils';

export interface EditFoodItem extends Omit<FoodItemDTO, 'image'> {
  image: PhotoFile | {uri: string};
}

export const useEditFoodItem: () => {
  editFoodItem: (foodItem: EditFoodItem) => Promise<FoodItemDTO>;
} = () => {
  const editFoodItem = useCallback(
    async (foodItem: EditFoodItem) => {
      try {
        const app = getApp();
        const user = getAuth(app).currentUser;
        if (!user) {
          throw new Error('Sign in before editing a meal.');
        }
        const database = getFirestore(app);
        const foodItemRef = doc(
          database,
          'users',
          user.uid,
          'legacyFoodItems',
          foodItem.id,
        );

        let downloadURL = 'uri' in foodItem.image ? foodItem.image.uri : '';

        // If the image has changed, upload the new image to Firebase Storage and get its download URL
        if ('path' in foodItem.image) {
          const imageRef = ref(
            getStorage(app),
            `users/${user.uid}/food_item_images/${foodItemRef.id}`,
          );
          await putFile(imageRef, imagePathToUri(foodItem.image.path), {
            contentType: 'image/jpeg',
          });
          downloadURL = await getDownloadURL(imageRef);
        }

        const foodItemRequest = {
          ...foodItem,
          image: downloadURL,
          timestamp: Number(foodItem.timestamp),
          schemaVersion: 1,
          ownerProductUserId: user.uid,
        };
        await updateDoc(foodItemRef, foodItemRequest);

        const lastSavedFoodItem = await getDoc(foodItemRef);
        return lastSavedFoodItem.data() as FoodItemDTO;
      } catch (error) {
        console.log('Error editing food item', error);
        throw error;
      }
    },
    [],
  );

  return {
    editFoodItem,
  };
};
