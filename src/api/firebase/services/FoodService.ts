// FoodService.ts
import firestore from '@react-native-firebase/firestore';
import {BgSample} from 'app/types/day_bgs.types';
import {
  getLocalStartOfTheDay,
  getLocalEndOfTheDay,
} from 'app/utils/datetime.utils';
import {FoodItemDTO} from 'app/types/food.types';
import BGDataService from 'app/api/firebase/services/BGDataService';
import {fetchBgDataForDateRange} from 'app/api/apiRequests';

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

    const snapshot = await firestore()
      .collection('food_items')
      .where('timestamp', '>=', startTimestamp)
      .where('timestamp', '<=', endTimestamp)
      .get();

    return snapshot.docs.map(doc => doc.data() as FoodItemDTO);
  }

  // Replace the existing getBgDataByDate method with a call to BGDataService
  static async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    const numberOfHoursBefore = 1;
    const numberOfHoursAfter = 6;
    const startDate = new Date(
      foodItem.timestamp - numberOfHoursBefore * 3600 * 1000,
    );
    const endDate = new Date(
      foodItem.timestamp + numberOfHoursAfter * 3600 * 1000,
    ); // 4 hours after

    return fetchBgDataForDateRange(startDate, endDate);
  }
}
