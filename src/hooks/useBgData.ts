// hooks/useBgData.ts
import {useState, useEffect} from 'react';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {BgSample} from 'app/types/day_bgs';
import {bgSortFunction} from 'app/utils/bg.utils';

export const useBgData = (currentDate: Date) => {
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [todayBgData, setTodayBgData] = useState<BgSample[]>([]);
  const [latestBgSample, setLatestBgSample] = useState<BgSample>();
  const [isLoading, setIsLoading] = useState(true);

  const isShowingToday = (): boolean => {
    const today = new Date();
    return (
      today.getFullYear() === currentDate.getFullYear() &&
      today.getMonth() === currentDate.getMonth() &&
      today.getDate() === currentDate.getDate()
    );
  };

  const getBgDataByDate = async (date?: Date): Promise<void> => {
    setIsLoading(true);
    const fsManager = new FirebaseService();
    const bgData = await fsManager.getBgDataByDate({
      endDate: date ?? new Date(),
      getWholeDays: true,
    });
    const sortedBgData = bgData.sort(bgSortFunction(false));
    if (!date || isShowingToday()) {
      setTodayBgData(sortedBgData);
      if (isShowingToday()) {
        setBgData(sortedBgData);
      }
    } else {
      setBgData(sortedBgData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    getBgDataByDate(currentDate);
  }, [currentDate]);

  useEffect(() => {
    if (
      todayBgData?.length &&
      (!latestBgSample || todayBgData[0].date > latestBgSample?.date)
    ) {
      setLatestBgSample(todayBgData[0]);
    }
  }, [todayBgData]);

  return {
    bgData,
    todayBgData,
    latestBgSample,
    isLoading,
    getBgDataByDate,
    getUpdatedBgData: () => getBgDataByDate(currentDate),
  };
};
