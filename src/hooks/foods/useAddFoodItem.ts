import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {FoodItemDTO} from 'app/types/food.types';
import {useGetUser} from 'app/hooks/useGetUser';
import {PhotoFile} from 'react-native-vision-camera';
import {imagePathToUri} from 'app/utils/image.utils';

export interface AddFoodItem extends Omit<FoodItemDTO, 'id' | 'image'> {
  image: PhotoFile;
}
export const useAddFoodItem: () => {
  addFoodItem: (foodItem: AddFoodItem) => Promise<FoodItemDTO>;
} = () => {
  const {userData} = useGetUser();
  const addFoodItem = useCallback(
    async (foodItem: AddFoodItem) => {
      try {
        const foodItemsCollectionRef = firestore()
          .collection('food_items')
          .doc();
        const imageRef = storage().ref(
          `food_item_images/${foodItemsCollectionRef.id}`,
        );
        await imageRef.putFile(imagePathToUri(foodItem.image.path), {
          contentType: 'image/jpeg',
        });
        const downloadURL = await imageRef.getDownloadURL();

        const foodItemRequest = {
          ...foodItem,
          id: foodItemsCollectionRef.id,
          image: downloadURL,
          timestamp: Number(foodItem.timestamp),
          related_user: firestore().collection('users').doc(userData?.id),
        };
        await foodItemsCollectionRef.set(foodItemRequest);

        const lastSavedFoodItem = await firestore()
          .collection('food_items')
          .doc(foodItemsCollectionRef.id)
          .get();
        return lastSavedFoodItem.data() as FoodItemDTO;
      } catch (error) {
        console.log('Error adding food item', error);
        throw error;
      }
    },
    [userData?.id],
  );

  return {
    addFoodItem,
  };
};
