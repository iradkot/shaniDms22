import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import FirebaseService from 'app/api/firebase/FirebaseService';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import {FoodService} from 'app/api/firebase/services/FoodService';

export const formatFoodItem = async (
  item: FoodItemDTO,
): Promise<formattedFoodItemDTO> => {
  const formattedItem = item as formattedFoodItemDTO;
  if (item.image) {
    const image = await FirebaseService.getFoodItemImage(item.image);
    if (image) {
      formattedItem.image = image;
    }
  }
  console.log('item name is', item.name);
  formattedItem.bgData = await FoodService.getFoodItemBgData(item);
  formattedItem.localDateString = formatDateToDateAndTimeString(item.timestamp);
  return formattedItem;
};
