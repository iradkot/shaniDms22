import {useCallback, useEffect, useState} from 'react';

import {
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

export const useInsulinData = (date: Date) => {
  const [insulinData, setInsulinData] = useState<InsulinDataEntry[]>([]);
  const [basalProfileData, setBasalProfileData] = useState<BasalProfile>([]);
  const [carbTreatments, setCarbTreatments] = useState<FoodItemDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const getUpdatedInsulinData = useCallback(async () => {
    try {
      setIsLoading(true);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const [treatments, profileData] = await Promise.all([
        fetchTreatmentsForDateRangeUncached(startOfDay, endOfDay),
        getUserProfileFromNightscout(date.toISOString()),
      ]);

      const nextInsulinData: InsulinDataEntry[] =
        mapNightscoutTreatmentsToInsulinDataEntries(treatments);
      const nextCarbTreatments: FoodItemDTO[] =
        mapNightscoutTreatmentsToCarbFoodItems(treatments);

      setInsulinData(nextInsulinData);
      setCarbTreatments(nextCarbTreatments);

      // Extract basal profile from profile data
      setBasalProfileData(extractBasalProfileFromNightscoutProfileData(profileData));
    } catch (error) {
      console.error('Error fetching insulin or basal profile data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    getUpdatedInsulinData();
  }, [getUpdatedInsulinData]);

  return {insulinData, basalProfileData, carbTreatments, isLoading, getUpdatedInsulinData};
};
