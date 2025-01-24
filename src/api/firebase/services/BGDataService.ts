import AsyncStorage from '@react-native-async-storage/async-storage';
import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {bgSortFunction} from 'app/utils/bg.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';

class BGDataService {
  static async fetchBgDataForDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<BgSample[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const cacheKey: string = `bgData-${startIso}-${endIso}`;
    const cachedData: string | null = await AsyncStorage.getItem(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }
    const apiUrl: string = `/api/v1/entries?find[dateString][$gte]=${startIso}&find[dateString][$lte]=${endIso}&count=1000`;
    try {
      const response = await nightscoutInstance.get<BgSample[]>(apiUrl);
      const bgData: BgSample[] = response.data;
      const sortedBgData: BgSample[] = bgData.sort(bgSortFunction(false));

      await AsyncStorage.setItem(cacheKey, JSON.stringify(sortedBgData));
      return sortedBgData;
    } catch (error) {
      console.error('Error fetching BG data from Nightscout:', error);
      throw error;
    }
  }

  static async fetchBgDataForDate(date: Date): Promise<BgSample[]> {
    // Use getFormattedStartEndOfDay to ensure localization is respected
    const {formattedStartDate, formattedEndDate} =
      getFormattedStartEndOfDay(date);

    // Convert the formatted dates back to Date objects for compatibility
    const startDate = new Date(formattedStartDate);
    const endDate = new Date(formattedEndDate);

    // Now, utilize the fetchBgDataForDateRange method
    return this.fetchBgDataForDateRange(startDate, endDate);
  }
}

export default BGDataService;
