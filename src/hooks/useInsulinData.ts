import { useState, useEffect } from 'react';
import { fetchInsulinDataForDateRange, getUserProfileFromNightscout } from 'app/api/apiRequests';
import { InsulinDataEntry, BasalProfile, ProfileDataType } from 'app/types/insulin.types';

export const useInsulinData = (date: Date) => {
  const [insulinData, setInsulinData] = useState<InsulinDataEntry[]>([]);
  const [basalProfileData, setBasalProfileData] = useState<BasalProfile>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const [insulinData, profileData] = await Promise.all([
          fetchInsulinDataForDateRange(startOfDay, endOfDay),
          getUserProfileFromNightscout(date.toISOString()),
        ]);

        setInsulinData(insulinData);

        // Extract basal profile from profile data
        const basalProfile = profileData[0]?.store?.[profileData[0]?.defaultProfile]?.basal || [];
        setBasalProfileData(basalProfile);

      } catch (error) {
        console.error('Error fetching insulin or basal profile data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [date]);

  return { insulinData, basalProfileData, isLoading };
};
