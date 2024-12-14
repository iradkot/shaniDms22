import {useState, useEffect} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {bgSortFunction} from 'app/utils/bg.utils';
import { fetchBgDataForDateRange } from "app/api/apiRequests";

export const useBgDataRange = (startDate: Date, endDate: Date) => {
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function getBgData() {
      setIsLoading(true);
      const data = await fetchBgDataForDateRange(startDate, endDate);
      setBgData(data.sort(bgSortFunction(true)));
      setIsLoading(false);
    }
    getBgData();
  }, [startDate, endDate]);

  return {bgData, isLoading};
};
