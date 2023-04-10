import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {FoodItemDTO} from 'app/types/food.types';
import {useGetUser} from 'app/hooks/useGetUser';
import {PhotoFile} from 'react-native-vision-camera';
import {imagePathToUri} from 'app/utils/image.utils';

export interface EditFoodItem extends Omit<FoodItemDTO, 'image'> {
  image: PhotoFile;
}

export const useEditFoodItem: () => {
  editFoodItem: (foodItem: EditFoodItem) => Promise<FoodItemDTO>;
} = () => {
  const {userData} = useGetUser();

  const editFoodItem = useCallback(
    async (foodItem: EditFoodItem) => {
      try {
        const foodItemsCollectionRef = firestore()
          .collection('food_items')
          .doc(foodItem.id);
        const directGet = firestore().collection('food_items').doc(foodItem.id);
        const directGetResponse = await directGet.get();
        console.log('directGetResponse', directGetResponse);

        let downloadURL = foodItem.image.uri; // Set the download URL to the current image URI by default

        // If the image has changed, upload the new image to Firebase Storage and get its download URL
        if (foodItem.image.path !== undefined) {
          const imageRef = storage().ref(
            `food_item_images/${foodItemsCollectionRef.id}`,
          );
          await imageRef.putFile(imagePathToUri(foodItem.image.path), {
            contentType: 'image/jpeg',
          });
          downloadURL = await imageRef.getDownloadURL();
        }

        const foodItemRequest = {
          ...foodItem,
          image: downloadURL,
          timestamp: Number(foodItem.timestamp),
          related_user: firestore().collection('users').doc(userData?.id),
        };
        const foorItemResponse = await foodItemsCollectionRef.get();
        console.log('foorItemResponse', foorItemResponse);
        await foodItemsCollectionRef.update(foodItemRequest);

        const lastSavedFoodItem = await firestore()
          .collection('food_items')
          .doc(foodItemsCollectionRef.id)
          .get();
        return lastSavedFoodItem.data() as FoodItemDTO;
      } catch (error) {
        console.log('Error editing food item', error);
        throw error;
      }
    },
    [userData?.id],
  );

  return {
    editFoodItem,
  };
};
