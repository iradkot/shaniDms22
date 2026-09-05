import {useCallback} from 'react';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from '@react-native-firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  putFile,
  ref,
} from '@react-native-firebase/storage';
import {FoodItemDTO, AddFoodItem} from 'app/types/food.types';
import {imagePathToUri} from 'app/utils/image.utils';
export const useAddFoodItem: () => {
  addFoodItem: (foodItem: AddFoodItem) => Promise<FoodItemDTO>;
} = () => {
  const addFoodItem = useCallback(
    async (foodItem: AddFoodItem) => {
      try {
        const app = getApp();
        const user = getAuth(app).currentUser;
        if (!user) {
          throw new Error('Sign in before saving a meal.');
        }
        const database = getFirestore(app);
        const foodItemRef = doc(
          collection(database, 'users', user.uid, 'legacyFoodItems'),
        );
        const imageRef = ref(
          getStorage(app),
          `users/${user.uid}/food_item_images/${foodItemRef.id}`,
        );
        await putFile(imageRef, imagePathToUri(foodItem.image.path), {
          contentType: 'image/jpeg',
        });
        const downloadURL = await getDownloadURL(imageRef);

        const foodItemRequest = {
          ...foodItem,
          id: foodItemRef.id,
          image: downloadURL,
          timestamp: Number(foodItem.timestamp),
          schemaVersion: 1,
          ownerProductUserId: user.uid,
        };
        await setDoc(foodItemRef, foodItemRequest);

        const lastSavedFoodItem = await getDoc(foodItemRef);
        return lastSavedFoodItem.data() as FoodItemDTO;
      } catch (error) {
        console.log('Error adding food item', error);
        throw error;
      }
    },
    [],
  );

  return {
    addFoodItem,
  };
};
