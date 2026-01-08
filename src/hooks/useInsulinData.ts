import {useCallback, useEffect, useState} from 'react';

import {
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';

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

      const nextInsulinData: InsulinDataEntry[] = (treatments ?? [])
        .map((t: any) => {
          if (
            t?.insulin &&
            ['Bolus', 'Meal Bolus', 'Correction Bolus', 'Combo Bolus'].includes(t?.eventType)
          ) {
            return {
              type: 'bolus',
              amount: t.insulin || t.amount || 0,
              timestamp: t.created_at,
            } satisfies InsulinDataEntry;
          }
          if (t?.eventType === 'Temp Basal') {
            const startTime = typeof t.created_at === 'string' ? t.created_at : undefined;
            const durationMin = typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : 0;
            const endTime =
              startTime && durationMin > 0
                ? new Date(Date.parse(startTime) + durationMin * 60_000).toISOString()
                : undefined;
            return {
              type: 'tempBasal',
              rate: t.rate || 0,
              duration: durationMin,
              startTime,
              endTime,
              timestamp: startTime,
            } satisfies InsulinDataEntry;
          }
          return null;
        })
        .filter(Boolean) as InsulinDataEntry[];

      const nextCarbTreatments: FoodItemDTO[] = (treatments ?? [])
        .map((t: any) => {
          const carbs = t?.carbs;
          if (typeof carbs !== 'number' || !Number.isFinite(carbs) || carbs <= 0) {
            return null;
          }
          const createdAt = t?.created_at;
          const ts = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
          if (!Number.isFinite(ts)) return null;

          const id = typeof t?._id === 'string' ? t._id : `carbs-${ts}-${carbs}`;
          return {
            id,
            carbs,
            name: 'Carbs',
            image: '',
            notes: '',
            score: 0,
            timestamp: ts,
          } satisfies FoodItemDTO;
        })
        .filter(Boolean) as FoodItemDTO[];

      setInsulinData(nextInsulinData);
      setCarbTreatments(nextCarbTreatments);

      // Extract basal profile from profile data
      const basalProfile =
        profileData?.[0]?.store?.[profileData?.[0]?.defaultProfile]?.basal || [];
      setBasalProfileData(basalProfile);
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
