import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';

export const formatFoodItem = async (
  item: FoodItemDTO,
  fsManager: FirebaseService,
): Promise<formattedFoodItemDTO> => {
  const formattedItem = item as formattedFoodItemDTO;
  if (item.image) {
    const image = await fsManager.getFoodItemImage(item.image);
    if (image) {
      formattedItem.image = image;
    }
  }

  formattedItem.bgData = await fsManager.getFoodItemBgData(item);
  formattedItem.localDateString = formatDateToDateAndTimeString(item.timestamp);
  return formattedItem;
};
