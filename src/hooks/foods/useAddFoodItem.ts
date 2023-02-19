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
export const useAddFoodItem = () => {
  const {userData} = useGetUser();
  const addFoodItem = useCallback(
    async (foodItem: AddFoodItem) => {
      try {
        const foodItemRef = firestore().collection('food_items').doc();
        const imageRef = storage().ref(`food_item_images/${foodItemRef.id}`);
        await imageRef.putFile(imagePathToUri(foodItem.image.path), {
          contentType: 'image/jpeg',
        });
        const downloadURL = await imageRef.getDownloadURL();

        const foodItemRequest = {
          ...foodItem,
          id: foodItemRef.id,
          image: downloadURL,
          timestamp: Number(foodItem.timestamp),
          related_user: firestore().collection('users').doc(userData?.id),
        };
        await foodItemRef.set(foodItemRequest);
      } catch (error) {
        console.log('Error adding food item', error);
      }
    },
    [userData?.id],
  );

  return {
    addFoodItem,
  };
};
