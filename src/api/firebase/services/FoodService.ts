// FoodService.ts
import firestore from '@react-native-firebase/firestore';
import {BgSample} from 'app/types/day_bgs.types';
import {
  getLocalStartOfTheDay,
  getLocalEndOfTheDay,
} from 'app/utils/datetime.utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getBgDataByDate} from '../functions/getBgByDate';
import {FoodItemDTO} from 'app/types/food.types';

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
    // Convert start and end dates to timestamps
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

  async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    const currentTime = new Date();
    const startDate = new Date(foodItem.timestamp);
    startDate.setHours(startDate.getHours() - 1);
    const endDate = new Date(foodItem.timestamp);
    endDate.setHours(endDate.getHours() + 4);

    if (currentTime >= endDate) {
      const cacheKey = `bgData-${foodItem.timestamp}`;
      const cachedBgData = await AsyncStorage.getItem(cacheKey);
      if (cachedBgData) {
        return JSON.parse(cachedBgData);
      }
    }

    // Fetch BG data and cache if not already cached
    const bgData = await getBgDataByDate({startDate, endDate});
    if (currentTime >= endDate) {
      await AsyncStorage.setItem(
        `bgData-${foodItem.timestamp}`,
        JSON.stringify(bgData),
      );
    }
    return bgData;
  }
}
