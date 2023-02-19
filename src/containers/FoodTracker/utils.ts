import {FoodItemDTO, formattedItemDTO} from 'app/types/food.types';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';

// const formatDate = (timestamp: number) => {
//   const date = new Date(timestamp);
//   return date.toLocaleString();
// };
export const formatFoodItem = async (
  item: FoodItemDTO,
  fsManager: FirebaseService,
): Promise<formattedItemDTO> => {
  const formattedItem = item as formattedItemDTO;
  if (!item.image) {
    return formattedItem;
  }
  const image = await fsManager.getFoodItemImage(item.image);
  if (image) {
    formattedItem.image = image;
  }
  formattedItem.bgData = await fsManager.getFoodItemBgData(item);
  formattedItem.localDateString = formatDateToDateAndTimeString(item.timestamp);
  return formattedItem;
};
