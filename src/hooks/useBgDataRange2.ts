// /Users/iradkotton/projects/shaniDms22/src/hooks/useBgDataRange2.ts
import {useState, useEffect} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {bgSortFunction} from 'app/utils/bg.utils';
import { fetchBgDataForDateRange } from "app/api/apiRequests";

export const useBgDataRange2 = (startDate: Date, endDate: Date) => {
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetchBgDataForDateRange(startDate, endDate)
      .then(data => {
        if (!isMounted) return;
        setBgData(data.sort(bgSortFunction(true)));
        setIsLoading(false);
      })
      .catch(err=>{
        console.error('Error fetching BG data range 2:',err);
        if (!isMounted) return;
        setIsLoading(false);
      });

    return ()=>{isMounted=false;};
  }, [startDate,endDate]);

  return {bgData, isLoading};
};
