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
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_BG_COUNT = 1000;
const MAX_BG_COUNT = 100000;
const EXPECTED_READINGS_PER_DAY = 288; // 5-minute CGM
const HIGH_FREQUENCY_READINGS_PER_DAY = 1440; // 1-minute CGM

const estimateBgCountForRange = (startDate: Date, endDate: Date) => {
  const days = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1,
  );

  // For longer ranges, it's common to have 1-minute CGM. If we under-estimate,
  // Nightscout will truncate the *earliest* readings which breaks month TIR.
  const expectedPerDay = days >= 20 ? HIGH_FREQUENCY_READINGS_PER_DAY : EXPECTED_READINGS_PER_DAY;

  // Add a bit of slack for sensors that report slightly faster / duplicates.
  const estimate = Math.ceil(days * expectedPerDay * 1.1);
  return Math.min(MAX_BG_COUNT, Math.max(DEFAULT_BG_COUNT, estimate));
};

export const fetchBgDataForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<BgSample[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count = estimateBgCountForRange(startDate, endDate);
  const cacheKey: string = `bgData-${startIso}-${endIso}-v2-count=${count}`;
  // Attempt to read from cache
  let cachedData: string | null = null;
  try {
    cachedData = await AsyncStorage.getItem(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  } catch (e) {
    console.warn('fetchBgDataForDateRange: Failed reading cache', e);
  }
  const apiUrl: string = `/api/v1/entries?find[dateString][$gte]=${startIso}&find[dateString][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<BgSample[]>(apiUrl);
    const bgData: BgSample[] = response.data;
    const sortedBgData: BgSample[] = bgData.sort(bgSortFunction(false));

    // Attempt to cache results, with graceful handling if storage is full
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(sortedBgData));
    } catch (e: any) {
      console.warn('fetchBgDataForDateRange: Failed caching BG data', e);
      // If storage is full, purge old BG cache entries
      const errMsg = e.message || e;
      if (errMsg.includes('SQLITE_FULL') || errMsg.includes('database or disk is full')) {
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const bgKeys = allKeys.filter(key => key.startsWith('bgData-'));
          if (bgKeys.length) {
            await AsyncStorage.multiRemove(bgKeys);
            console.info('fetchBgDataForDateRange: Cleared old BG cache entries');
          }
        } catch (purgeErr) {
          console.error('fetchBgDataForDateRange: Failed to purge old cache', purgeErr);
        }
      }
    }
    return sortedBgData;
  } catch (error: any) {
    console.error('Error fetching BG data from Nightscout:', error);
    throw error;
  }
};

/**
 * Fetch BG entries for a range without writing to AsyncStorage.
 *
 * Oracle PRD: the Oracle feature maintains its own stable local cache and
 * performs incremental sync; we avoid polluting the generic date-range cache
 * keys (which would change on every run for rolling windows).
 */
export const fetchBgDataForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number},
): Promise<BgSample[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateBgCountForRange(startDate, endDate);

  const apiUrl: string = `/api/v1/entries?find[dateString][$gte]=${startIso}&find[dateString][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<BgSample[]>(apiUrl);
    const bgData: BgSample[] = response.data ?? [];
    return bgData.sort(bgSortFunction(false));
  } catch (error: any) {
    console.warn('fetchBgDataForDateRangeUncached: Failed to fetch BG data', error);
    return [];
  }
};

const DEFAULT_TREATMENTS_COUNT = 1000;
const MAX_TREATMENTS_COUNT = 50000;
const EXPECTED_TREATMENTS_PER_DAY = 80;

const estimateTreatmentsCountForRange = (startDate: Date, endDate: Date) => {
  const days = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1,
  );

  const estimate = Math.ceil(days * EXPECTED_TREATMENTS_PER_DAY * 1.2);
  return Math.min(MAX_TREATMENTS_COUNT, Math.max(DEFAULT_TREATMENTS_COUNT, estimate));
};

/**
 * Fetch treatments for a range without writing to AsyncStorage.
 *
 * Oracle PRD: the Oracle feature maintains its own stable local cache.
 */
export const fetchTreatmentsForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number},
): Promise<any[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateTreatmentsCountForRange(startDate, endDate);

  const apiUrl = `/api/v1/treatments?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<any[]>(apiUrl);
    return response.data ?? [];
  } catch (error: any) {
    console.warn('fetchTreatmentsForDateRangeUncached: Failed to fetch treatments', error);
    return [];
  }
};

/**
 * Fetch device status entries for a range without writing to AsyncStorage.
 *
 * Device status is optional; returns [] on failure.
 */
export const fetchDeviceStatusForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number},
): Promise<DeviceStatusEntry[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateBgCountForRange(startDate, endDate);

  const apiUrl = `/api/v1/devicestatus?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<DeviceStatusEntry[]>(apiUrl);
    return response.data ?? [];
  } catch (error: any) {
    console.warn(
      'fetchDeviceStatusForDateRangeUncached: Failed to fetch device status',
      error,
    );
    return [];
  }
};

/**
 * Fetches the most recent BG entry from Nightscout.
 *
 * PRD: uses `/api/v1/entries.json?count=1`.
 * Returns `null` when the request fails or no entries are available.
 */
export const fetchLatestBgEntry = async (): Promise<BgSample | null> => {
  try {
    const response = await nightscoutInstance.get<BgSample[]>(
      '/api/v1/entries.json?count=1',
    );
    return response.data?.[0] ?? null;
  } catch (error: any) {
    console.warn('fetchLatestBgEntry: Failed to fetch latest BG entry', error);
    return null;
  }
};

/**
 * Fetches the most recent device status entry from Nightscout.
 *
 * PRD: uses `/api/v1/devicestatus.json?count=1`.
 * Device status is optional; returns `null` on failure.
 */
export const fetchLatestDeviceStatusEntry = async (): Promise<DeviceStatusEntry | null> => {
  try {
    const response = await nightscoutInstance.get<DeviceStatusEntry[]>(
      '/api/v1/devicestatus.json?count=1',
    );
    return response.data?.[0] ?? null;
  } catch (error: any) {
    console.warn(
      'fetchLatestDeviceStatusEntry: Failed to fetch latest device status',
      error,
    );
    return null;
  }
};

export const fetchDeviceStatusForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<DeviceStatusEntry[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Device status is usually emitted every ~5 minutes.
  const count = estimateBgCountForRange(startDate, endDate);
  const cacheKey: string = `deviceStatus-${startIso}-${endIso}-v1-count=${count}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('fetchDeviceStatusForDateRange: Failed reading cache', e);
  }

  const apiUrl = `/api/v1/devicestatus?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<DeviceStatusEntry[]>(apiUrl);
    const status = response.data ?? [];

    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(status));
    } catch (e) {
      console.warn('fetchDeviceStatusForDateRange: Failed caching device status', e);
    }

    return status;
  } catch (error: any) {
    // Device status may not be enabled; treat as optional.
    console.warn('fetchDeviceStatusForDateRange: Failed to fetch device status', error);
    return [];
  }
};

export const fetchBgDataForDate = async (date: Date): Promise<BgSample[]> => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);

  const startDate = new Date(formattedStartDate);
  const endDate = new Date(formattedEndDate);

  try {
    return await fetchBgDataForDateRange(startDate, endDate);
  } catch (error: any) {
    console.warn('fetchBgDataForDate: Failed to fetch daily BG data', error);
    return [];
  }
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
  } catch (error: any) {
    console.error('Error fetching basal profile data from Nightscout:', error);
    throw error;
  }
};

export const fetchInsulinDataForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<InsulinDataEntry[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count = estimateTreatmentsCountForRange(startDate, endDate);
  const apiUrl = `/api/v1/treatments?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${count}`;

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
