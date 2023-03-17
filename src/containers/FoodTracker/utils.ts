import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// const formatDate = (timestamp: number) => {
//   const date = new Date(timestamp);
//   return date.toLocaleString();
// };
export const formatFoodItem = async (item, fsManager) => {
  const formattedItem = item;
  if (item.image) {
    const image = await fsManager.getFoodItemImage(item.image);
    if (image) {
      formattedItem.image = image;
    }
  }
  const cacheKey = `bgData-${item.id}`;
  const cachedBgData = await AsyncStorage.getItem(cacheKey);
  if (cachedBgData) {
    formattedItem.bgData = JSON.parse(cachedBgData);
  } else {
    formattedItem.bgData = await fsManager.getFoodItemBgData(item);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(formattedItem.bgData));
  }
  formattedItem.localDateString = formatDateToDateAndTimeString(item.timestamp);
  return formattedItem;
};
