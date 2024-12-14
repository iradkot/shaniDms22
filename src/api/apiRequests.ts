import { nightscoutInstance, nightScoutUrl } from "app/api/shaniNightscoutInstances";
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';
import {
  InsulinDataEntry,
  ProfileDataType,
  TempBasalInsulinDataEntry
} from "app/types/insulin.types";
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BgSample} from 'app/types/day_bgs.types';
import {bgSortFunction} from 'app/utils/bg.utils';

export const fetchBgDataForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<BgSample[]> => {
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
};

export const fetchBgDataForDate = async (date: Date): Promise<BgSample[]> => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);

  const startDate = new Date(formattedStartDate);
  const endDate = new Date(formattedEndDate);

  return fetchBgDataForDateRange(startDate, endDate);
};

export const getInsulinData = async (
  date: Date,
): Promise<TempBasalInsulinDataEntry[]> => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);
  const maxCount = 1000;
  return `/api/v1/treatments?find[created_at][$gte]=${formattedStartDate}&find[created_at][$lte]=${formattedEndDate}&count=${maxCount}`;
};

export const getInsulinDataFromNightscout = async (
  dateStr: string,
  setIsLoading: (isLoading: boolean) => void = () => {},
): Promise<TempBasalInsulinDataEntry[]> => {
  // Adjusted return type to match expected data structure
  try {
    setIsLoading(true);
    const response = await fetch(
      `${nightScoutUrl}/api/v1/treatments?find[created_at][$gte]=${dateStr}T00:00:00Z&find[created_at][$lte]=${dateStr}T23:59:59Z&count=10`,
    );
    if (!response.ok) throw new Error('Failed to fetch insulin data');
    const data: TempBasalInsulinDataEntry[] = await response.json(); // Ensure the type matches what you expect based on the API response
    setIsLoading(false);
    return data; // Ensure this data is in the format your application expects
  } catch (error) {
    setIsLoading(false);
    console.error('Error fetching insulin data:', error);
    console.log('error data:', error.data);
    throw error; // Propagate error up for handling elsewhere
  }
};

export const getUserProfileFromNightscout = async (
  date: string,
): Promise<ProfileDataType> => {
  // Date conversion if needed
  const formattedDate = date.split('T')[0]; // Assuming you need just the date part in YYYY-MM-DD format

  // Constructing the API URL with the formatted date
  const apiUrl = `/api/v1/profiles?find[startDate][$lt]=${formattedDate}T23:59:59.999Z&find[startDate][$gt]=${formattedDate}T00:00:00.000Z&sort[startDate]=-1&count=10`;
  console.log(`Fetching basal profile data from Nightscout: ${apiUrl}`);

  try {
    // Using the nightscoutInstance to perform the GET request
    const response = await nightscoutInstance.get(apiUrl);
    if (response.status !== 200) {
      throw new Error('Failed to fetch profile data');
    }
    // Assuming the response data directly matches the ProfileDataType structure
    return response.data as ProfileDataType;
  } catch (error) {
    console.error('Error fetching basal profile data from Nightscout:', error);
    throw error; // Propagate the error for handling elsewhere
  }
};

export const fetchInsulinDataForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<InsulinDataEntry[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const apiUrl = `/api/v1/treatments?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=1000`;

  try {
    const response = await nightscoutInstance.get<any[]>(apiUrl);
    const treatments = response.data;

    const insulinData: InsulinDataEntry[] = treatments
      .map(t => {
        // Identify bolus events
        if (
          t.insulin && // Ensure there's an insulin amount
          ['Bolus', 'Meal Bolus', 'Correction Bolus', 'Combo Bolus'].includes(t.eventType)
        ) {
          return {
            type: 'bolus',
            amount: t.insulin || t.amount || 0,
            timestamp: t.created_at,
          };
        } else if (t.eventType === 'Temp Basal') {
          return {
            type: 'tempBasal',
            rate: t.rate || 0,
            duration: t.duration || 0, // Duration in minutes
            timestamp: t.created_at,
          };
        } else {
          return null; // Ignore other types
        }
      })
      .filter(Boolean) as InsulinDataEntry[];


    return insulinData;
  } catch (error) {
    console.error('Error fetching insulin data:', error);
    throw error;
  }
};
