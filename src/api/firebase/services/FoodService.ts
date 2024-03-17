// FoodService.ts
import firestore from '@react-native-firebase/firestore';
import {BgSample} from 'app/types/day_bgs.types';
import {
  getLocalStartOfTheDay,
  getLocalEndOfTheDay,
} from 'app/utils/datetime.utils';
import {FoodItemDTO} from 'app/types/food.types';
import BGDataService from 'app/api/firebase/services/BGDataService';

export class FoodService {
  async getFoodItemsForSingleDay(date: Date): Promise<FoodItemDTO[]> {
    const startOfTheDay = getLocalStartOfTheDay(date);
    const endOfTheDay = getLocalEndOfTheDay(date);
    return this.queryFoodItems(startOfTheDay, endOfTheDay);
  }

  async getFoodItemsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<FoodItemDTO[]> {
    const startOfStartDate = getLocalStartOfTheDay(startDate);
    const endOfEndDate = getLocalEndOfTheDay(endDate);
    return this.queryFoodItems(startOfStartDate, endOfEndDate);
  }

  private async queryFoodItems(start: Date, end: Date): Promise<FoodItemDTO[]> {
    const startTimestamp = start.getTime();
    const endTimestamp = end.getTime();

    console.log(
      'Querying food items from:',
      startTimestamp,
      'to:',
      endTimestamp,
    );
    const snapshot = await firestore()
      .collection('food_items')
      .where('timestamp', '>=', startTimestamp)
      .where('timestamp', '<=', endTimestamp)
      .get();

    return snapshot.docs.map(doc => doc.data() as FoodItemDTO);
  }

  // Replace the existing getBgDataByDate method with a call to BGDataService
  static async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    console.log('start');
    const startDate = new Date(foodItem.timestamp - 3600 * 1000); // 1 hour before
    const endDate = new Date(foodItem.timestamp + 4 * 3600 * 1000); // 4 hours after

    console.log('foodItem', foodItem);
    console.log('item name:', foodItem.name);
    console.log('foodItem.timestamp', new Date(foodItem.timestamp));
    console.log('startDate', startDate);
    console.log('endDate', endDate);

    return BGDataService.fetchBgDataForDateRange(startDate, endDate);
  }
}
